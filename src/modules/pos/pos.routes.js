const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../../shared/utils/asyncHandler');
const { authenticate } = require('../../shared/middleware/auth');
const posService = require('./pos.service');

/**
 * @swagger
 * tags:
 *   name: POS
 *   description: Point-of-sale billing (Billing B1)
 */

/**
 * @swagger
 * /api/v1/pos/bills:
 *   post:
 *     summary: Create/sync a POS bill (idempotent by localUuid)
 *     tags: [POS]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Bill created or already existed (idempotent) }
 */
router.post('/bills', authenticate, asyncHandler(async (req, res) => {
  const result = await posService.syncBill(req.user.id, req.body || {});
  res.status(result.alreadyExisted ? 200 : 201).json(result);
}));

/**
 * @swagger
 * /api/v1/pos/bills:
 *   get:
 *     summary: List store bills (online + POS), filterable
 *     tags: [POS]
 *     security: [{ bearerAuth: [] }]
 */
router.get('/bills', authenticate, asyncHandler(async (req, res) => {
  const { storeId, channel, status, page, limit } = req.query;
  const result = await posService.listBills(req.user.id, { storeId, channel, status, page, limit });
  res.json(result);
}));

/**
 * @swagger
 * /api/v1/pos/bills/{id}/hold:
 *   post: { summary: Park a bill (HELD), tags: [POS], security: [{ bearerAuth: [] }] }
 */
router.post('/bills/:id/hold', authenticate, asyncHandler(async (req, res) => {
  const order = await posService.setHold(req.user.id, req.params.id, true);
  res.json({ order });
}));

/**
 * @swagger
 * /api/v1/pos/bills/{id}/resume:
 *   post: { summary: Resume a held bill (PLACED), tags: [POS], security: [{ bearerAuth: [] }] }
 */
router.post('/bills/:id/resume', authenticate, asyncHandler(async (req, res) => {
  const order = await posService.setHold(req.user.id, req.params.id, false);
  res.json({ order });
}));

/**
 * @swagger
 * /api/v1/pos/dayclose:
 *   post: { summary: Compute + persist a day-close (Z-report), tags: [POS], security: [{ bearerAuth: [] }] }
 */
router.post('/dayclose', authenticate, asyncHandler(async (req, res) => {
  const result = await posService.dayClose(req.user.id, req.body || {});
  res.json(result);
}));

module.exports = router;
