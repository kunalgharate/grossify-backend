/**
 * Delivery service — the pull-based delivery workflow for verified agents.
 *
 * Flow: an order becomes `READY` (vendor) → appears in `getAvailable` → an agent
 * `accept`s it (assignment + READY→PICKED happen atomically) → the agent
 * `markDelivered` (PICKED→DELIVERED). All Prisma access + status transitions +
 * socket emits live here so the route layer stays thin (module trio).
 *
 * Two invariants worth calling out:
 *  1. `Order.deliveryAgentId` is a FK to `User.id` (the agent's user id), not to
 *     `DeliveryAgent.id`.
 *  2. `accept` cannot delegate to `order.service.updateStatus`: that path only
 *     lets the *already-assigned* agent drive PICKED, but in the pull model the
 *     agent isn't assigned until this call. So assignment + transition are done
 *     together here, guarded by a conditional `updateMany` that lets exactly one
 *     agent win a race for the same order.
 */

const { prisma } = require('../../shared/database');
const { NotFoundError, BadRequestError } = require('../../shared/errors');
const { validateTransition } = require('../orders/order.workflow');
const { emitOrderStatus } = require('../../websocket/socket.handlers');

const PER_DELIVERY_FEE = 25; // ₹ flat, simplified payout (matches earnings display)

/**
 * Orders ready for pickup and not yet claimed by any agent. Includes the store
 * pickup point and the customer drop address so the app can route both legs.
 */
const getAvailable = async () => {
  const orders = await prisma.order.findMany({
    where: { status: 'READY', deliveryAgentId: null },
    include: {
      customer: { select: { name: true, phone: true } },
      store: {
        select: {
          name: true,
          address: true,
          city: true,
          latitude: true,
          longitude: true,
          phone: true,
        },
      },
      address: true,
      items: { select: { productName: true, quantity: true } },
    },
    orderBy: { readyAt: 'asc' },
    take: 20,
  });
  return orders;
};

/**
 * Claim a READY, unassigned order: assign this agent and move READY→PICKED in one
 * atomic step. Returns the updated order.
 */
const accept = async (orderId, user) => {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new NotFoundError('Order not found');
  if (order.status !== 'READY') throw new BadRequestError('Order is not ready for pickup');
  if (order.deliveryAgentId) throw new BadRequestError('Order already assigned to another agent');

  // Belt-and-suspenders: assert the transition is legal before mutating.
  validateTransition(order.status, 'PICKED');

  // Atomic claim — only the first concurrent agent whose predicate still matches
  // (READY + unassigned) wins; everyone else sees count 0 and is rejected.
  const claim = await prisma.order.updateMany({
    where: { id: orderId, status: 'READY', deliveryAgentId: null },
    data: { deliveryAgentId: user.id, status: 'PICKED', pickedAt: new Date() },
  });
  if (claim.count === 0) {
    throw new BadRequestError('Order already assigned to another agent');
  }

  await prisma.notification
    .create({
      data: {
        userId: order.customerId,
        title: 'Order Picked Up',
        body: 'Your order has been picked up by a delivery partner.',
        type: 'order',
        data: { orderId: order.id },
      },
    })
    .catch(() => {});

  // Tell the customer's live-tracking screen the status advanced.
  emitOrderStatus(order.customerId, orderId, 'PICKED');

  return prisma.order.findUnique({ where: { id: orderId } });
};

/**
 * Complete a delivery the calling agent owns: PICKED→DELIVERED, bump the store's
 * lifetime order count, notify the customer. Returns the updated order.
 */
const markDelivered = async (orderId, user) => {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new NotFoundError('Order not found');
  if (order.deliveryAgentId !== user.id) throw new BadRequestError('Not your delivery');
  if (order.status !== 'PICKED') throw new BadRequestError('Order is not in transit');

  validateTransition(order.status, 'DELIVERED');

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.order.update({
      where: { id: orderId },
      data: { status: 'DELIVERED', deliveredAt: new Date() },
    });
    await tx.store.update({
      where: { id: order.storeId },
      data: { totalOrders: { increment: 1 } },
    });
    return result;
  });

  await prisma.notification
    .create({
      data: {
        userId: order.customerId,
        title: 'Order Delivered!',
        body: 'Your order has been delivered. Enjoy!',
        type: 'order',
        data: { orderId: order.id },
      },
    })
    .catch(() => {});

  emitOrderStatus(order.customerId, orderId, 'DELIVERED');

  return updated;
};

/**
 * The calling agent's deliveries, newest pickup first. Optional status filter
 * (PICKED = in-progress, DELIVERED = completed).
 */
const listMyDeliveries = async (user, { status, page = 1 } = {}) => {
  const pageNum = parseInt(page, 10) || 1;
  const take = 20;
  const where = { deliveryAgentId: user.id };
  if (status) where.status = status;

  const [deliveries, total] = await Promise.all([
    prisma.order.findMany({
      where,
      skip: (pageNum - 1) * take,
      take,
      orderBy: { pickedAt: 'desc' },
      include: {
        customer: { select: { name: true, phone: true } },
        store: { select: { name: true, address: true, latitude: true, longitude: true, phone: true } },
        address: true,
        items: { select: { productName: true, quantity: true } },
      },
    }),
    prisma.order.count({ where }),
  ]);

  return {
    deliveries,
    pagination: { page: pageNum, limit: take, total, hasNext: (pageNum - 1) * take + take < total },
  };
};

/**
 * Simple earnings summary for the calling agent: delivered counts × flat fee,
 * today and lifetime.
 */
const getEarnings = async (user) => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [todayDeliveries, totalDeliveries] = await Promise.all([
    prisma.order.count({
      where: { deliveryAgentId: user.id, status: 'DELIVERED', deliveredAt: { gte: todayStart } },
    }),
    prisma.order.count({ where: { deliveryAgentId: user.id, status: 'DELIVERED' } }),
  ]);

  return {
    today: todayDeliveries * PER_DELIVERY_FEE,
    todayDeliveries,
    total: totalDeliveries * PER_DELIVERY_FEE,
    totalDeliveries,
    perDeliveryFee: PER_DELIVERY_FEE,
  };
};

module.exports = { getAvailable, accept, markDelivered, listMyDeliveries, getEarnings };
