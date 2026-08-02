const express = require('express');
const router = express.Router();
const subscriptionController = require('./subscription.controller');
const { asyncHandler } = require('../../shared/utils/asyncHandler');
const { authenticate } = require('../../shared/middleware/auth');

/**
 * @swagger
 * tags:
 *   name: Subscriptions
 *   description: Vendor subscription plans and billing
 */

/**
 * @swagger
 * /api/v1/subscriptions/plans:
 *   get:
 *     summary: Get available subscription plans
 *     tags: [Subscriptions]
 *     parameters:
 *       - in: query
 *         name: categoryType
 *         schema:
 *           type: string
 *           enum: [grocery, electronics, meat-dairy-bakery, hardware-specialty, general]
 *         description: Filter plans by store category type
 *     responses:
 *       200:
 *         description: List of plans
 */
router.get('/plans', asyncHandler(subscriptionController.getPlans));

/**
 * @swagger
 * /api/v1/subscriptions:
 *   post:
 *     summary: Subscribe to a plan (vendor)
 *     tags: [Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [planId, storeId]
 *             properties:
 *               planId:
 *                 type: string
 *               storeId:
 *                 type: string
 *               billingCycle:
 *                 type: string
 *                 enum: [monthly, annual]
 *                 default: monthly
 *     responses:
 *       201:
 *         description: Subscription created (14-day trial)
 */
router.post('/', authenticate, asyncHandler(subscriptionController.subscribe));

/**
 * @swagger
 * /api/v1/subscriptions/current:
 *   get:
 *     summary: Get current subscription for user's store
 *     tags: [Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current subscription details
 */
router.get('/current', authenticate, asyncHandler(subscriptionController.getCurrent));

module.exports = router;
