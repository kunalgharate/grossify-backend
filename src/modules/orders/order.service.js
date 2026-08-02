const { prisma } = require('../../shared/database');
const { NotFoundError, BadRequestError } = require('../../shared/errors');
const { validateTransition, canCancel, getRefundPercentage } = require('./order.workflow');
const razorpayService = require('../payments/razorpay.service');
const { emitNewOrder, emitOrderStatus } = require('../../websocket/socket.handlers');

/**
 * Place a new order
 */
const place = async (customerId, data) => {
  const { storeId, items, addressId, paymentMethod, couponCode, notes } = data;

  if (!storeId || !items || items.length === 0 || !addressId || !paymentMethod) {
    throw new BadRequestError('Required: storeId, items, addressId, paymentMethod');
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

  // Validate and apply coupon
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

    if (offer) {
      // Check usage limit
      if (offer.usageLimit && offer.usedCount >= offer.usageLimit) {
        throw new BadRequestError('Coupon usage limit reached');
      }

      // Check minimum order value
      if (offer.minOrderValue && subtotal < parseFloat(offer.minOrderValue)) {
        throw new BadRequestError(`Minimum order value ₹${offer.minOrderValue} required for this coupon`);
      }

      // Calculate discount
      if (offer.discountType === 'percentage') {
        discount = Math.round(subtotal * parseFloat(offer.discountValue) / 100 * 100) / 100;
        if (offer.maxDiscount && discount > parseFloat(offer.maxDiscount)) {
          discount = parseFloat(offer.maxDiscount);
        }
      } else {
        discount = parseFloat(offer.discountValue);
      }

      // Increment usage count
      await prisma.offer.update({ where: { id: offer.id }, data: { usedCount: { increment: 1 } } });
    } else {
      throw new BadRequestError('Invalid or expired coupon code');
    }
  }

  const total = subtotal + convenienceFee - discount;

  // Generate order number
  const date = new Date();
  const dateStr = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  const orderNumber = `GRS-${dateStr}-${random}`;

  // Create order in transaction (with stock deduction)
  const order = await prisma.$transaction(async (tx) => {
    // Deduct stock for each item
    for (const item of items) {
      await tx.product.update({
        where: { id: item.productId },
        data: { stockQuantity: { decrement: item.quantity } },
      });
    }

    // Create order
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
        paymentStatus: paymentMethod === 'COD' ? 'PENDING' : 'PENDING',
        notes: notes || null,
        items: { create: orderItems },
      },
      include: { items: true },
    });

    return newOrder;
  });

  // If ONLINE payment, create Razorpay order
  let payment = null;
  if (paymentMethod === 'ONLINE') {
    try {
      const rzpOrder = await razorpayService.createOrder(order.total, order.orderNumber);
      payment = await prisma.payment.create({
        data: {
          orderId: order.id,
          razorpayOrderId: rzpOrder.id,
          amount: order.total,
          status: 'PENDING',
        },
      });
    } catch (e) {
      console.error('[Razorpay] Order creation failed:', e.message);
    }
  }

  // Emit real-time event to vendor
  emitNewOrder(storeId, order);

  // Create notification for vendor
  const storeOwner = await prisma.store.findUnique({ where: { id: storeId }, select: { ownerId: true } });
  if (storeOwner) {
    await prisma.notification.create({
      data: { userId: storeOwner.ownerId, title: 'New Order!', body: `Order ${order.orderNumber} received.`, type: 'order', data: { orderId: order.id } },
    }).catch(() => {});
  }

  return { order, payment };
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
 * Get single order
 */
const getById = async (orderId) => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: true,
      store: { select: { id: true, name: true, slug: true, phone: true } },
      address: true,
      payment: true,
    },
  });

  if (!order) throw new NotFoundError('Order not found');
  return order;
};

/**
 * Update order status (vendor workflow)
 */
const updateStatus = async (orderId, newStatus, userId) => {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new NotFoundError('Order not found');

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

  return updated;
};

/**
 * Cancel order
 */
const cancel = async (orderId, userId, reason) => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });

  if (!order) throw new NotFoundError('Order not found');
  if (!canCancel(order.status)) {
    throw new BadRequestError('Order cannot be cancelled at this stage');
  }

  // Restore stock
  await prisma.$transaction(async (tx) => {
    for (const item of order.items) {
      await tx.product.update({
        where: { id: item.productId },
        data: { stockQuantity: { increment: item.quantity } },
      });
    }

    await tx.order.update({
      where: { id: orderId },
      data: {
        status: 'CANCELLED',
        cancelledBy: userId,
        cancelReason: reason || null,
        cancelledAt: new Date(),
      },
    });
  });

  return { id: orderId, status: 'CANCELLED', refundPercentage: getRefundPercentage(order.status) };
};

module.exports = { place, list, getById, updateStatus, cancel };
