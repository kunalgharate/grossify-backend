const express = require('express');
const router = express.Router();
const { prisma } = require('../../shared/database');
const { asyncHandler } = require('../../shared/utils/asyncHandler');
const { authenticate } = require('../../shared/middleware/auth');
const { NotFoundError } = require('../../shared/errors');

/**
 * @swagger
 * tags:
 *   name: Settlements
 *   description: Vendor payment settlements and transaction reporting (Phase 3)
 */

/**
 * @swagger
 * /api/v1/settlements/vendor:
 *   get:
 *     summary: Get vendor's settlement history
 *     tags: [Settlements]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, processing, settled]
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Settlement history
 */
router.get('/vendor', authenticate, asyncHandler(async (req, res) => {
  const store = await prisma.store.findFirst({ where: { ownerId: req.user.id } });
  if (!store) throw new NotFoundError('Store not found');

  const { status, page = 1 } = req.query;
  const pageNum = parseInt(page);
  const where = { storeId: store.id };
  if (status) where.status = status;

  const [settlements, total] = await Promise.all([
    prisma.settlement.findMany({
      where, skip: (pageNum - 1) * 20, take: 20,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.settlement.count({ where }),
  ]);

  // Calculate pending amount (delivered orders without settlement)
  const pendingAmount = await prisma.order.aggregate({
    where: { storeId: store.id, status: 'DELIVERED', paymentStatus: 'PAID' },
    _sum: { subtotal: true },
  });

  res.json({
    settlements,
    pendingSettlement: pendingAmount._sum.subtotal || 0,
    pagination: { page: pageNum, total },
  });
}));

/**
 * @swagger
 * /api/v1/settlements/vendor/summary:
 *   get:
 *     summary: Get vendor earnings summary
 *     tags: [Settlements]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Earnings breakdown
 */
router.get('/vendor/summary', authenticate, asyncHandler(async (req, res) => {
  const store = await prisma.store.findFirst({ where: { ownerId: req.user.id } });
  if (!store) throw new NotFoundError('Store not found');

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 7);

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [todayRevenue, weekRevenue, monthRevenue, totalSettled] = await Promise.all([
    prisma.order.aggregate({ where: { storeId: store.id, status: 'DELIVERED', deliveredAt: { gte: todayStart } }, _sum: { subtotal: true }, _count: true }),
    prisma.order.aggregate({ where: { storeId: store.id, status: 'DELIVERED', deliveredAt: { gte: weekStart } }, _sum: { subtotal: true }, _count: true }),
    prisma.order.aggregate({ where: { storeId: store.id, status: 'DELIVERED', deliveredAt: { gte: monthStart } }, _sum: { subtotal: true }, _count: true }),
    prisma.settlement.aggregate({ where: { storeId: store.id, status: 'settled' }, _sum: { amount: true } }),
  ]);

  res.json({
    summary: {
      today: { revenue: todayRevenue._sum.subtotal || 0, orders: todayRevenue._count || 0 },
      week: { revenue: weekRevenue._sum.subtotal || 0, orders: weekRevenue._count || 0 },
      month: { revenue: monthRevenue._sum.subtotal || 0, orders: monthRevenue._count || 0 },
      totalSettled: totalSettled._sum.amount || 0,
    },
  });
}));

/**
 * @swagger
 * /api/v1/settlements/transactions:
 *   get:
 *     summary: Transaction history (admin/vendor)
 *     tags: [Settlements]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: storeId
 *         schema:
 *           type: string
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Transaction report
 */
router.get('/transactions', authenticate, asyncHandler(async (req, res) => {
  const { storeId, from, to, page = 1 } = req.query;
  const pageNum = parseInt(page);

  // Determine store: vendor sees own, admin can pass storeId
  let targetStoreId = storeId;
  if (!targetStoreId) {
    const store = await prisma.store.findFirst({ where: { ownerId: req.user.id } });
    if (store) targetStoreId = store.id;
  }

  const where = { status: 'DELIVERED' };
  if (targetStoreId) where.storeId = targetStoreId;
  if (from) where.deliveredAt = { ...where.deliveredAt, gte: new Date(from) };
  if (to) where.deliveredAt = { ...where.deliveredAt, lte: new Date(to) };

  const [transactions, total, aggregate] = await Promise.all([
    prisma.order.findMany({
      where, skip: (pageNum - 1) * 50, take: 50,
      orderBy: { deliveredAt: 'desc' },
      select: {
        id: true, orderNumber: true, subtotal: true, convenienceFee: true,
        deliveryFee: true, discount: true, total: true, paymentMethod: true,
        paymentStatus: true, deliveredAt: true,
        customer: { select: { name: true } },
      },
    }),
    prisma.order.count({ where }),
    prisma.order.aggregate({ where, _sum: { subtotal: true, convenienceFee: true, total: true } }),
  ]);

  res.json({
    transactions,
    summary: {
      totalOrders: total,
      totalRevenue: aggregate._sum.subtotal || 0,
      totalConvenienceFee: aggregate._sum.convenienceFee || 0,
      grossTotal: aggregate._sum.total || 0,
    },
    pagination: { page: pageNum, total },
  });
}));

module.exports = router;
