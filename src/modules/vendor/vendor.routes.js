const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { prisma } = require('../../shared/database');
const { asyncHandler } = require('../../shared/utils/asyncHandler');
const { authenticate } = require('../../shared/middleware/auth');
const { BadRequestError, NotFoundError, ForbiddenError } = require('../../shared/errors');

/**
 * @swagger
 * tags:
 *   name: Vendor
 *   description: Vendor-specific operations (store panel)
 */

/**
 * @swagger
 * /api/v1/vendor/my-store:
 *   get:
 *     summary: Get vendor's own store details
 *     tags: [Vendor]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Store details
 */
router.get('/my-store', authenticate, asyncHandler(async (req, res) => {
  const store = await prisma.store.findFirst({
    where: { ownerId: req.user.id },
    include: { category: true, subscription: { include: { plan: true } } },
  });
  if (!store) throw new NotFoundError('You do not have a registered store');
  res.json({ store });
}));

/**
 * @swagger
 * /api/v1/vendor/orders:
 *   get:
 *     summary: Get orders for vendor's store
 *     tags: [Vendor]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PLACED, ACCEPTED, PREPARING, READY, PICKED, DELIVERED, CANCELLED]
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Store orders
 */
router.get('/orders', authenticate, asyncHandler(async (req, res) => {
  const store = await prisma.store.findFirst({ where: { ownerId: req.user.id } });
  if (!store) throw new NotFoundError('Store not found');

  const { status, page = 1, limit = 20 } = req.query;
  const pageNum = parseInt(page);
  const limitNum = Math.min(parseInt(limit) || 20, 50);
  const where = { storeId: store.id };
  if (status) where.status = status;

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where, skip: (pageNum - 1) * limitNum, take: limitNum,
      orderBy: { placedAt: 'desc' },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        items: true,
        address: true,
      },
    }),
    prisma.order.count({ where }),
  ]);

  res.json({ orders, pagination: { page: pageNum, limit: limitNum, total, hasNext: pageNum * limitNum < total } });
}));

/**
 * @swagger
 * /api/v1/vendor/orders/{id}/accept:
 *   patch:
 *     summary: Accept an order
 *     tags: [Vendor]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Order accepted
 */
router.patch('/orders/:id/accept', authenticate, asyncHandler(async (req, res) => {
  const order = await prisma.order.findUnique({ where: { id: req.params.id }, include: { store: true } });
  if (!order) throw new NotFoundError('Order not found');
  if (order.store.ownerId !== req.user.id) throw new ForbiddenError('Not your store order');
  if (order.status !== 'PLACED') throw new BadRequestError('Can only accept PLACED orders');

  const updated = await prisma.order.update({
    where: { id: req.params.id },
    data: { status: 'ACCEPTED', acceptedAt: new Date() },
  });
  res.json({ order: updated, message: 'Order accepted' });
}));

/**
 * @swagger
 * /api/v1/vendor/orders/{id}/reject:
 *   patch:
 *     summary: Reject an order
 *     tags: [Vendor]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Order rejected (refund initiated)
 */
router.patch('/orders/:id/reject', authenticate, asyncHandler(async (req, res) => {
  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    include: { store: true, items: true },
  });
  if (!order) throw new NotFoundError('Order not found');
  if (order.store.ownerId !== req.user.id) throw new ForbiddenError('Not your store order');
  if (order.status !== 'PLACED') throw new BadRequestError('Can only reject PLACED orders');

  // Restore stock and cancel
  await prisma.$transaction(async (tx) => {
    for (const item of order.items) {
      await tx.product.update({ where: { id: item.productId }, data: { stockQuantity: { increment: item.quantity } } });
    }
    await tx.order.update({
      where: { id: req.params.id },
      data: { status: 'CANCELLED', cancelledBy: 'vendor', cancelReason: req.body.reason || 'Rejected by vendor', cancelledAt: new Date() },
    });
  });

  res.json({ message: 'Order rejected, customer will be refunded' });
}));

/**
 * @swagger
 * /api/v1/vendor/orders/{id}/ready:
 *   patch:
 *     summary: Mark order as ready for pickup/delivery
 *     tags: [Vendor]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Order marked ready
 */
