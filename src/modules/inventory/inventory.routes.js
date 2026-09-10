const express = require('express');
const router = express.Router();
const { prisma } = require('../../shared/database');
const { asyncHandler } = require('../../shared/utils/asyncHandler');
const { authenticate } = require('../../shared/middleware/auth');
const { ForbiddenError, NotFoundError, BadRequestError } = require('../../shared/errors');
const inventoryService = require('./inventory.service');

/**
 * @swagger
 * tags: { name: Inventory, description: Stock ledger (Phase B2) }
 */

async function requireOwnStore(userId, storeId) {
  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) throw new NotFoundError('Store not found');
  if (store.ownerId !== userId) throw new ForbiddenError('Not your store');
  return store;
}

/** Product stock-ledger history. */
router.get('/:storeId/product/:productId/ledger', authenticate, asyncHandler(async (req, res) => {
  await requireOwnStore(req.user.id, req.params.storeId);
  const result = await inventoryService.history(req.params.storeId, req.params.productId, req.query);
  res.json(result);
}));

/** Low-stock (at/below reorder level). */
router.get('/:storeId/low-stock', authenticate, asyncHandler(async (req, res) => {
  await requireOwnStore(req.user.id, req.params.storeId);
  const products = await inventoryService.lowStock(req.params.storeId);
  res.json({ products });
}));

/** Manual stock adjustment / wastage. body: { productId, type, quantity, reason } */
router.post('/:storeId/adjust', authenticate, asyncHandler(async (req, res) => {
  await requireOwnStore(req.user.id, req.params.storeId);
  const { productId, type = 'ADJUSTMENT', quantity, reason } = req.body || {};
  if (!productId || quantity == null) throw new BadRequestError('productId and quantity are required');
  if (!['ADJUSTMENT', 'WASTAGE', 'RETURN_IN'].includes(type)) {
    throw new BadRequestError('type must be ADJUSTMENT | WASTAGE | RETURN_IN');
  }
  const result = await inventoryService.post({
    storeId: req.params.storeId, productId, type, quantity,
    referenceType: 'ADJUSTMENT', reason: reason || null, createdBy: req.user.id,
  });
  res.json(result);
}));

module.exports = router;
