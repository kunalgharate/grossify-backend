const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../../shared/utils/asyncHandler');
const { authenticate } = require('../../shared/middleware/auth');
const svc = require('./restaurant.service');

/**
 * @swagger
 * tags: { name: Restaurant, description: Menu, modifiers, tables, KOT (Phase B3) }
 */

// Menu
router.get('/:storeId/menu', authenticate, asyncHandler(async (req, res) => {
  res.json({ menu: await svc.listMenu(req.user.id, req.params.storeId) });
}));
router.post('/:storeId/menu', authenticate, asyncHandler(async (req, res) => {
  res.status(201).json({ item: await svc.createMenuItem(req.user.id, req.params.storeId, req.body || {}) });
}));

// Modifier groups
router.post('/:storeId/modifier-groups', authenticate, asyncHandler(async (req, res) => {
  res.status(201).json({ group: await svc.createModifierGroup(req.user.id, req.params.storeId, req.body || {}) });
}));

// Tables
router.get('/:storeId/tables', authenticate, asyncHandler(async (req, res) => {
  res.json({ tables: await svc.listTables(req.user.id, req.params.storeId) });
}));
router.post('/:storeId/tables', authenticate, asyncHandler(async (req, res) => {
  res.status(201).json({ table: await svc.createTable(req.user.id, req.params.storeId, req.body || {}) });
}));
router.patch('/:storeId/tables/:tableId/status', authenticate, asyncHandler(async (req, res) => {
  const { status, currentOrderId } = req.body || {};
  const table = await svc.setTableStatus(req.user.id, req.params.storeId, req.params.tableId, status, currentOrderId);
  res.json({ table });
}));

// KOT
router.get('/:storeId/kots', authenticate, asyncHandler(async (req, res) => {
  res.json({ kots: await svc.listKots(req.user.id, req.params.storeId, req.query) });
}));
router.post('/:storeId/kots/fire', authenticate, asyncHandler(async (req, res) => {
  res.status(201).json({ kots: await svc.fireKot(req.user.id, req.params.storeId, req.body || {}) });
}));
router.patch('/:storeId/kots/:kotId/status', authenticate, asyncHandler(async (req, res) => {
  const kot = await svc.updateKotStatus(req.user.id, req.params.storeId, req.params.kotId, (req.body || {}).status);
  res.json({ kot });
}));

module.exports = router;
