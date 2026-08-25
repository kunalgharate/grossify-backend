const { prisma } = require('../../shared/database');
const { NotFoundError, BadRequestError, ForbiddenError } = require('../../shared/errors');
const { STAFF_DB_ROLE_NAMES } = require('../../shared/roles');
const { validateTransition, canCancel, getRefundPercentage } = require('./order.workflow');
const razorpayService = require('../payments/razorpay.service');
const inventoryService = require('../products/inventory.service');
const config = require('../../shared/config');
const {
  emitNewOrder,
  emitOrderStatus,
  emitDeliveryAvailable,
} = require('../../websocket/socket.handlers');

/**
 * True if the user holds a staff RBAC role (admin/manager/support). Used to let
 * back-office staff view/act on any order without owning it.
 */
const isPrivileged = async (userId) => {
  const count = await prisma.userRole.count({
    where: { userId, role: { name: { in: STAFF_DB_ROLE_NAMES } } },
  });
  return count > 0;
};

/**
 * Authorize read access to an order: the customer who placed it, the store
 * owner, the assigned delivery agent, or staff. Throws ForbiddenError otherwise.
 */
const assertCanView = async (order, user) => {
  if (order.customerId === user.id) return;
  if (order.store && order.store.ownerId === user.id) return;
  if (order.deliveryAgentId && order.deliveryAgentId === user.id) return;
  if (await isPrivileged(user.id)) return;
  throw new ForbiddenError('You do not have access to this order');
};

/**
 * Place a new order
 */
