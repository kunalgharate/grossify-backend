const express = require('express');
const router = express.Router();
const { prisma } = require('../../shared/database');
const { asyncHandler } = require('../../shared/utils/asyncHandler');
const { authenticate } = require('../../shared/middleware/auth');
const { BadRequestError, NotFoundError, ForbiddenError } = require('../../shared/errors');
const config = require('../../shared/config');
const razorpayService = require('./razorpay.service');

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

  // Load the payment + its order, and enforce ownership (a customer can only
  // verify a payment that belongs to their own order).
  const payment = await prisma.payment.findUnique({
    where: { razorpayOrderId: razorpay_order_id },
    include: { order: { select: { id: true, customerId: true } } },
  });
  if (!payment) throw new NotFoundError('Payment not found for this Razorpay order');
  if (payment.order.customerId !== req.user.id) {
    throw new ForbiddenError('You cannot verify this payment');
  }

  // Idempotent: if already paid, return success without re-processing.
  if (payment.status === 'PAID') {
    return res.json({ verified: true, paymentId: payment.razorpayPaymentId, alreadyProcessed: true });
  }

  // Signature verification. Enforced whenever credentials exist; in production
  // missing credentials is a hard failure (never a silent pass).
  if (razorpayService.isConfigured()) {
    const ok = razorpayService.verifyPaymentSignature({
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    });
    if (!ok) throw new BadRequestError('Payment verification failed - signature mismatch');
  } else if (config.nodeEnv === 'production') {
    throw new BadRequestError('PAYMENT_UNAVAILABLE: online payment is not configured');
  }

  await prisma.$transaction([
    prisma.payment.update({
      where: { id: payment.id },
      data: { razorpayPaymentId: razorpay_payment_id, status: 'PAID', paidAt: new Date() },
    }),
    prisma.order.update({
      where: { id: payment.orderId },
      data: { paymentStatus: 'PAID' },
    }),
  ]);

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

  // Signature verification over the RAW body. Enforced in production; in other
  // environments enforced only when a webhook secret is configured.
  if (config.razorpay.webhookSecret) {
    const ok = razorpayService.verifyWebhookSignature(req.rawBody, signature);
    if (!ok) {
      return res.status(400).json({ error: 'INVALID_SIGNATURE', message: 'Invalid webhook signature' });
    }
  } else if (config.nodeEnv === 'production') {
    return res.status(400).json({ error: 'WEBHOOK_NOT_CONFIGURED', message: 'Webhook secret is not configured' });
  }

  const event = req.body.event;
  const payload = req.body.payload;

  switch (event) {
    case 'payment.captured': {
      const paymentId = payload?.payment?.entity?.id;
      const orderId = payload?.payment?.entity?.order_id;
      if (orderId) {
        const payment = await prisma.payment.findUnique({ where: { razorpayOrderId: orderId } });
        // Idempotent: Razorpay retries webhooks — only act if not already paid.
        if (payment && payment.status !== 'PAID') {
          await prisma.$transaction([
            prisma.payment.update({
              where: { id: payment.id },
              data: { razorpayPaymentId: paymentId, status: 'PAID', paidAt: new Date() },
            }),
            prisma.order.update({
              where: { id: payment.orderId },
              data: { paymentStatus: 'PAID' },
            }),
          ]);
        }
      }
      break;
    }
    case 'payment.failed': {
      const orderId = payload?.payment?.entity?.order_id;
      if (orderId) {
        const payment = await prisma.payment.findUnique({ where: { razorpayOrderId: orderId } });
        if (payment && payment.status === 'PENDING') {
          await prisma.$transaction([
            prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED' } }),
            prisma.order.update({ where: { id: payment.orderId }, data: { paymentStatus: 'FAILED' } }),
          ]);
        }
      }
      break;
    }
    case 'refund.processed': {
      const paymentId = payload?.refund?.entity?.payment_id;
      if (paymentId) {
        const payment = await prisma.payment.findUnique({ where: { razorpayPaymentId: paymentId } });
        if (payment && payment.status !== 'REFUNDED') {
          await prisma.$transaction([
            prisma.payment.update({ where: { id: payment.id }, data: { status: 'REFUNDED', refundedAt: new Date() } }),
            prisma.order.update({ where: { id: payment.orderId }, data: { paymentStatus: 'REFUNDED' } }),
          ]);
        }
      }
      break;
    }
    case 'subscription.activated':
    case 'subscription.charged':
    case 'subscription.halted':
    case 'subscription.pending':
    case 'subscription.cancelled':
    case 'subscription.completed': {
      const entity = payload?.subscription?.entity;
      if (entity) {
        const subscriptionService = require('../subscriptions/subscription.service');
        await subscriptionService.handleWebhookEvent(event, entity).catch(() => {});
      }
      break;
    }
  }

  // Always respond 200 to Razorpay (after verification) so it stops retrying.
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

/**
 * @swagger
 * /api/v1/payments/onboard-store:
 *   post:
 *     summary: Create a Razorpay Route linked account for the caller's store
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Linked account created; razorpayAccountId stored on the store
 */
router.post('/onboard-store', authenticate, asyncHandler(async (req, res) => {
  const { storeId, email, phone, legalName, businessName } = req.body || {};
  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) throw new NotFoundError('Store not found');
  if (store.ownerId !== req.user.id) throw new ForbiddenError('Not your store');

  if (store.razorpayAccountId) {
    return res.json({ razorpayAccountId: store.razorpayAccountId, alreadyOnboarded: true });
  }

  const account = await razorpayService.createLinkedAccount({
    storeId, email, phone, legalName, businessName: businessName || store.name,
  });

  await prisma.store.update({
    where: { id: storeId },
    data: { razorpayAccountId: account.id },
  });

  res.json({ razorpayAccountId: account.id, status: account.status, demo: account.demo || false });
}));

module.exports = router;
