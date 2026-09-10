const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../../shared/utils/asyncHandler');
const { authenticate } = require('../../shared/middleware/auth');
const purchasesService = require('./purchases.service');

/**
 * @swagger
 * tags: { name: Purchases, description: Suppliers, POs, goods receipt (Phase B2) }
 */

// Suppliers
router.get('/:storeId/suppliers', authenticate, asyncHandler(async (req, res) => {
  res.json({ suppliers: await purchasesService.listSuppliers(req.user.id, req.params.storeId) });
}));
router.post('/:storeId/suppliers', authenticate, asyncHandler(async (req, res) => {
  const supplier = await purchasesService.createSupplier(req.user.id, req.params.storeId, req.body || {});
  res.status(201).json({ supplier });
}));

// Purchase Orders
router.get('/:storeId/orders', authenticate, asyncHandler(async (req, res) => {
  res.json({ purchaseOrders: await purchasesService.listPurchaseOrders(req.user.id, req.params.storeId, req.query) });
}));
router.post('/:storeId/orders', authenticate, asyncHandler(async (req, res) => {
  const po = await purchasesService.createPurchaseOrder(req.user.id, req.params.storeId, req.body || {});
  res.status(201).json({ purchaseOrder: po });
}));

/**
 * Goods Receipt — receive stock (posts PURCHASE_IN + batches). Items may be
 * built by SCANNING barcodes (scan-to-purchase): the client resolves each scan
 * via GET /products/:storeId/barcode/:code, then submits the resolved productId
 * with the received qty/cost/batch here.
 */
router.post('/:storeId/grn', authenticate, asyncHandler(async (req, res) => {
  const grn = await purchasesService.receiveGoods(req.user.id, req.params.storeId, req.body || {});
  res.status(201).json({ goodsReceipt: grn });
}));

module.exports = router;
