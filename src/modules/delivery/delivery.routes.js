const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../../shared/utils/asyncHandler');
const { authenticate, requireDeliveryAgent } = require('../../shared/middleware/auth');
const controller = require('./delivery.controller');

/**
 * @swagger
 * tags:
 *   name: Delivery
 *   description: Delivery agent operations (pickup workflow, earnings)
 */

// Every route here is agent-facing: authenticate, then require a DeliveryAgent
// profile. The 'delivery' role is derived from that profile, not an RBAC role,
// so requireRoles('delivery') would never match — requireDeliveryAgent is the gate.
router.use(authenticate, requireDeliveryAgent);

/**
 * @swagger
 * /api/v1/delivery/available:
 *   get:
 *     summary: Orders ready for pickup and not yet claimed
 *     tags: [Delivery]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Unclaimed READY orders (with store + drop address)
 *       403:
 *         description: Not registered as a delivery agent
 */
router.get('/available', asyncHandler(controller.getAvailable));

/**
 * @swagger
 * /api/v1/delivery/my-deliveries:
 *   get:
 *     summary: The calling agent's deliveries
 *     tags: [Delivery]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PICKED, DELIVERED]
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Delivery history (paginated)
 */
router.get('/my-deliveries', asyncHandler(controller.myDeliveries));

/**
 * @swagger
 * /api/v1/delivery/earnings:
 *   get:
 *     summary: Delivery agent earnings summary (today + lifetime)
 *     tags: [Delivery]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Earnings summary
 */
router.get('/earnings', asyncHandler(controller.earnings));

/**
 * @swagger
 * /api/v1/delivery/{orderId}/accept:
 *   post:
 *     summary: Accept (claim) a delivery — assigns the agent and moves READY→PICKED
 *     tags: [Delivery]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Delivery accepted
 *       400:
 *         description: Not ready, or already assigned to another agent
 *       404:
 *         description: Order not found
 */
router.post('/:orderId/accept', asyncHandler(controller.accept));

/**
 * @swagger
 * /api/v1/delivery/{orderId}/delivered:
 *   post:
 *     summary: Mark the agent's order as delivered (PICKED→DELIVERED)
 *     tags: [Delivery]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Order delivered
 *       400:
 *         description: Not your delivery, or not in transit
 *       404:
 *         description: Order not found
 */
router.post('/:orderId/delivered', asyncHandler(controller.markDelivered));

module.exports = router;