router.patch('/orders/:id/ready', authenticate, asyncHandler(async (req, res) => {
  const order = await prisma.order.findUnique({ where: { id: req.params.id }, include: { store: true } });
  if (!order) throw new NotFoundError('Order not found');
  if (order.store.ownerId !== req.user.id) throw new ForbiddenError('Not your store order');
  if (!['ACCEPTED', 'PREPARING'].includes(order.status)) throw new BadRequestError('Order not in correct state');

  const updated = await prisma.order.update({
    where: { id: req.params.id },
    data: { status: 'READY', readyAt: new Date() },
  });
  res.json({ order: updated, message: 'Order marked as ready' });
}));

/**
 * @swagger
 * /api/v1/vendor/customers:
 *   get:
 *     summary: List customers who ordered from this store
 *     tags: [Vendor]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Customer list
 */
router.get('/customers', authenticate, asyncHandler(async (req, res) => {
  const store = await prisma.store.findFirst({ where: { ownerId: req.user.id } });
  if (!store) throw new NotFoundError('Store not found');

  const customers = await prisma.user.findMany({
    where: { orders: { some: { storeId: store.id } } },
    select: { id: true, name: true, phone: true, email: true, createdAt: true },
  });

  res.json({ customers });
}));

/**
 * @swagger
 * /api/v1/vendor/customers/add:
 *   post:
 *     summary: Add a customer on behalf (sends temp password via SMS)
 *     tags: [Vendor]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [phone]
 *             properties:
 *               phone:
 *                 type: string
 *                 example: "+919876543210"
 *               name:
 *                 type: string
 *     responses:
 *       201:
 *         description: Customer created with temp password
 *       200:
 *         description: Customer already exists
 */
router.post('/customers/add', authenticate, asyncHandler(async (req, res) => {
  const { phone, name } = req.body;
  if (!phone) throw new BadRequestError('Phone number is required');

  // Check if already registered
  const existing = await prisma.user.findUnique({ where: { phone } });
  if (existing) {
    return res.json({ message: 'Customer already registered', user: { id: existing.id, name: existing.name, phone: existing.phone } });
  }

  // Generate temp password
  const tempPassword = Math.random().toString(36).substring(2, 10);
  const passwordHash = await bcrypt.hash(tempPassword, 12);

  const customer = await prisma.user.create({
    data: {
      phone,
      name: name || null,
      passwordHash,
      isTempPassword: true,
      status: 'ACTIVE',
    },
    select: { id: true, name: true, phone: true },
  });

  // TODO: Send SMS with temp password via MSG91
  // "Welcome to Grossify! Login: {phone}, Temp Password: {tempPassword}"

  res.status(201).json({
    customer,
    tempPassword, // In production, this would only be sent via SMS
    message: 'Customer created. Temp password sent via SMS.',
  });
}));

/**
 * @swagger
 * /api/v1/vendor/analytics:
 *   get:
 *     summary: Get vendor store analytics
 *     tags: [Vendor]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Store analytics
 */
router.get('/analytics', authenticate, asyncHandler(async (req, res) => {
  const store = await prisma.store.findFirst({ where: { ownerId: req.user.id } });
  if (!store) throw new NotFoundError('Store not found');

  const [totalOrders, deliveredOrders, cancelledOrders, totalProducts, revenue] = await Promise.all([
    prisma.order.count({ where: { storeId: store.id } }),
    prisma.order.count({ where: { storeId: store.id, status: 'DELIVERED' } }),
    prisma.order.count({ where: { storeId: store.id, status: 'CANCELLED' } }),
    prisma.product.count({ where: { storeId: store.id, status: 'ACTIVE' } }),
    prisma.order.aggregate({ where: { storeId: store.id, status: 'DELIVERED' }, _sum: { total: true } }),
  ]);

  res.json({
    analytics: {
      totalOrders,
      deliveredOrders,
      cancelledOrders,
      totalProducts,
      revenue: revenue._sum.total || 0,
      fulfillmentRate: totalOrders > 0 ? Math.round((deliveredOrders / totalOrders) * 100) : 0,
      rating: store.rating,
      totalReviews: store.totalReviews,
    },
  });
}));

