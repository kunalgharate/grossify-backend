const express = require('express');
const router = express.Router();
const { prisma } = require('../../shared/database');
const { asyncHandler } = require('../../shared/utils/asyncHandler');
const { authenticate } = require('../../shared/middleware/auth');
const { NotFoundError, BadRequestError } = require('../../shared/errors');

/**
 * @swagger
 * tags:
 *   name: Delivery
 *   description: Delivery agent operations
 */

/**
 * @swagger
 * /api/v1/delivery/available:
 *   get:
 *     summary: Get orders available for delivery pickup
 *     tags: [Delivery]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: lat
 *         schema:
 *           type: number
 *       - in: query
 *         name: lng
 *         schema:
 *           type: number
 *     responses:
 *       200:
 *         description: Orders ready for pickup
 */
router.get('/available', authenticate, asyncHandler(async (req, res) => {
  const orders = await prisma.order.findMany({
    where: { status: 'READY', deliveryAgentId: null },
    include: {
      store: { select: { name: true, address: true, city: true, latitude: true, longitude: true, phone: true } },
      address: true,
      items: { select: { productName: true, quantity: true } },
    },
    orderBy: { readyAt: 'asc' },
    take: 20,
  });
  res.json({ orders, count: orders.length });
}));

/**
 * @swagger
 * /api/v1/delivery/{orderId}/accept:
 *   post:
 *     summary: Accept a delivery order
 *     tags: [Delivery]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Delivery accepted
 *       400:
 *         description: Order already assigned
 */
router.post('/:orderId/accept', authenticate, asyncHandler(async (req, res) => {
  const order = await prisma.order.findUnique({ where: { id: req.params.orderId } });
  if (!order) throw new NotFoundError('Order not found');
  if (order.status !== 'READY') throw new BadRequestError('Order is not ready for pickup');
  if (order.deliveryAgentId) throw new BadRequestError('Order already assigned to another agent');

  const updated = await prisma.order.update({
    where: { id: req.params.orderId },
    data: { deliveryAgentId: req.user.id, status: 'PICKED', pickedAt: new Date() },
  });

  // Create notification for customer
  await prisma.notification.create({
    data: { userId: order.customerId, title: 'Order Picked Up', body: 'Your order has been picked up by delivery partner.', type: 'order', data: { orderId: order.id } },
  });

  res.json({ order: updated, message: 'Delivery accepted, navigate to store for pickup' });
}));

/**
 * @swagger
 * /api/v1/delivery/{orderId}/delivered:
 *   post:
 *     summary: Mark order as delivered
 *     tags: [Delivery]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Order delivered
 */
router.post('/:orderId/delivered', authenticate, asyncHandler(async (req, res) => {
  const order = await prisma.order.findUnique({ where: { id: req.params.orderId } });
  if (!order) throw new NotFoundError('Order not found');
  if (order.deliveryAgentId !== req.user.id) throw new BadRequestError('Not your delivery');
  if (order.status !== 'PICKED') throw new BadRequestError('Order not in transit');

  const updated = await prisma.order.update({
    where: { id: req.params.orderId },
    data: { status: 'DELIVERED', deliveredAt: new Date() },
  });

  // Update store total orders
  await prisma.store.update({ where: { id: order.storeId }, data: { totalOrders: { increment: 1 } } });

  // Create notification for customer
  await prisma.notification.create({
    data: { userId: order.customerId, title: 'Order Delivered!', body: 'Your order has been delivered. Enjoy!', type: 'order', data: { orderId: order.id } },
  });

  res.json({ order: updated, message: 'Order delivered successfully' });
}));

/**
 * @swagger
 * /api/v1/delivery/my-deliveries:
 *   get:
 *     summary: Get agent's delivery history
 *     tags: [Delivery]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PICKED, DELIVERED]
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Delivery history
 */
router.get('/my-deliveries', authenticate, asyncHandler(async (req, res) => {
  const { status, page = 1 } = req.query;
  const pageNum = parseInt(page);
  const where = { deliveryAgentId: req.user.id };
  if (status) where.status = status;

  const [deliveries, total] = await Promise.all([
    prisma.order.findMany({
      where, skip: (pageNum - 1) * 20, take: 20,
      orderBy: { pickedAt: 'desc' },
      include: {
        store: { select: { name: true, address: true } },
        address: { select: { fullAddress: true, city: true } },
      },
    }),
    prisma.order.count({ where }),
  ]);

  res.json({ deliveries, pagination: { page: pageNum, total } });
}));

/**
 * @swagger
 * /api/v1/delivery/earnings:
 *   get:
 *     summary: Get delivery agent earnings summary
 *     tags: [Delivery]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Earnings summary
 */
router.get('/earnings', authenticate, asyncHandler(async (req, res) => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [todayDeliveries, totalDeliveries] = await Promise.all([
    prisma.order.count({ where: { deliveryAgentId: req.user.id, status: 'DELIVERED', deliveredAt: { gte: todayStart } } }),
    prisma.order.count({ where: { deliveryAgentId: req.user.id, status: 'DELIVERED' } }),
  ]);

  // Delivery fee per order: ₹20-35 (simplified calculation)
  const perDeliveryFee = 25;

  res.json({
    earnings: {
      today: todayDeliveries * perDeliveryFee,
      todayDeliveries,
      total: totalDeliveries * perDeliveryFee,
      totalDeliveries,
    },
  });
}));

module.exports = router;
