const express = require('express');
const router = express.Router();
const adminController = require('./admin.controller');
const { asyncHandler } = require('../../shared/utils/asyncHandler');
const { authenticate, authorize } = require('../../shared/middleware/auth');

/**
 * @swagger
 * tags:
 *   name: Admin
 *   description: Admin panel - store approval, user management, platform control
 */

/**
 * @swagger
 * /api/v1/admin/dashboard:
 *   get:
 *     summary: Platform dashboard metrics
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Platform KPIs
 */
router.get('/dashboard', authenticate, asyncHandler(adminController.getDashboard));

/**
 * @swagger
 * /api/v1/admin/stores:
 *   get:
 *     summary: List all stores (with filters)
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
 */
router.get('/stores', authenticate, asyncHandler(adminController.listStores));

/**
 * @swagger
 * /api/v1/admin/stores/{id}/approve:
 *   patch:
 *     summary: Approve a pending store
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
 */
router.patch('/stores/:id/approve', authenticate, asyncHandler(adminController.approveStore));

/**
 * @swagger
 * /api/v1/admin/stores/{id}/suspend:
 *   patch:
 *     summary: Suspend a store
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
 */
router.patch('/stores/:id/suspend', authenticate, asyncHandler(adminController.suspendStore));

/**
 * @swagger
 * /api/v1/admin/users:
 *   get:
 *     summary: List all users
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
 */
router.get('/users', authenticate, asyncHandler(adminController.listUsers));

/**
 * @swagger
 * /api/v1/admin/users/{id}/suspend:
 *   patch:
 *     summary: Suspend a user
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
 */
router.patch('/users/:id/suspend', authenticate, asyncHandler(adminController.suspendUser));

/**
 * @swagger
 * /api/v1/admin/users/{id}/roles:
 *   post:
 *     summary: Assign role to user
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
 */
router.post('/users/:id/roles', authenticate, asyncHandler(adminController.assignRole));

/**
 * @swagger
 * /api/v1/admin/orders:
 *   get:
 *     summary: List all orders platform-wide
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
 */
router.get('/orders', authenticate, asyncHandler(adminController.listOrders));

/**
 * @swagger
 * /api/v1/admin/roles:
 *   get:
 *     summary: List all roles
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of roles with permissions
 */
router.get('/roles', authenticate, asyncHandler(adminController.listRoles));

/**
 * @swagger
 * /api/v1/admin/permissions:
 *   get:
 *     summary: List all permissions
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All available permissions
 */
router.get('/permissions', authenticate, asyncHandler(adminController.listPermissions));

/**
 * @swagger
 * /api/v1/admin/audit-logs:
 *   get:
 *     summary: View audit trail
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
 */
router.get('/audit-logs', authenticate, asyncHandler(adminController.getAuditLogs));

module.exports = router;
