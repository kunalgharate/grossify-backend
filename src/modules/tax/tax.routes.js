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