/**
 * @swagger
 * /api/v1/vendor/toggle-open:
 *   patch:
 *     summary: Toggle store open/closed status
 *     tags: [Vendor]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [isOpen]
 *             properties:
 *               isOpen:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Store status toggled
 */
router.patch('/toggle-open', authenticate, asyncHandler(async (req, res) => {
  const store = await prisma.store.findFirst({ where: { ownerId: req.user.id } });
  if (!store) throw new NotFoundError('Store not found');

  const updated = await prisma.store.update({
    where: { id: store.id },
    data: { isOpen: req.body.isOpen },
  });
  res.json({ isOpen: updated.isOpen, message: updated.isOpen ? 'Store is now open' : 'Store is now closed' });
}));

/**
 * @swagger
 * /api/v1/vendor/business-hours:
 *   put:
 *     summary: Set store business hours
 *     tags: [Vendor]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             example:
 *               mon: { open: "09:00", close: "21:00" }
 *               tue: { open: "09:00", close: "21:00" }
 *               sun: null
 *     responses:
 *       200:
 *         description: Business hours updated
 */
router.put('/business-hours', authenticate, asyncHandler(async (req, res) => {
  const store = await prisma.store.findFirst({ where: { ownerId: req.user.id } });
  if (!store) throw new NotFoundError('Store not found');

  const updated = await prisma.store.update({
    where: { id: store.id },
    data: { businessHours: req.body },
  });
  res.json({ businessHours: updated.businessHours, message: 'Business hours updated' });
}));

/**
 * @swagger
 * /api/v1/vendor/products:
 *   get:
 *     summary: List vendor's own products
 *     tags: [Vendor]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [ACTIVE, HIDDEN, DELETED]
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Vendor's products
 */
router.get('/products', authenticate, asyncHandler(async (req, res) => {
  const store = await prisma.store.findFirst({ where: { ownerId: req.user.id } });
  if (!store) throw new NotFoundError('Store not found');

  const { status, page = 1, limit = 20 } = req.query;
  const pageNum = parseInt(page);
  const limitNum = Math.min(parseInt(limit) || 20, 50);
  const where = { storeId: store.id };
  if (status) where.status = status;
  else where.status = { not: 'DELETED' };

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where, skip: (pageNum - 1) * limitNum, take: limitNum,
      orderBy: { createdAt: 'desc' },
      include: { variants: true },
    }),
    prisma.product.count({ where }),
  ]);

  res.json({ products, pagination: { page: pageNum, limit: limitNum, total } });
}));

/**
 * @swagger
 * /api/v1/vendor/reactivate:
 *   post:
 *     summary: Reactivate a deactivated/expired store (renew subscription)
 *     tags: [Vendor]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [planId]
 *             properties:
 *               planId:
 *                 type: string
 *               billingCycle:
 *                 type: string
 *                 enum: [monthly, annual]
 *                 default: monthly
 *     responses:
 *       200:
 *         description: Store reactivated
 *       400:
 *         description: Store already active
 */
router.post('/reactivate', authenticate, asyncHandler(async (req, res) => {
  const { planId, billingCycle = 'monthly' } = req.body;
  if (!planId) throw new BadRequestError('planId is required');

  const store = await prisma.store.findFirst({ where: { ownerId: req.user.id } });
  if (!store) throw new NotFoundError('Store not found');
  if (store.status === 'ACTIVE') throw new BadRequestError('Store is already active');

  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan) throw new NotFoundError('Plan not found');

  const now = new Date();
  const periodEnd = billingCycle === 'annual'
    ? new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)
    : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  // Reactivate subscription
  await prisma.subscription.upsert({
    where: { storeId: store.id },
    update: { planId, status: 'ACTIVE', billingCycle, currentPeriodStart: now, currentPeriodEnd: periodEnd, trialEndsAt: null },
    create: { storeId: store.id, planId, status: 'ACTIVE', billingCycle, currentPeriodStart: now, currentPeriodEnd: periodEnd },
  });

  // Reactivate store
  await prisma.store.update({ where: { id: store.id }, data: { status: 'ACTIVE' } });

  res.json({ message: 'Store reactivated! Your products are live again.', store: { id: store.id, status: 'ACTIVE' } });
}));

module.exports = router;
