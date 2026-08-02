const express = require('express');
const router = express.Router();
const storeController = require('./store.controller');
const { asyncHandler } = require('../../shared/utils/asyncHandler');
const { authenticate, authorize } = require('../../shared/middleware/auth');

/**
 * @swagger
 * tags:
 *   name: Stores
 *   description: Store discovery, registration, and management
 */

/**
 * @swagger
 * /api/v1/stores/nearby:
 *   get:
 *     summary: Find nearby stores by location
 *     tags: [Stores]
 *     parameters:
 *       - in: query
 *         name: lat
 *         required: true
 *         schema:
 *           type: number
 *         example: 19.076
 *       - in: query
 *         name: lng
 *         required: true
 *         schema:
 *           type: number
 *         example: 72.877
 *       - in: query
 *         name: radius
 *         schema:
 *           type: integer
 *           default: 3000
 *         description: Radius in meters
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Category slug filter
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: List of nearby stores
 */
router.get('/nearby', asyncHandler(storeController.getNearby));

/**
 * @swagger
 * /api/v1/stores/{id}:
 *   get:
 *     summary: Get store details by ID or slug
 *     tags: [Stores]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Store details
 *       404:
 *         description: Store not found
 */
router.get('/:id', asyncHandler(storeController.getById));

/**
 * @swagger
 * /api/v1/stores:
 *   post:
 *     summary: Register a new store (vendor)
 *     tags: [Stores]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, categoryId, address, city, state, pincode, latitude, longitude]
 *             properties:
 *               name:
 *                 type: string
 *                 example: Fresh Mart
 *               categoryId:
 *                 type: string
 *               description:
 *                 type: string
 *               address:
 *                 type: string
 *                 example: "123, MG Road"
 *               city:
 *                 type: string
 *                 example: Pune
 *               state:
 *                 type: string
 *                 example: Maharashtra
 *               pincode:
 *                 type: string
 *                 example: "411001"
 *               latitude:
 *                 type: number
 *                 example: 18.5204
 *               longitude:
 *                 type: number
 *                 example: 73.8567
 *               phone:
 *                 type: string
 *               gstNumber:
 *                 type: string
 *               fssaiNumber:
 *                 type: string
 *     responses:
 *       201:
 *         description: Store registration submitted (pending approval)
 *       401:
 *         description: Not authenticated
 */
router.post('/', authenticate, asyncHandler(storeController.create));

/**
 * @swagger
 * /api/v1/stores/{id}:
 *   put:
 *     summary: Update store details
 *     tags: [Stores]
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
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               isOpen:
 *                 type: boolean
 *               businessHours:
 *                 type: object
 *     responses:
 *       200:
 *         description: Store updated
 *       403:
 *         description: Not authorized
 */
router.put('/:id', authenticate, asyncHandler(storeController.update));

module.exports = router;
