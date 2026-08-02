const express = require('express');
const router = express.Router();
const orderController = require('./order.controller');
const { asyncHandler } = require('../../shared/utils/asyncHandler');
const { authenticate } = require('../../shared/middleware/auth');

/**
 * @swagger
 * tags:
 *   name: Orders
 *   description: Order placement, tracking, and management
 */

/**
 * @swagger
 * /api/v1/orders:
 *   post:
 *     summary: Place a new order
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [storeId, items, addressId, paymentMethod]
 *             properties:
 *               storeId:
 *                 type: string
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     productId:
 *                       type: string
 *                     variantId:
 *                       type: string
 *                     quantity:
 *                       type: integer
 *               addressId:
 *                 type: string
 *               paymentMethod:
 *                 type: string
 *                 enum: [ONLINE, COD]
 *               couponCode:
 *                 type: string
 *               notes:
 *                 type: string
 *     responses:
 *       201:
 *         description: Order placed
 *       400:
 *         description: Validation error (out of stock, store closed, etc.)
 */
router.post('/', authenticate, asyncHandler(orderController.place));

/**
 * @swagger
 * /api/v1/orders:
 *   get:
 *     summary: List user's orders
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PLACED, ACCEPTED, PREPARING, READY, PICKED, DELIVERED, CANCELLED]
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
 *         description: List of orders
 */
router.get('/', authenticate, asyncHandler(orderController.list));

/**
 * @swagger
 * /api/v1/orders/{id}:
 *   get:
 *     summary: Get order details
 *     tags: [Orders]
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
 *         description: Order details with items
 */
router.get('/:id', authenticate, asyncHandler(orderController.getById));

/**
 * @swagger
 * /api/v1/orders/{id}/status:
 *   patch:
 *     summary: Update order status (vendor/admin)
 *     tags: [Orders]
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
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [ACCEPTED, PREPARING, READY, PICKED, DELIVERED]
 *     responses:
 *       200:
 *         description: Status updated
 */
router.patch('/:id/status', authenticate, asyncHandler(orderController.updateStatus));

/**
 * @swagger
 * /api/v1/orders/{id}/cancel:
 *   post:
 *     summary: Cancel an order
 *     tags: [Orders]
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
 *         description: Order cancelled
 *       400:
 *         description: Cannot cancel at this stage
 */
router.post('/:id/cancel', authenticate, asyncHandler(orderController.cancel));

module.exports = router;
