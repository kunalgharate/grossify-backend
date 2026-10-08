const express = require('express');
const router = express.Router();
const { prisma } = require('../../shared/database');
const { asyncHandler } = require('../../shared/utils/asyncHandler');
const { authenticate } = require('../../shared/middleware/auth');
const { NotFoundError } = require('../../shared/errors');
const taxService = require('../tax/tax.service');

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

  // Generate a GST-correct, split-tax invoice via the tax engine (idempotent:
  // returns the existing invoice if one was already generated for this order).
  const invoice = await taxService.finalizeInvoice(order.id);

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

/**
 * @swagger
 * /api/v1/invoices/{orderId}/e-invoice:
 *   post:
 *     summary: Generate an e-invoice (IRN + signed QR) for an order's invoice
 *     tags: [Invoices]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: IRN result (GENERATED or NOT_CONFIGURED) }
 */
router.post('/:orderId/e-invoice', authenticate, asyncHandler(async (req, res) => {
  const einvoice = require('./einvoice.service');
  const invoice = await prisma.invoice.findFirst({
    where: { orderId: req.params.orderId },
    include: {
      order: {
        include: {
          store: true,
          items: { include: { product: { select: { name: true, hsn: true } } } },
        },
      },
    },
  });
  if (!invoice) throw new NotFoundError('Invoice not found');

  const store = invoice.order.store;
  const result = await einvoice.generateIrn({
    invoice: {
      invoiceNo: invoice.invoiceNumber || invoice.id,
      date: (invoice.createdAt || new Date()).toISOString().slice(0, 10),
      taxableValue: Number(invoice.taxableValue || invoice.subtotal || 0),
      cgst: Number(invoice.cgst || 0),
      sgst: Number(invoice.sgst || 0),
      igst: Number(invoice.igst || 0),
      total: Number(invoice.total || 0),
    },
    seller: {
      gstin: store.gstNumber,
      legalName: store.name,
      address: store.address,
      city: store.city,
      pincode: store.pincode,
      stateCode: store.stateCode,
    },
    buyer: { name: 'Customer', stateCode: store.stateCode },
    items: invoice.order.items.map((it) => ({
      name: it.product?.name || 'Item',
      hsn: it.product?.hsn || '',
      qty: it.quantity,
      unitPrice: Number(it.unitPrice),
      taxable: Number(it.totalPrice),
      gstRate: 0,
      total: Number(it.totalPrice),
    })),
  });

  res.json({ eInvoice: result });
}));

module.exports = router;
