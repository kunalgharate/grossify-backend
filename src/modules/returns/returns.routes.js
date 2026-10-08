const express = require('express');
const router = express.Router();
const returnsService = require('./returns.service');
const { asyncHandler } = require('../../shared/utils/asyncHandler');
const { authenticate } = require('../../shared/middleware/auth');

/**
 * @swagger
 * tags:
 *   name: Returns
 *   description: Customer-initiated returns, replacement & exchange
 */

/**
 * @swagger
 * /api/v1/returns/eligibility:
 *   get:
 *     summary: Per-item return eligibility for an order
 *     tags: [Returns]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: orderId
 *         required: true
 *         schema: { type: string }
 */
router.get('/eligibility', authenticate, asyncHandler(async (req, res) => {
  const result = await returnsService.eligibility(req.user.id, req.query.orderId);
  res.json(result);
}));

/**
 * @swagger
 * /api/v1/returns:
 *   get: { summary: List my return requests, tags: [Returns], security: [{ bearerAuth: [] }] }
 *   post:
 *     summary: Create a return/replace/exchange request
 *     tags: [Returns]
 *     security: [{ bearerAuth: [] }]
 */
router.get('/', authenticate, asyncHandler(async (req, res) => {
  const items = req.query.role === 'vendor'
    ? await returnsService.listForVendor(req.user.id)
    : await returnsService.listForCustomer(req.user.id);
  res.json({ returns: items });
}));

router.post('/', authenticate, asyncHandler(async (req, res) => {
  const result = await returnsService.create(req.user.id, req.body || {});
  res.status(201).json(result);
}));

/**
 * @swagger
 * /api/v1/returns/{id}/cancel:
 *   post: { summary: Cancel a pending return (customer), tags: [Returns], security: [{ bearerAuth: [] }] }
 */
router.post('/:id/cancel', authenticate, asyncHandler(async (req, res) => {
  const returnRequest = await returnsService.cancel(req.user.id, req.params.id);
  res.json({ returnRequest });
}));

// ── Vendor/admin actions ─────────────────────────────────────────────────
router.post('/:id/approve', authenticate, asyncHandler(async (req, res) => {
  const returnRequest = await returnsService.decide(req.user.id, req.params.id, true, req.body.note);
  res.json({ returnRequest });
}));

router.post('/:id/reject', authenticate, asyncHandler(async (req, res) => {
  const returnRequest = await returnsService.decide(req.user.id, req.params.id, false, req.body.note);
  res.json({ returnRequest });
}));

router.post('/:id/pickup', authenticate, asyncHandler(async (req, res) => {
  const returnRequest = await returnsService.markPickedUp(req.user.id, req.params.id);
  res.json({ returnRequest });
}));

router.post('/:id/qc', authenticate, asyncHandler(async (req, res) => {
  const returnRequest = await returnsService.qc(req.user.id, req.params.id, req.body.pass === true, req.body.note);
  res.json({ returnRequest });
}));

module.exports = router;
