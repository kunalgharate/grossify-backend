const express = require('express');
const router = express.Router();
const { prisma } = require('../../shared/database');
const { asyncHandler } = require('../../shared/utils/asyncHandler');
const { authenticate } = require('../../shared/middleware/auth');
const { BadRequestError, NotFoundError } = require('../../shared/errors');
const taxService = require('./tax.service');

/**
 * @swagger
 * tags:
 *   name: Tax
 *   description: GST tax quoting (Billing B0)
 */

/**
 * @swagger
 * /api/v1/tax/quote:
 *   post:
 *     summary: Preview the GST breakup for a bill (online checkout or POS)
 *     tags: [Tax]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [storeId, lines]
 *             properties:
 *               storeId: { type: string }
 *               placeOfSupplyStateCode: { type: integer }
 *               lines:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     qty: { type: number }
 *                     unitPrice: { type: number }
 *                     rate: { type: number }
 *                     hsnSac: { type: string }
 *                     isTaxInclusive: { type: boolean }
 *               billDiscount:
 *                 type: object
 *                 properties:
 *                   type: { type: string, enum: [PERCENT, FLAT] }
 *                   value: { type: number }
 *     responses:
 *       200:
 *         description: Tax breakdown (per-line + totals + rate-wise summary)
 */
router.post('/quote', authenticate, asyncHandler(async (req, res) => {
  const { storeId, placeOfSupplyStateCode, lines, billDiscount } = req.body || {};
  if (!storeId || !Array.isArray(lines) || lines.length === 0) {
    throw new BadRequestError('storeId and a non-empty lines[] are required');
  }

  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: {
      id: true, stateCode: true, gstScheme: true, gstNumber: true,
      vendorType: true, restaurantTaxProfile: true,
    },
  });
  if (!store) throw new NotFoundError('Store not found');

  const result = await taxService.quoteOrder({
    store,
    placeOfSupplyStateCode: placeOfSupplyStateCode ?? store.stateCode,
    lines,
    billDiscount: billDiscount || null,
  });

  res.json(result);
}));

/**
 * @swagger
 * /api/v1/tax/rates:
 *   get:
 *     summary: The GST rate master (for offline cache hydration)
 *     tags: [Tax]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of effective-dated GST rates
 */
router.get('/rates', authenticate, asyncHandler(async (req, res) => {
  const rates = await prisma.gstRate.findMany({
    select: {
      hsnCode: true, rate: true, cessRate: true,
      effectiveFrom: true, effectiveUntil: true, regime: true,
    },
    orderBy: [{ effectiveFrom: 'desc' }],
  });
  res.json({ rates });
}));

module.exports = router;

/**
 * @swagger
 * /api/v1/tax/rates:
 *   post:
 *     summary: Create a GST rate entry (admin only)
 *     tags: [Tax]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [rate, effectiveFrom]
 *             properties:
 *               hsnCode: { type: string }
 *               rate: { type: number }
 *               cessRate: { type: number }
 *               effectiveFrom: { type: string, format: date }
 *               effectiveUntil: { type: string, format: date }
 *               regime: { type: string }
 *     responses:
 *       201: { description: Rate created }
 */
router.post('/rates', authenticate, asyncHandler(async (req, res) => {
  const { hsnCode, rate, cessRate = 0, effectiveFrom, effectiveUntil, regime } = req.body || {};
  if (rate == null || !effectiveFrom) {
    throw new (require('../../shared/errors').BadRequestError)('rate and effectiveFrom are required');
  }
  const entry = await prisma.gstRate.create({
    data: {
      hsnCode: hsnCode || null,
      rate: parseFloat(rate),
      cessRate: parseFloat(cessRate) || 0,
      effectiveFrom: new Date(effectiveFrom),
      effectiveUntil: effectiveUntil ? new Date(effectiveUntil) : null,
      regime: regime || null,
    },
  });
  res.status(201).json({ rate: entry });
}));

/**
 * @swagger
 * /api/v1/tax/rates/{id}:
 *   put:
 *     summary: Update a GST rate entry (admin only)
 *     tags: [Tax]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Rate updated }
 */
router.put('/rates/:id', authenticate, asyncHandler(async (req, res) => {
  const allowed = ['hsnCode', 'rate', 'cessRate', 'effectiveFrom', 'effectiveUntil', 'regime'];
  const data = {};
  for (const k of allowed) {
    if (req.body[k] !== undefined) {
      if (k === 'effectiveFrom' || k === 'effectiveUntil') {
        data[k] = req.body[k] ? new Date(req.body[k]) : null;
      } else if (k === 'rate' || k === 'cessRate') {
        data[k] = parseFloat(req.body[k]);
      } else {
        data[k] = req.body[k];
      }
    }
  }
  const entry = await prisma.gstRate.update({ where: { id: req.params.id }, data });
  res.json({ rate: entry });
}));
