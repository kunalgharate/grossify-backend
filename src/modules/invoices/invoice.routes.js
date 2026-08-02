const express = require('express');
const router = express.Router();
const { prisma } = require('../../shared/database');
const { asyncHandler } = require('../../shared/utils/asyncHandler');
const { authenticate } = require('../../shared/middleware/auth');
const { NotFoundError } = require('../../shared/errors');

/**
 * @swagger
 * tags:
 *   name: Invoices
 *   description: Invoice generation and management (Phase 3)
 */

/**
 * @swagger
 * /api/v1/invoices/order/{orderId}:
 *   get:
 *     summary: Get or generate invoice for an order
 *     tags: [Invoices]
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
 *         description: Invoice details
 */
router.get('/order/:orderId', authenticate, asyncHandler(async (req, res) => {
  const order = await prisma.order.findUnique({
    where: { id: req.params.orderId },
    include: { items: true, store: { select: { id: true, name: true, gstNumber: true, address: true } } },
  });
  if (!order) throw new NotFoundError('Order not found');

  // Check if invoice already exists
  let invoice = await prisma.invoice.findUnique({ where: { orderId: order.id } });

  if (!invoice) {
    // Generate invoice
    const date = new Date();
    const invoiceNumber = `INV-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}-${Math.floor(Math.random() * 100000).toString().padStart(5, '0')}`;

    // Calculate tax (GST 18% on convenience fee only — platform service)
    const taxAmount = Math.round(parseFloat(order.convenienceFee) * 0.18 * 100) / 100;

    invoice = await prisma.invoice.create({
      data: {
        invoiceNumber,
        orderId: order.id,
        storeId: order.storeId,
        customerId: order.customerId,
        subtotal: order.subtotal,
        convenienceFee: order.convenienceFee,
        deliveryFee: order.deliveryFee,
        discount: order.discount,
        taxAmount,
        total: order.total,
        status: order.paymentStatus === 'PAID' ? 'paid' : 'generated',
        paidAt: order.paymentStatus === 'PAID' ? new Date() : null,
      },
    });
  }

  res.json({
    invoice,
    order: {
      orderNumber: order.orderNumber,
      items: order.items,
      store: order.store,
    },
  });
}));

/**
 * @swagger
 * /api/v1/invoices:
 *   get:
 *     summary: List user's invoices
 *     tags: [Invoices]
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
 *         description: Invoice list
 */
router.get('/', authenticate, asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const pageNum = parseInt(page);
  const limitNum = Math.min(parseInt(limit) || 20, 50);

  const [invoices, total] = await Promise.all([
    prisma.invoice.findMany({
      where: { customerId: req.user.id },
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
      orderBy: { createdAt: 'desc' },
      include: { store: { select: { name: true } }, order: { select: { orderNumber: true, status: true } } },
    }),
    prisma.invoice.count({ where: { customerId: req.user.id } }),
  ]);

  res.json({ invoices, pagination: { page: pageNum, limit: limitNum, total } });
}));

/**
 * @swagger
 * /api/v1/invoices/store:
 *   get:
 *     summary: List invoices for vendor's store
 *     tags: [Invoices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Store invoices
 */
router.get('/store', authenticate, asyncHandler(async (req, res) => {
  const store = await prisma.store.findFirst({ where: { ownerId: req.user.id } });
  if (!store) throw new NotFoundError('Store not found');

  const { page = 1, limit = 20 } = req.query;
  const pageNum = parseInt(page);
  const limitNum = parseInt(limit) || 20;

  const [invoices, total] = await Promise.all([
    prisma.invoice.findMany({
      where: { storeId: store.id },
      skip: (pageNum - 1) * limitNum, take: limitNum,
      orderBy: { createdAt: 'desc' },
      include: { customer: { select: { name: true, phone: true } }, order: { select: { orderNumber: true } } },
    }),
    prisma.invoice.count({ where: { storeId: store.id } }),
  ]);

  res.json({ invoices, pagination: { page: pageNum, limit: limitNum, total } });
}));

module.exports = router;
