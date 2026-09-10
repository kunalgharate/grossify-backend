const express = require('express');
const router = express.Router();
const { prisma } = require('../../shared/database');
const { asyncHandler } = require('../../shared/utils/asyncHandler');
const { authenticate, requireStaff } = require('../../shared/middleware/auth');
const { ForbiddenError, NotFoundError } = require('../../shared/errors');
const analyticsService = require('./analytics.service');

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
 *     summary: Platform-wide analytics (admin/manager/support)
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Platform metrics (GMV, MRR, active counts, orders today)
 */
router.get('/platform', authenticate, requireStaff, asyncHandler(async (req, res) => {
  const metrics = await analyticsService.getPlatformMetrics();
  res.json({ metrics });
}));

/**
 * @swagger
 * /api/v1/analytics/store/{storeId}:
 *   get:
 *     summary: Store-specific analytics (owner only)
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: storeId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [daily, weekly, monthly, yearly]
 *     responses:
 *       200:
 *         description: Store metrics
 */
router.get('/store/:storeId', authenticate, asyncHandler(async (req, res) => {
  const store = await prisma.store.findUnique({
    where: { id: req.params.storeId },
    select: { ownerId: true },
  });
  if (!store) throw new NotFoundError('Store not found');
  if (store.ownerId !== req.user.id) throw new ForbiddenError('Not your store');

  const analytics = await analyticsService.getStoreMetrics(req.params.storeId, req.query.period);
  res.json({ analytics });
}));

module.exports = router;
