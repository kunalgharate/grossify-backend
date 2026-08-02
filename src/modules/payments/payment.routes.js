const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { prisma } = require('../../shared/database');
const { asyncHandler } = require('../../shared/utils/asyncHandler');
const { authenticate } = require('../../shared/middleware/auth');
const { BadRequestError } = require('../../shared/errors');
const config = require('../../shared/config');

/**
 * @swagger
 * tags:
 *   name: Payments
 *   description: Payment verification and webhooks (Razorpay)
 */

/**
 * @swagger
 * /api/v1/payments/verify:
 *   post:
 *     summary: Verify Razorpay payment after checkout
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [razorpay_order_id, razorpay_payment_id, razorpay_signature]
 *             properties:
 *               razorpay_order_id:
 *                 type: string
 *               razorpay_payment_id:
 *                 type: string
 *               razorpay_signature:
 *                 type: string
 *     responses:
 *       200:
 *         description: Payment verified
 *       400:
 *         description: Signature mismatch
 */
router.post('/verify', authenticate, asyncHandler(async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    throw new BadRequestError('All payment fields are required');
  }

  // Verify signature
  if (config.razorpay.keySecret) {
    const generated = crypto.createHmac('sha256', config.razorpay.keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (generated !== razorpay_signature) {
      throw new BadRequestError('Payment verification failed - signature mismatch');
    }
  }

  // Update payment record
  const payment = await prisma.payment.findUnique({ where: { razorpayOrderId: razorpay_order_id } });
  if (payment) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { razorpayPaymentId: razorpay_payment_id, status: 'PAID', paidAt: new Date() },
    });

    // Update order payment status
    await prisma.order.update({
      where: { id: payment.orderId },
      data: { paymentStatus: 'PAID' },
    });
  }

  res.json({ verified: true, paymentId: razorpay_payment_id });
}));

/**
 * @swagger
 * /api/v1/payments/webhook:
 *   post:
 *     summary: Razorpay webhook handler
 *     tags: [Payments]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Webhook received
 */
router.post('/webhook', asyncHandler(async (req, res) => {
  const signature = req.headers['x-razorpay-signature'];
  const body = JSON.stringify(req.body);

  // Verify webhook signature if secret configured
  if (config.razorpay.webhookSecret && signature) {
    const expected = crypto.createHmac('sha256', config.razorpay.webhookSecret)
      .update(body)
      .digest('hex');

    if (expected !== signature) {
      return res.status(400).json({ error: 'Invalid webhook signature' });
    }
  }

  const event = req.body.event;
  const payload = req.body.payload;

  switch (event) {
    case 'payment.captured': {
      const paymentId = payload?.payment?.entity?.id;
      const orderId = payload?.payment?.entity?.order_id;
      if (orderId) {
        await prisma.payment.updateMany({
          where: { razorpayOrderId: orderId },
          data: { razorpayPaymentId: paymentId, status: 'PAID', paidAt: new Date() },
        });
      }
      break;
    }
    case 'payment.failed': {
      const orderId = payload?.payment?.entity?.order_id;
      if (orderId) {
        await prisma.payment.updateMany({
          where: { razorpayOrderId: orderId },
          data: { status: 'FAILED' },
        });
      }
      break;
    }
    case 'refund.processed': {
      const paymentId = payload?.refund?.entity?.payment_id;
      if (paymentId) {
        await prisma.payment.updateMany({
          where: { razorpayPaymentId: paymentId },
          data: { status: 'REFUNDED', refundedAt: new Date() },
        });
      }
      break;
    }
  }

  // Always respond 200 to Razorpay
  res.json({ status: 'ok' });
}));

/**
 * @swagger
 * /api/v1/payments/history:
 *   get:
 *     summary: Get payment history for authenticated user
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
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
 *         description: Payment history
 */
router.get('/history', authenticate, asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const pageNum = parseInt(page);
  const limitNum = Math.min(parseInt(limit) || 20, 50);

  const payments = await prisma.payment.findMany({
    where: { order: { customerId: req.user.id } },
    skip: (pageNum - 1) * limitNum,
    take: limitNum,
    orderBy: { createdAt: 'desc' },
    include: { order: { select: { orderNumber: true, storeId: true, total: true } } },
  });

  res.json({ payments });
}));

module.exports = router;
