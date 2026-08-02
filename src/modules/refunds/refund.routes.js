const express = require('express');
const router = express.Router();
const { prisma } = require('../../shared/database');
const { asyncHandler } = require('../../shared/utils/asyncHandler');
const { authenticate } = require('../../shared/middleware/auth');
const { BadRequestError, NotFoundError, ForbiddenError } = require('../../shared/errors');
const razorpayService = require('../payments/razorpay.service');

/**
 * @swagger
 * tags:
 *   name: Refunds
 *   description: Refund management (Phase 3)
 */

/**
 * @swagger
 * /api/v1/refunds:
 *   post:
 *     summary: Initiate a refund for an order
 *     tags: [Refunds]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [orderId, reason]
 *             properties:
 *               orderId:
 *                 type: string
 *               amount:
 *                 type: number
 *                 description: Partial refund amount (optional, full if omitted)
 *               reason:
 *                 type: string
 *                 example: "Wrong item delivered"
 *     responses:
 *       201:
 *         description: Refund initiated
 *       400:
 *         description: Order not eligible for refund
 */
router.post('/', authenticate, asyncHandler(async (req, res) => {
  const { orderId, amount, reason } = req.body;
  if (!orderId || !reason) throw new BadRequestError('orderId and reason required');

  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { payment: true } });
  if (!order) throw new NotFoundError('Order not found');

  // Only cancelled/delivered orders can be refunded
  if (!['CANCELLED', 'DELIVERED'].includes(order.status)) {
    throw new BadRequestError('Order must be cancelled or delivered for refund');
  }

  const refundAmount = amount || parseFloat(order.total);

  // Check for existing pending refund
  const existingRefund = await prisma.refund.findFirst({
    where: { orderId, status: { in: ['pending', 'processing'] } },
  });
  if (existingRefund) throw new BadRequestError('Refund already in progress for this order');

  // Create refund record
  const refund = await prisma.refund.create({
    data: {
      orderId,
      paymentId: order.payment?.id || null,
      amount: refundAmount,
      reason,
      status: 'pending',
      initiatedBy: req.user.id,
    },
  });

  // If online payment, trigger Razorpay refund
  if (order.payment?.razorpayPaymentId) {
    try {
      const rzpRefund = await razorpayService.refund(order.payment.razorpayPaymentId, refundAmount);
      await prisma.refund.update({
        where: { id: refund.id },
        data: { status: 'processing', razorpayRefundId: rzpRefund.id },
      });
      await prisma.order.update({ where: { id: orderId }, data: { paymentStatus: 'REFUNDED' } });
    } catch (e) {
      // Razorpay refund failed — mark for manual processing
      await prisma.refund.update({ where: { id: refund.id }, data: { status: 'failed' } });
    }
  } else {
    // COD — no money to refund, just mark completed
    await prisma.refund.update({ where: { id: refund.id }, data: { status: 'completed', processedAt: new Date() } });
  }

  const updated = await prisma.refund.findUnique({ where: { id: refund.id } });
  res.status(201).json({ refund: updated, message: 'Refund initiated' });
}));

/**
 * @swagger
 * /api/v1/refunds:
 *   get:
 *     summary: List refunds for user or admin
 *     tags: [Refunds]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, processing, completed, failed]
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Refunds list
 */
router.get('/', authenticate, asyncHandler(async (req, res) => {
  const { status, page = 1 } = req.query;
  const pageNum = parseInt(page);
  const where = { order: { customerId: req.user.id } };
  if (status) where.status = status;

  const [refunds, total] = await Promise.all([
    prisma.refund.findMany({
      where, skip: (pageNum - 1) * 20, take: 20,
      orderBy: { createdAt: 'desc' },
      include: { order: { select: { orderNumber: true, total: true } } },
    }),
    prisma.refund.count({ where }),
  ]);

  res.json({ refunds, pagination: { page: pageNum, total } });
}));

/**
 * @swagger
 * /api/v1/refunds/{id}:
 *   get:
 *     summary: Get refund details
 *     tags: [Refunds]
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
 *         description: Refund details
 */
router.get('/:id', authenticate, asyncHandler(async (req, res) => {
  const refund = await prisma.refund.findUnique({
    where: { id: req.params.id },
    include: { order: { select: { orderNumber: true, total: true, paymentMethod: true } } },
  });
  if (!refund) throw new NotFoundError('Refund not found');
  res.json({ refund });
}));

module.exports = router;
