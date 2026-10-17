const express = require('express');
const router = express.Router();
const kycService = require('../stores/kyc.service');
const adminController = require('./admin.controller');
const { asyncHandler } = require('../../shared/utils/asyncHandler');
const { authenticate, requireStaff, requireRoles } = require('../../shared/middleware/auth');
const { auditLog } = require('../../shared/middleware/auditLog');
const adminOffersService = require('./admin-offers.service');

/**
 * @swagger
 * tags:
 *   name: Admin
 *   description: >
 *     Admin / ops panel — store approval, user management, platform control.
 *     Every route requires a back-office staff role. Read endpoints admit any
 *     staff (admin/manager/support); store & user mutations require admin or
 *     manager; role assignment and the roles/permissions/audit catalogs are
 *     admin-only. Access is denied with 403 otherwise.
 */

// All admin routes require authentication first; role tier is enforced per-route.
router.use(authenticate);

/**
 * @swagger
 * /api/v1/admin/dashboard:
 *   get:
 *     summary: Platform dashboard metrics
 *     description: Requires any staff role (admin, manager, or support).
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Platform KPIs
 *       403:
 *         description: Not a staff user
 */
router.get('/dashboard', requireStaff, asyncHandler(adminController.getDashboard));

/**
 * @swagger
 * /api/v1/admin/stores:
 *   get:
 *     summary: List all stores (with filters)
 *     description: Requires any staff role.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, ACTIVE, SUSPENDED, DEACTIVATED]
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of stores
 *       403:
 *         description: Not a staff user
 */
router.get('/stores', requireStaff, asyncHandler(adminController.listStores));

/**
 * @swagger
 * /api/v1/admin/stores/{id}/approve:
 *   patch:
 *     summary: Approve a pending store
 *     description: Requires admin or manager role.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Store approved
 *       403:
 *         description: Requires admin or manager
 */
router.patch(
  '/stores/:id/approve',
  requireRoles('admin', 'manager'),
  auditLog('stores.approve'),
  asyncHandler(adminController.approveStore),
);

/**
 * @swagger
 * /api/v1/admin/stores/{id}/suspend:
 *   patch:
 *     summary: Suspend a store
 *     description: Requires admin or manager role.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Store suspended
 *       403:
 *         description: Requires admin or manager
 */
router.patch(
  '/stores/:id/suspend',
  requireRoles('admin', 'manager'),
  auditLog('stores.suspend'),
  asyncHandler(adminController.suspendStore),
);

/**
 * @swagger
 * /api/v1/admin/stores/{id}/reactivate:
 *   patch:
 *     summary: Reactivate a suspended store
 *     description: Sets a SUSPENDED/DEACTIVATED store back to ACTIVE. Requires admin or manager role.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Store reactivated
 *       403:
 *         description: Requires admin or manager
 */
router.patch(
  '/stores/:id/reactivate',
  requireRoles('admin', 'manager'),
  auditLog('stores.reactivate'),
  asyncHandler(adminController.reactivateStore),
);

/**
 * @swagger
 * /api/v1/admin/users:
 *   get:
 *     summary: List all users
 *     description: Requires any staff role.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [ACTIVE, SUSPENDED, DEACTIVATED]
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of users
 *       403:
 *         description: Not a staff user
 */
router.get('/users', requireStaff, asyncHandler(adminController.listUsers));

/**
 * @swagger
 * /api/v1/admin/users/{id}/suspend:
 *   patch:
 *     summary: Suspend a user
 *     description: Requires admin or manager role.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User suspended
 *       403:
 *         description: Requires admin or manager
 */
router.patch(
  '/users/:id/suspend',
  requireRoles('admin', 'manager'),
  auditLog('users.suspend'),
  asyncHandler(adminController.suspendUser),
);

/**
 * @swagger
 * /api/v1/admin/users/{id}/reactivate:
 *   patch:
 *     summary: Reactivate a suspended user
 *     description: Sets a SUSPENDED/DEACTIVATED user back to ACTIVE. Requires admin or manager role.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User reactivated
 *       403:
 *         description: Requires admin or manager
 */
router.patch(
  '/users/:id/reactivate',
  requireRoles('admin', 'manager'),
  auditLog('users.reactivate'),
  asyncHandler(adminController.reactivateUser),
);

/**
 * @swagger
 * /api/v1/admin/users/{id}/roles:
 *   post:
 *     summary: Assign role to user
 *     description: Privilege-escalating operation — admin only (Super Admin / Admin).
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [roleId]
 *             properties:
 *               roleId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Role assigned
 *       403:
 *         description: Requires admin
 */
router.post(
  '/users/:id/roles',
  requireRoles('admin'),
  auditLog('users.assign_role'),
  asyncHandler(adminController.assignRole),
);

/**
 * @swagger
 * /api/v1/admin/orders:
 *   get:
 *     summary: List all orders platform-wide
 *     description: Requires any staff role.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *       - in: query
 *         name: storeId
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: All orders
 *       403:
 *         description: Not a staff user
 */
