const express = require('express');
const router = express.Router();
const svc = require('./compliance.service');
const { asyncHandler } = require('../../shared/utils/asyncHandler');
const { authenticate } = require('../../shared/middleware/auth');

/**
 * @swagger
 * tags:
 *   name: Compliance
 *   description: Legal consent, DPDP data rights, grievance redressal
 */

// ── Policies ────────────────────────────────────────────────────────────
router.get('/policies', asyncHandler(async (_req, res) => {
  const policies = await svc.currentPolicies();
  res.json({ policies });
}));

// Admin: set/supersede a policy version (RBAC enforced upstream in production).
router.put('/policies', authenticate, asyncHandler(async (req, res) => {
  const policy = await svc.setPolicyVersion(req.body || {});
  res.status(201).json({ policy });
}));

// ── Consent & acceptance ──────────────────────────────────────────────────
router.post('/consent', authenticate, asyncHandler(async (req, res) => {
  const { policyType, version, purpose, granted } = req.body || {};
  const result = {};
  if (policyType && version) result.acceptance = await svc.acceptPolicy(req.user.id, policyType, version);
  if (purpose !== undefined) result.consent = await svc.setConsent(req.user.id, purpose, granted);
  res.status(201).json(result);
}));

router.get('/consent/me', authenticate, asyncHandler(async (req, res) => {
  res.json(await svc.myConsentState(req.user.id));
}));

// ── DPDP data rights ────────────────────────────────────────────────────
router.post('/data-rights', authenticate, asyncHandler(async (req, res) => {
  const request = await svc.requestDataRight(req.user.id, req.body.type);
  res.status(201).json({ request });
}));

router.post('/account/delete', authenticate, asyncHandler(async (req, res) => {
  const request = await svc.eraseAccount(req.user.id);
  res.json({ request, message: 'Account deletion processed' });
}));

// ── Grievance ─────────────────────────────────────────────────────────────
router.post('/grievances', authenticate, asyncHandler(async (req, res) => {
  const grievance = await svc.raiseGrievance(req.user.id, req.body || {});
  res.status(201).json({ grievance });
}));

router.get('/grievances', authenticate, asyncHandler(async (_req, res) => {
  const grievances = await svc.listGrievances();
  res.json({ grievances });
}));

router.post('/grievances/:id/acknowledge', authenticate, asyncHandler(async (req, res) => {
  const grievance = await svc.acknowledgeGrievance(req.params.id);
  res.json({ grievance });
}));

module.exports = router;
