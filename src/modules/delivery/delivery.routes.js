const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../../shared/utils/asyncHandler');
const { authenticate, requireDeliveryAgent } = require('../../shared/middleware/auth');
const controller = require('./delivery.controller');

/**
 * @swagger
 * /api/v1/delivery/courier/webhook:
 *   post:
 *     summary: Inbound courier tracking webhook (PUBLIC; aggregator → us)
 *     tags: [Delivery]
 *     responses:
 *       200: { description: Event accepted (normalized or ignored) }
 */
// PUBLIC — must be declared BEFORE the router-level authenticate below, since
// courier aggregators POST here without a user token. Signature verification
// (COURIER_WEBHOOK_SECRET) is the auth mechanism for this endpoint.
router.post('/courier/webhook', asyncHandler(async (req, res) => {
  const courier = require('./courier.service');
  const event = courier.normalizeTrackingEvent(req.body || {});
  if (!event) return res.json({ accepted: false, reason: 'ignored/unknown status' });
  // TODO(live): verify COURIER_WEBHOOK_SECRET, persist tracking event, advance
  // the order/Shipment status. Side-effect-free until courier creds are live.
  res.json({ accepted: true, event });
}));

/**
 * @swagger
 * tags:
 *   name: Delivery
 *   description: Delivery agent operations (pickup workflow, earnings)
 */

// Every route BELOW here is agent-facing: authenticate, then require a
// DeliveryAgent profile. The 'delivery' role is derived from that profile, not
// an RBAC role, so requireRoles('delivery') would never match.
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

/**
 * @swagger
 * /api/v1/delivery/estimate:
 *   get:
 *     summary: Distance + ETA between two points (Google Maps or haversine)
 *     tags: [Delivery]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: fromLat, required: true, schema: { type: number } }
 *       - { in: query, name: fromLng, required: true, schema: { type: number } }
 *       - { in: query, name: toLat, required: true, schema: { type: number } }
 *       - { in: query, name: toLng, required: true, schema: { type: number } }
 *     responses:
 *       200: { description: "{ source, distanceKm, etaMinutes }" }
 */
router.get('/estimate', authenticate, asyncHandler(async (req, res) => {
  const routing = require('./routing.service');
  const { fromLat, fromLng, toLat, toLng } = req.query;
  const result = await routing.estimate(
    { lat: Number(fromLat), lng: Number(fromLng) },
    { lat: Number(toLat), lng: Number(toLng) },
  );
  res.json({ estimate: result });
}));

module.exports = router;
