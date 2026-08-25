const express = require('express');
const router = express.Router();
const adminController = require('./admin.controller');
const { asyncHandler } = require('../../shared/utils/asyncHandler');
const { authenticate, requireStaff, requireRoles } = require('../../shared/middleware/auth');
const { auditLog } = require('../../shared/middleware/auditLog');

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

module.exports = router;