const place = async (customerId, data) => {
  const { storeId, items, addressId, paymentMethod, couponCode, notes } = data;

  if (!storeId || !items || items.length === 0 || !addressId || !paymentMethod) {
    throw new BadRequestError('Required: storeId, items, addressId, paymentMethod');
  }
  if (!['COD', 'ONLINE'].includes(paymentMethod)) {
    throw new BadRequestError('Unsupported payment method (use COD or ONLINE)');
  }

  // Verify store is active and open
  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) throw new NotFoundError('Store not found');
  if (store.status !== 'ACTIVE') throw new BadRequestError('Store is not active');
  if (!store.isOpen) throw new BadRequestError('STORE_CLOSED');

  // Verify address belongs to customer
  const address = await prisma.address.findFirst({ where: { id: addressId, userId: customerId } });
  if (!address) throw new BadRequestError('Invalid delivery address');

  // Fetch products and calculate totals
  let subtotal = 0;
  const orderItems = [];

  for (const item of items) {
    if (!item.productId || !Number.isInteger(item.quantity) || item.quantity < 1) {
      throw new BadRequestError('Each item requires productId and quantity >= 1');
    }
    const product = await prisma.product.findUnique({
      where: { id: item.productId },
      include: { variants: true },
    });

    if (!product || product.status !== 'ACTIVE') {
      throw new BadRequestError(`Product not found: ${item.productId}`);
    }
    if (!product.isAvailable || product.stockQuantity < item.quantity) {
      throw new BadRequestError(`ITEM_OUT_OF_STOCK: ${product.name}`);
    }

    let unitPrice = parseFloat(product.sellingPrice);
    if (item.variantId) {
      const variant = product.variants.find(v => v.id === item.variantId);
      if (variant && variant.priceOverride) unitPrice = parseFloat(variant.priceOverride);
    }

    const totalPrice = unitPrice * item.quantity;
    subtotal += totalPrice;

    orderItems.push({
      productId: item.productId,
      variantId: item.variantId || null,
      productName: product.name,
      quantity: item.quantity,
      unitPrice,
      totalPrice,
    });
  }

  // Calculate fees
  const convenienceFee = Math.round(subtotal * 0.02 * 100) / 100; // 2%
  let discount = 0;
  let appliedOffer = null;

  // Validate coupon (usage is committed inside the transaction, below)
  if (couponCode) {
    const offer = await prisma.offer.findFirst({
      where: {
        OR: [{ code: couponCode }, { code: couponCode.toUpperCase() }],
        isActive: true,
        validFrom: { lte: new Date() },
        validUntil: { gte: new Date() },
        storeId,
      },
    });

    if (!offer) throw new BadRequestError('Invalid or expired coupon code');
    if (offer.usageLimit && offer.usedCount >= offer.usageLimit) {
      throw new BadRequestError('Coupon usage limit reached');
    }
    if (offer.minOrderValue && subtotal < parseFloat(offer.minOrderValue)) {
      throw new BadRequestError(`Minimum order value ₹${offer.minOrderValue} required for this coupon`);
    }

    if (offer.discountType === 'percentage') {
      discount = Math.round(subtotal * parseFloat(offer.discountValue) / 100 * 100) / 100;
      if (offer.maxDiscount && discount > parseFloat(offer.maxDiscount)) {
        discount = parseFloat(offer.maxDiscount);
      }
    } else {
      discount = parseFloat(offer.discountValue);
    }
    appliedOffer = offer;
  }

  const total = Math.round((subtotal + convenienceFee - discount) * 100) / 100;

  // Generate order number
  const date = new Date();
  const dateStr = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  const orderNumber = `GRS-${dateStr}-${random}`;

  // For ONLINE payments, create the Razorpay order BEFORE writing to the DB so a
  // gateway failure never leaves a dangling, unpayable order. The Razorpay order
  // simply expires unused if the DB transaction below fails.
  let rzpOrder = null;
  if (paymentMethod === 'ONLINE') {
    if (razorpayService.isConfigured()) {
      try {
        rzpOrder = await razorpayService.createOrder(total, orderNumber);
      } catch (e) {
        console.error('[Razorpay] Order creation failed:', e.message);
        throw new BadRequestError('PAYMENT_INIT_FAILED: could not start online payment, please retry or use COD');
      }
    } else if (config.nodeEnv === 'production') {
      // Never silently accept an unpayable online order in production.
      throw new BadRequestError('PAYMENT_UNAVAILABLE: online payment is not configured');
    }
    // Non-production without credentials: proceed without a gateway order (local dev/testing).
  }

  // Create order + deduct stock + commit coupon usage + create payment, atomically.
  const { order, payment } = await prisma.$transaction(async (tx) => {
    // Lock each product row and deduct stock (prevents overselling under concurrency)
    for (const item of items) {
      await inventoryService.lockAndDeduct(tx, item.productId, item.quantity);
    }

    // Commit coupon usage now that the order is actually being created
    if (appliedOffer) {
      await tx.offer.update({ where: { id: appliedOffer.id }, data: { usedCount: { increment: 1 } } });
    }

    const newOrder = await tx.order.create({
      data: {
        orderNumber,
        customerId,
        storeId,
        addressId,
        status: 'PLACED',
        subtotal,
        convenienceFee,
        discount,
        total,
        paymentMethod,
        paymentStatus: 'PENDING',
        notes: notes || null,
        items: { create: orderItems },
      },
      include: { items: true },
    });

    let newPayment = null;
    if (paymentMethod === 'ONLINE' && rzpOrder) {
      newPayment = await tx.payment.create({
        data: {
          orderId: newOrder.id,
          razorpayOrderId: rzpOrder.id,
          amount: total,
          status: 'PENDING',
        },
      });
    }

    return { order: newOrder, payment: newPayment };
  });

  // Emit real-time event to vendor
  emitNewOrder(storeId, order);

  // Create notification for vendor (best-effort)
  const storeOwner = await prisma.store.findUnique({ where: { id: storeId }, select: { ownerId: true } });
  if (storeOwner) {
    await prisma.notification.create({
      data: { userId: storeOwner.ownerId, title: 'New Order!', body: `Order ${order.orderNumber} received.`, type: 'order', data: { orderId: order.id } },
    }).catch(() => {});
  }

  // Params the client needs to open Razorpay checkout (public key_id is safe to expose)
  const checkout = paymentMethod === 'ONLINE' && rzpOrder
    ? {
        razorpayKeyId: config.razorpay.keyId || null,
        razorpayOrderId: rzpOrder.id,
        amount: Math.round(total * 100), // paise
        currency: 'INR',
      }
    : null;

  return { order, payment, checkout };
};

/**
 * List orders for a user
 */
