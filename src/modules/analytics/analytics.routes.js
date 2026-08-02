const express = require('express');
const router = express.Router();
const { prisma } = require('../../shared/database');
const { asyncHandler } = require('../../shared/utils/asyncHandler');
const { authenticate } = require('../../shared/middleware/auth');

/**
 * @swagger
 * tags:
 *   name: Analytics
 *   description: Platform and store analytics
 */

/**
 * @swagger
 * /api/v1/analytics/platform:
 *   get:
 *     summary: Platform-wide analytics (admin/manager)
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Platform metrics
 */
router.get('/platform', authenticate, asyncHandler(async (req, res) => {
  const [users, stores, orders, products, subscriptions] = await Promise.all([
    prisma.user.count(),
    prisma.store.count({ where: { status: 'ACTIVE' } }),
    prisma.order.count(),
    prisma.product.count({ where: { status: 'ACTIVE' } }),
    prisma.subscription.count({ where: { status: { in: ['TRIAL', 'ACTIVE'] } } }),
  ]);

  res.json({ metrics: { users, stores, orders, products, activeSubscriptions: subscriptions } });
}));

/**
 * @swagger
 * /api/v1/analytics/store/{storeId}:
 *   get:
 *     summary: Store-specific analytics (vendor)
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: storeId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Store metrics
 */
router.get('/store/:storeId', authenticate, asyncHandler(async (req, res) => {
  const storeId = req.params.storeId;

  const [totalOrders, totalProducts, deliveredOrders] = await Promise.all([
    prisma.order.count({ where: { storeId } }),
    prisma.product.count({ where: { storeId, status: 'ACTIVE' } }),
    prisma.order.count({ where: { storeId, status: 'DELIVERED' } }),
  ]);

  // Calculate revenue from delivered orders
  const revenue = await prisma.order.aggregate({
    where: { storeId, status: 'DELIVERED' },
    _sum: { total: true },
  });

  res.json({
    analytics: {
      totalOrders,
      deliveredOrders,
      totalProducts,
      revenue: revenue._sum.total || 0,
      fulfillmentRate: totalOrders > 0 ? Math.round((deliveredOrders / totalOrders) * 100) : 0,
    },
  });
}));

module.exports = router;
