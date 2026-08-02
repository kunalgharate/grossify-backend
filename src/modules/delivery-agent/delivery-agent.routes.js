const express = require('express');
const router = express.Router();
const { prisma } = require('../../shared/database');
const { asyncHandler } = require('../../shared/utils/asyncHandler');
const { authenticate } = require('../../shared/middleware/auth');
const { BadRequestError, NotFoundError } = require('../../shared/errors');

/**
 * @swagger
 * tags:
 *   name: DeliveryAgent
 *   description: Delivery agent onboarding, profile, and availability management
 */

/**
 * @swagger
 * /api/v1/delivery-agent/register:
 *   post:
 *     summary: Register as a delivery agent
 *     tags: [DeliveryAgent]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [vehicleType]
 *             properties:
 *               vehicleType:
 *                 type: string
 *                 enum: [bike, scooter, bicycle, walk]
 *               vehicleNumber:
 *                 type: string
 *                 example: "MH12AB1234"
 *               licenseNumber:
 *                 type: string
 *               aadhaarNumber:
 *                 type: string
 *               panNumber:
 *                 type: string
 *               documents:
 *                 type: object
 *                 properties:
 *                   aadhaar_front:
 *                     type: string
 *                   aadhaar_back:
 *                     type: string
 *                   license:
 *                     type: string
 *                   rc:
 *                     type: string
 *                   photo:
 *                     type: string
 *               bankAccountName:
 *                 type: string
 *               bankAccountNumber:
 *                 type: string
 *               bankIfsc:
 *                 type: string
 *               serviceRadius:
 *                 type: integer
 *                 default: 5000
 *                 description: Service radius in meters
 *     responses:
 *       201:
 *         description: Registration submitted (pending verification)
 *       409:
 *         description: Already registered as delivery agent
 */
router.post('/register', authenticate, asyncHandler(async (req, res) => {
  const { vehicleType, vehicleNumber, licenseNumber, aadhaarNumber, panNumber, documents, bankAccountName, bankAccountNumber, bankIfsc, serviceRadius } = req.body;

  if (!vehicleType) throw new BadRequestError('Vehicle type is required');

  // Check if already registered
  const existing = await prisma.deliveryAgent.findUnique({ where: { userId: req.user.id } });
  if (existing) throw new BadRequestError('Already registered as delivery agent');

  const agent = await prisma.deliveryAgent.create({
    data: {
      userId: req.user.id,
      vehicleType,
      vehicleNumber: vehicleNumber || null,
      licenseNumber: licenseNumber || null,
      aadhaarNumber: aadhaarNumber || null,
      panNumber: panNumber || null,
      documents: documents || null,
      bankAccountName: bankAccountName || null,
      bankAccountNumber: bankAccountNumber || null,
      bankIfsc: bankIfsc || null,
      serviceRadius: serviceRadius || 5000,
      status: 'pending',
    },
  });

  res.status(201).json({ agent, message: 'Registration submitted. Verification takes 24-72 hours.' });
}));

/**
 * @swagger
 * /api/v1/delivery-agent/profile:
 *   get:
 *     summary: Get delivery agent profile
 *     tags: [DeliveryAgent]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Agent profile
 */
router.get('/profile', authenticate, asyncHandler(async (req, res) => {
  const agent = await prisma.deliveryAgent.findUnique({
    where: { userId: req.user.id },
    include: { user: { select: { name: true, phone: true, email: true } } },
  });
  if (!agent) throw new NotFoundError('Not registered as delivery agent');
  res.json({ agent });
}));

/**
 * @swagger
 * /api/v1/delivery-agent/profile:
 *   put:
 *     summary: Update delivery agent profile
 *     tags: [DeliveryAgent]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               vehicleType:
 *                 type: string
 *               vehicleNumber:
 *                 type: string
 *               serviceRadius:
 *                 type: integer
 *               bankAccountName:
 *                 type: string
 *               bankAccountNumber:
 *                 type: string
 *               bankIfsc:
 *                 type: string
 *     responses:
 *       200:
 *         description: Profile updated
 */