router.get('/orders', requireStaff, asyncHandler(adminController.listOrders));

/**
 * @swagger
 * /api/v1/admin/offers:
 *   get:
 *     summary: List offers for moderation
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [ACTIVE, INACTIVE] }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 50 }
 *     responses:
 *       200: { description: Paginated offers and their stores }
 *       403: { description: Requires staff role }
 */
router.get('/offers', requireStaff, asyncHandler(async (req, res) => {
  res.json(await adminOffersService.listOffers(req.query));
}));

/**
 * @swagger
 * /api/v1/admin/offers/{id}/status:
 *   patch:
 *     summary: Activate or deactivate an offer
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [isActive]
 *             properties:
 *               isActive: { type: boolean }
 *     responses:
 *       200: { description: Offer moderation status updated }
 *       403: { description: Requires admin or manager role }
 *       404: { description: Offer not found }
 */
router.patch(
  '/offers/:id/status',
  requireRoles('admin', 'manager'),
  auditLog('offers.moderate'),
  asyncHandler(async (req, res) => {
    const offer = await adminOffersService.setOfferActive(req.params.id, req.body?.isActive);
    res.json({ offer, message: offer.isActive ? 'Offer activated' : 'Offer deactivated' });
  }),
);

/**
 * @swagger
 * /api/v1/admin/roles:
 *   get:
 *     summary: List all roles
 *     description: Admin only — used by the role-assignment UI.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of roles with permissions
 *       403:
 *         description: Requires admin
 */
router.get('/roles', requireRoles('admin'), asyncHandler(adminController.listRoles));

/**
 * @swagger
 * /api/v1/admin/permissions:
 *   get:
 *     summary: List all permissions
 *     description: Admin only.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All available permissions
 *       403:
 *         description: Requires admin
 */
router.get('/permissions', requireRoles('admin'), asyncHandler(adminController.listPermissions));

/**
 * @swagger
 * /api/v1/admin/audit-logs:
 *   get:
 *     summary: View audit trail
 *     description: Security-sensitive — admin only.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Audit log entries
 *       403:
 *         description: Requires admin
 */
router.get('/audit-logs', requireRoles('admin'), asyncHandler(adminController.getAuditLogs));

/**
 * @swagger
 * /api/v1/admin/fraud/customer/{customerId}:
 *   get:
 *     summary: Risk-score a customer for fraud / RTO abuse
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: customerId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Risk assessment (score, level, flags, recommendation) }
 *       403: { description: Requires staff }
 */
router.get(
  '/fraud/customer/:customerId',
  requireStaff,
  asyncHandler(async (req, res) => {
    const fraudService = require('./fraud.service');
    const assessment = await fraudService.assessCustomer(req.params.customerId);
    res.json({ assessment });
  }),
);

/**
 * @swagger
 * /api/v1/admin/kyc/queue:
 *   get:
 *     summary: Stores awaiting KYC verification
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: KYC review queue } }
 */
router.get('/kyc/queue', requireRoles('admin', 'manager'), asyncHandler(async (req, res) => {
  const kyc = require('../stores/kyc.service');
  const queue = await kyc.kycQueue();
  res.json({ queue });
}));

/**
 * @swagger
 * /api/v1/admin/stores/{id}/kyc:
 *   get: { summary: A store's KYC status + documents (admin/manager reviewer access), tags: [Admin], security: [{ bearerAuth: [] }] }
 *   post:
 *     summary: Verify or reject a store's KYC (admin/manager)
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               approve: { type: boolean }
 *               reason: { type: string }
 *               aadhaarVerified: { type: boolean }
 *     responses: { 200: { description: Updated store KYC } }
 */
router.get('/stores/:id/kyc', requireRoles('admin', 'manager'), asyncHandler(async (req, res) => {
  res.json(await kycService.getKyc(req.params.id, { reviewer: true }));
}));

/**
 * @swagger
 * /api/v1/admin/stores/{id}/kyc/documents/{documentId}/file:
 *   get:
 *     summary: Download a private KYC file for review
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: documentId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Private document file }
 *       403: { description: Requires admin or manager }
 *       404: { description: File unavailable or legacy document must be resubmitted }
 */
router.get(
  '/stores/:id/kyc/documents/:documentId/file',
  requireRoles('admin', 'manager'),
  auditLog('stores.kyc.document.read'),
  asyncHandler(async (req, res, next) => {
    const { filePath, contentType } = await kycService.getDocumentFile(req.params.id, req.params.documentId, {
      reviewer: true,
    });
    res.type(contentType);
    res.set('Cache-Control', 'private, no-store');
    res.download(filePath, (error) => {
      if (error) next(error);
    });
  }),
);

router.post(
  '/stores/:id/kyc',
  requireRoles('admin', 'manager'),
  auditLog('stores.kyc.review'),
  asyncHandler(async (req, res) => {
    const store = await kycService.reviewKyc(req.params.id, req.body || {});
    res.json({ store, message: req.body.approve ? 'KYC verified' : 'KYC rejected' });
  }),
);

module.exports = router;
