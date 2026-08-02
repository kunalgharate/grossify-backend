const express = require('express');
const router = express.Router();
const userController = require('./user.controller');
const { asyncHandler } = require('../../shared/utils/asyncHandler');
const { authenticate } = require('../../shared/middleware/auth');

/**
 * @swagger
 * tags:
 *   name: Users
 *   description: User profile and address management
 */

/**
 * @swagger
 * /api/v1/users/profile:
 *   get:
 *     summary: Get current user's profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile
 */
router.get('/profile', authenticate, asyncHandler(userController.getProfile));

/**
 * @swagger
 * /api/v1/users/profile:
 *   put:
 *     summary: Update user profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *     responses:
 *       200:
 *         description: Profile updated
 */
router.put('/profile', authenticate, asyncHandler(userController.updateProfile));

/**
 * @swagger
 * /api/v1/users/addresses:
 *   get:
 *     summary: Get user's delivery addresses
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of addresses
 */
router.get('/addresses', authenticate, asyncHandler(userController.getAddresses));

/**
 * @swagger
 * /api/v1/users/addresses:
 *   post:
 *     summary: Add a delivery address
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [fullAddress, city, pincode, latitude, longitude]
 *             properties:
 *               label:
 *                 type: string
 *                 example: Home
 *               fullAddress:
 *                 type: string
 *                 example: "123, MG Road, Pune"
 *               landmark:
 *                 type: string
 *               city:
 *                 type: string
 *                 example: Pune
 *               pincode:
 *                 type: string
 *                 example: "411001"
 *               latitude:
 *                 type: number
 *                 example: 18.5204
 *               longitude:
 *                 type: number
 *                 example: 73.8567
 *               isDefault:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Address added
 */
router.post('/addresses', authenticate, asyncHandler(userController.addAddress));

/**
 * @swagger
 * /api/v1/users/addresses/{id}:
 *   delete:
 *     summary: Delete an address
 *     tags: [Users]
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
 *         description: Address deleted
 */
router.delete('/addresses/:id', authenticate, asyncHandler(userController.deleteAddress));

module.exports = router;
