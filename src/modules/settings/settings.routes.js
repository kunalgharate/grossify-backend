const express = require('express');
const router = express.Router();
const svc = require('./settings.service');
const { asyncHandler } = require('../../shared/utils/asyncHandler');
const { authenticate, requireRoles } = require('../../shared/middleware/auth');

/**
 * @swagger
 * tags: { name: Settings, description: Platform + per-store configuration }
 */

/**
 * @swagger
 * /api/v1/settings/effective:
 *   get:
 *     summary: Effective settings (DEFAULTS <- PLATFORM <- STORE)
 *     tags: [Settings]
 *     parameters:
 *       - { in: query, name: storeId, schema: { type: string } }
 *     responses: { 200: { description: Effective config } }
 */
router.get('/effective', asyncHandler(async (req, res) => {
  res.json({ settings: await svc.getEffective(req.query.storeId || null) });
}));

/**
 * @swagger
 * /api/v1/settings/platform:
 *   get: { summary: Platform settings (staff), tags: [Settings], security: [{ bearerAuth: [] }] }
 *   put: { summary: Update platform settings (admin), tags: [Settings], security: [{ bearerAuth: [] }] }
 */
router.get('/platform', authenticate, requireRoles('admin', 'manager'), asyncHandler(async (_req, res) => {
  res.json({ settings: await svc.list('PLATFORM') });
}));

router.put('/platform', authenticate, requireRoles('admin'), asyncHandler(async (req, res) => {
  const count = await svc.update('PLATFORM', null, req.body || {});
  res.json({ updated: count, settings: await svc.list('PLATFORM') });
}));

/**
 * @swagger
 * /api/v1/settings/store/{storeId}:
 *   get: { summary: Store settings, tags: [Settings], security: [{ bearerAuth: [] }] }
 *   put: { summary: Update store settings (owner), tags: [Settings], security: [{ bearerAuth: [] }] }
 */
router.get('/store/:storeId', authenticate, asyncHandler(async (req, res) => {
  res.json({ settings: await svc.list('STORE', req.params.storeId) });
}));

router.put('/store/:storeId', authenticate, asyncHandler(async (req, res) => {
  // Ownership: a vendor may only edit their own store's settings.
  const { prisma } = require('../../shared/database');
  const store = await prisma.store.findUnique({ where: { id: req.params.storeId }, select: { ownerId: true } });
  if (!store) return res.status(404).json({ error: 'NOT_FOUND', message: 'Store not found' });
  if (store.ownerId !== req.user.id) {
    return res.status(403).json({ error: 'FORBIDDEN', message: 'Not your store' });
  }
  const count = await svc.update('STORE', req.params.storeId, req.body || {});
  res.json({ updated: count, settings: await svc.list('STORE', req.params.storeId) });
}));

module.exports = router;
