const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../../shared/utils/asyncHandler');
const { authenticate } = require('../../shared/middleware/auth');
const { BadRequestError } = require('../../shared/errors');
const barcodeService = require('./barcode.service');

/**
 * @swagger
 * tags: { name: Barcode, description: Product barcode generate + scan resolve (Phase B2) }
 */

/**
 * Ensure a product has a barcode — returns the manufacturer barcode if present,
 * else generates a unique internal EAN-13 (for loose/unpackaged products).
 * POST /api/v1/barcode/product/:productId/ensure
 */
router.post('/product/:productId/ensure', authenticate, asyncHandler(async (req, res) => {
  const result = await barcodeService.ensureBarcode(req.user.id, req.params.productId);
  res.json(result);
}));

/**
 * Assign a scanned manufacturer barcode to a packaged product.
 * POST /api/v1/barcode/product/:productId/assign  { barcode }
 */
router.post('/product/:productId/assign', authenticate, asyncHandler(async (req, res) => {
  const { barcode } = req.body || {};
  const result = await barcodeService.assignManufacturerBarcode(req.user.id, req.params.productId, barcode);
  res.json(result);
}));

/**
 * Resolve a scanned barcode to a product within a store. Used by BOTH
 * scan-to-bill (POS) and scan-to-purchase (GRN).
 * GET /api/v1/barcode/:storeId/resolve/:code
 */
router.get('/:storeId/resolve/:code', authenticate, asyncHandler(async (req, res) => {
  const { storeId, code } = req.params;
  if (!code) throw new BadRequestError('code is required');
  const product = await barcodeService.resolveScan(storeId, code);
  res.json({ product });
}));

module.exports = router;