const list = async (userId, { page = 1, limit = 20, status }) => {
  const pageNum = parseInt(page);
  const limitNum = Math.min(parseInt(limit) || 20, 50);
  const skip = (pageNum - 1) * limitNum;

  const where = { customerId: userId };
  if (status) where.status = status;

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      skip,
      take: limitNum,
      orderBy: { placedAt: 'desc' },
      include: {
        store: { select: { id: true, name: true, slug: true, logoUrl: true } },
        items: { select: { productName: true, quantity: true, totalPrice: true } },
      },
    }),
    prisma.order.count({ where }),
  ]);

  return {
    orders,
    pagination: { page: pageNum, limit: limitNum, total, hasNext: skip + limitNum < total },
  };
};

/**
 * Get single order (ownership-checked)
 */
const getById = async (orderId, user) => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: true,
      store: { select: { id: true, name: true, slug: true, phone: true, ownerId: true } },
      address: true,
      payment: true,
    },
  });

  if (!order) throw new NotFoundError('Order not found');
  await assertCanView(order, user);
  return order;
};

/**
 * Update order status (vendor / delivery workflow, authorization-checked)
 */
const updateStatus = async (orderId, newStatus, user) => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { store: { select: { ownerId: true } } },
  });
  if (!order) throw new NotFoundError('Order not found');

  // Authorization: store owner drives ACCEPTED/PREPARING/READY; the assigned
  // delivery agent (or the owner, until the delivery app ships) drives
  // PICKED/DELIVERED; staff (admin/manager/support) may override.
  const isOwner = order.store && order.store.ownerId === user.id;
  const isAssignedAgent = order.deliveryAgentId && order.deliveryAgentId === user.id;
  if (!(await isPrivileged(user.id))) {
    const vendorStage = ['ACCEPTED', 'PREPARING', 'READY'].includes(newStatus);
    const deliveryStage = ['PICKED', 'DELIVERED'].includes(newStatus);
    const allowed = (vendorStage && isOwner) || (deliveryStage && (isAssignedAgent || isOwner));
    if (!allowed) throw new ForbiddenError('Not allowed to set this status');
  }

  validateTransition(order.status, newStatus);

  const timestamps = {};
  if (newStatus === 'ACCEPTED') timestamps.acceptedAt = new Date();
  if (newStatus === 'PREPARING') timestamps.preparingAt = new Date();
  if (newStatus === 'READY') timestamps.readyAt = new Date();
  if (newStatus === 'PICKED') timestamps.pickedAt = new Date();
  if (newStatus === 'DELIVERED') timestamps.deliveredAt = new Date();

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: { status: newStatus, ...timestamps },
  });

  // Emit real-time status change to customer
  emitOrderStatus(order.customerId, orderId, newStatus);
  // When ready for pickup, notify the delivery pool (auto-assignment lands in Slice 3)
  if (newStatus === 'READY') emitDeliveryAvailable(updated);

  return updated;
};

/**
 * Cancel order (authorization-checked; restores stock)
 */
const cancel = async (orderId, user, reason) => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true, store: { select: { ownerId: true } } },
  });

  if (!order) throw new NotFoundError('Order not found');

  // Authorization: the customer who placed it, the store owner, or staff.
  const isCustomer = order.customerId === user.id;
  const isOwner = order.store && order.store.ownerId === user.id;
  if (!isCustomer && !isOwner && !(await isPrivileged(user.id))) {
    throw new ForbiddenError('You cannot cancel this order');
  }

  if (!canCancel(order.status)) {
    throw new BadRequestError('Order cannot be cancelled at this stage');
  }

  const refundPercentage = getRefundPercentage(order.status);

  // Restore stock + mark cancelled, atomically
  await prisma.$transaction(async (tx) => {
    for (const item of order.items) {
      await inventoryService.restoreStock(tx, item.productId, item.quantity);
    }

    await tx.order.update({
      where: { id: orderId },
      data: {
        status: 'CANCELLED',
        cancelledBy: user.id,
        cancelReason: reason || null,
        cancelledAt: new Date(),
      },
    });
  });

  // Notify the customer of the cancellation
  emitOrderStatus(order.customerId, orderId, 'CANCELLED');

  return { id: orderId, status: 'CANCELLED', refundPercentage };
};

module.exports = { place, list, getById, updateStatus, cancel };