router.put('/profile', authenticate, asyncHandler(async (req, res) => {
  const agent = await prisma.deliveryAgent.findUnique({ where: { userId: req.user.id } });
  if (!agent) throw new NotFoundError('Not registered as delivery agent');

  const allowedFields = ['vehicleType', 'vehicleNumber', 'serviceRadius', 'bankAccountName', 'bankAccountNumber', 'bankIfsc', 'documents'];
  const data = {};
  for (const f of allowedFields) {
    if (req.body[f] !== undefined) data[f] = req.body[f];
  }

  const updated = await prisma.deliveryAgent.update({ where: { id: agent.id }, data });
  res.json({ agent: updated, message: 'Profile updated' });
}));

/**
 * @swagger
 * /api/v1/delivery-agent/go-online:
 *   patch:
 *     summary: Set agent as online (available for deliveries)
 *     tags: [DeliveryAgent]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [lat, lng]
 *             properties:
 *               lat:
 *                 type: number
 *               lng:
 *                 type: number
 *     responses:
 *       200:
 *         description: Now online
 */
router.patch('/go-online', authenticate, asyncHandler(async (req, res) => {
  const { lat, lng } = req.body;
  if (!lat || !lng) throw new BadRequestError('Location (lat, lng) required');

  const agent = await prisma.deliveryAgent.findUnique({ where: { userId: req.user.id } });
  if (!agent) throw new NotFoundError('Not registered as delivery agent');
  if (agent.status !== 'active') throw new BadRequestError('Agent not verified yet');

  await prisma.deliveryAgent.update({
    where: { id: agent.id },
    data: { isOnline: true, currentLat: lat, currentLng: lng },
  });

  res.json({ isOnline: true, message: 'You are now online and will receive delivery requests' });
}));

/**
 * @swagger
 * /api/v1/delivery-agent/go-offline:
 *   patch:
 *     summary: Set agent as offline
 *     tags: [DeliveryAgent]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Now offline
 */
router.patch('/go-offline', authenticate, asyncHandler(async (req, res) => {
  const agent = await prisma.deliveryAgent.findUnique({ where: { userId: req.user.id } });
  if (!agent) throw new NotFoundError('Not registered as delivery agent');

  await prisma.deliveryAgent.update({ where: { id: agent.id }, data: { isOnline: false } });
  res.json({ isOnline: false, message: 'You are now offline' });
}));

/**
 * @swagger
 * /api/v1/delivery-agent/update-location:
 *   patch:
 *     summary: Update agent's current location (called frequently during delivery)
 *     tags: [DeliveryAgent]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [lat, lng]
 *             properties:
 *               lat:
 *                 type: number
 *               lng:
 *                 type: number
 *     responses:
 *       200:
 *         description: Location updated
 */
router.patch('/update-location', authenticate, asyncHandler(async (req, res) => {
  const { lat, lng } = req.body;
  if (!lat || !lng) throw new BadRequestError('lat and lng required');

  await prisma.deliveryAgent.update({
    where: { userId: req.user.id },
    data: { currentLat: lat, currentLng: lng },
  });

  res.json({ message: 'Location updated' });
}));

/**
 * @swagger
 * /api/v1/delivery-agent/verify/{id}:
 *   patch:
 *     summary: Verify/activate a delivery agent (admin)
 *     tags: [DeliveryAgent]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: DeliveryAgent ID
 *     responses:
 *       200:
 *         description: Agent verified and activated
 */
router.patch('/verify/:id', authenticate, asyncHandler(async (req, res) => {
  const agent = await prisma.deliveryAgent.findUnique({ where: { id: req.params.id } });
  if (!agent) throw new NotFoundError('Agent not found');

  const updated = await prisma.deliveryAgent.update({
    where: { id: req.params.id },
    data: { status: 'active', verifiedAt: new Date() },
  });

  // Notify agent
  await prisma.notification.create({
    data: {
      userId: agent.userId,
      title: 'Verification Complete!',
      body: 'Your delivery agent profile is verified. Go online to start receiving orders.',
      type: 'system',
    },
  });

  res.json({ agent: updated, message: 'Agent verified and activated' });
}));

/**
 * @swagger
 * /api/v1/delivery-agent/pending:
 *   get:
 *     summary: List pending delivery agent applications (admin)
 *     tags: [DeliveryAgent]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Pending agents list
 */
router.get('/pending', authenticate, asyncHandler(async (req, res) => {
  const agents = await prisma.deliveryAgent.findMany({
    where: { status: 'pending' },
    include: { user: { select: { id: true, name: true, phone: true } } },
    orderBy: { createdAt: 'asc' },
  });
  res.json({ agents, count: agents.length });
}));

module.exports = router;
