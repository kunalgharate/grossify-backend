const express = require('express');
const router = express.Router();
const { prisma } = require('../../shared/database');
const { asyncHandler } = require('../../shared/utils/asyncHandler');
const { authenticate } = require('../../shared/middleware/auth');
const { BadRequestError, NotFoundError, ForbiddenError } = require('../../shared/errors');
const { moderateText } = require('../../shared/utils/moderation');

/**
 * @swagger
 * tags:
 *   name: Reviews
 *   description: Store and product reviews/ratings
 */

/**
 * @swagger
 * /api/v1/reviews:
 *   get:
 *     summary: Get reviews (by store or product)
 *     tags: [Reviews]
 *     parameters:
 *       - in: query
 *         name: storeId
 *         schema:
 *           type: string
 *       - in: query
 *         name: productId
 *         schema:
 *           type: string
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
 *         description: List of reviews
 */
router.get('/', asyncHandler(async (req, res) => {
  const { storeId, productId, page = 1, limit = 20 } = req.query;
  const pageNum = parseInt(page);
  const limitNum = Math.min(parseInt(limit) || 20, 50);
  const where = { status: 'PUBLISHED' };
  if (storeId) where.storeId = storeId;
  if (productId) where.productId = productId;

  const [reviews, total] = await Promise.all([
    prisma.review.findMany({
      where, skip: (pageNum - 1) * limitNum, take: limitNum,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, name: true } } },
    }),
    prisma.review.count({ where }),
  ]);

  // Calculate average rating
  const avgRating = await prisma.review.aggregate({ where, _avg: { rating: true } });

  res.json({
    reviews,
    averageRating: avgRating._avg.rating || 0,
    pagination: { page: pageNum, limit: limitNum, total },
  });
}));

/**
 * @swagger
 * /api/v1/reviews:
 *   post:
 *     summary: Submit a review (verified purchase only)
 *     tags: [Reviews]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [orderId, rating]
 *             properties:
 *               orderId:
 *                 type: string
 *               storeId:
 *                 type: string
 *               productId:
 *                 type: string
 *               rating:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *               text:
 *                 type: string
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: Review submitted
 *       400:
 *         description: Cannot review (not delivered, already reviewed)
 */
router.post('/', authenticate, asyncHandler(async (req, res) => {
  const { orderId, storeId, productId, rating, text, images } = req.body;

  if (!orderId || !rating || rating < 1 || rating > 5) {
    throw new BadRequestError('orderId and rating (1-5) are required');
  }

  // Verify order belongs to user and is delivered
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new NotFoundError('Order not found');
  if (order.customerId !== req.user.id) throw new ForbiddenError('Not your order');
  if (order.status !== 'DELIVERED') throw new BadRequestError('Can only review delivered orders');

  // Check if already reviewed
  const existing = await prisma.review.findUnique({ where: { orderId } });
  if (existing) throw new BadRequestError('Order already reviewed');

  // Auto-moderation check
  const moderation = moderateText(text);
  const reviewStatus = moderation.clean ? 'PUBLISHED' : 'FLAGGED';

  const review = await prisma.review.create({
    data: {
      userId: req.user.id,
      orderId,
      storeId: storeId || order.storeId,
      productId: productId || null,
      rating,
      text: text || null,
      images: images || [],
      status: reviewStatus,
    },
  });

  // Update store rating
  if (storeId || order.storeId) {
    const targetStoreId = storeId || order.storeId;
    const stats = await prisma.review.aggregate({
      where: { storeId: targetStoreId, status: 'PUBLISHED' },
      _avg: { rating: true },
      _count: { id: true },
    });
    await prisma.store.update({
      where: { id: targetStoreId },
      data: { rating: stats._avg.rating || 0, totalReviews: stats._count.id },
    });
  }

  res.status(201).json({ review, message: 'Review submitted' });
}));

/**
 * @swagger
 * /api/v1/reviews/{id}/report:
 *   post:
 *     summary: Report a review (flag for moderation)
 *     tags: [Reviews]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reason]
 *             properties:
 *               reason:
 *                 type: string
 *                 example: "Fake review / inappropriate content"
 *     responses:
 *       200:
 *         description: Review reported
 */
router.post('/:id/report', authenticate, asyncHandler(async (req, res) => {
  const { reason } = req.body;
  if (!reason) throw new BadRequestError('Reason is required');

  const review = await prisma.review.findUnique({ where: { id: req.params.id } });
  if (!review) throw new NotFoundError('Review not found');

  await prisma.review.update({ where: { id: req.params.id }, data: { status: 'FLAGGED' } });

  res.json({ message: 'Review reported and flagged for moderation' });
}));

module.exports = router;
