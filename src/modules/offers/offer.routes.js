const express = require('express');
const router = express.Router();
const { prisma } = require('../../shared/database');
const { asyncHandler } = require('../../shared/utils/asyncHandler');
const { authenticate } = require('../../shared/middleware/auth');
const { BadRequestError, NotFoundError, ForbiddenError } = require('../../shared/errors');

/**
 * @swagger
 * tags:
 *   name: Offers
 *   description: Store offers and deals management (vendor)
 */

/**
 * @swagger
 * /api/v1/offers:
 *   get:
 *     summary: List offers (optionally by store)
 *     tags: [Offers]
 *     parameters:
 *       - in: query
 *         name: storeId
 *         schema:
 *           type: string
 *       - in: query
 *         name: active
 *         schema:
 *           type: boolean
 *           default: true
 *     responses:
 *       200:
 *         description: List of offers
 */
router.get('/', asyncHandler(async (req, res) => {
  const { storeId, active } = req.query;
  const where = {};
  if (storeId) where.storeId = storeId;
  if (active !== 'false') {
    where.isActive = true;
    where.validUntil = { gte: new Date() };
  }

  const offers = await prisma.offer.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: { store: { select: { id: true, name: true } } },
  });

  res.json({ offers });
}));

/**
 * @swagger
 * /api/v1/offers:
 *   post:
 *     summary: Create a new offer (vendor)
 *     tags: [Offers]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [storeId, title, discountType, discountValue, validFrom, validUntil]
 *             properties:
 *               storeId:
 *                 type: string
 *               title:
 *                 type: string
 *                 example: "10% off on first order"
 *               description:
 *                 type: string
 *               discountType:
 *                 type: string
 *                 enum: [percentage, flat]
 *               discountValue:
 *                 type: number
 *                 example: 10
 *               minOrderValue:
 *                 type: number
 *               maxDiscount:
 *                 type: number
 *               code:
 *                 type: string
 *                 example: FIRST10
 *               validFrom:
 *                 type: string
 *                 format: date-time
 *               validUntil:
 *                 type: string
 *                 format: date-time
 *               usageLimit:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Offer created
 */
router.post('/', authenticate, asyncHandler(async (req, res) => {
  const { storeId, title, description, discountType, discountValue, minOrderValue, maxDiscount, code, validFrom, validUntil, usageLimit } = req.body;

  if (!storeId || !title || !discountType || !discountValue || !validFrom || !validUntil) {
    throw new BadRequestError('Required: storeId, title, discountType, discountValue, validFrom, validUntil');
  }

  // Verify store ownership
  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) throw new NotFoundError('Store not found');
  if (store.ownerId !== req.user.id) throw new ForbiddenError('Not your store');

  const offer = await prisma.offer.create({
    data: {
      storeId, title, description, discountType, discountValue,
      minOrderValue: minOrderValue || null, maxDiscount: maxDiscount || null,
      code: code || null, validFrom: new Date(validFrom), validUntil: new Date(validUntil),
      usageLimit: usageLimit || null,
    },
  });

  res.status(201).json({ offer, message: 'Offer created' });
}));

/**
 * @swagger
 * /api/v1/offers/{id}:
 *   put:
 *     summary: Update an offer
 *     tags: [Offers]
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
 *         description: Offer updated
 */
router.put('/:id', authenticate, asyncHandler(async (req, res) => {
  const offer = await prisma.offer.findUnique({ where: { id: req.params.id }, include: { store: true } });
  if (!offer) throw new NotFoundError('Offer not found');
  if (offer.store.ownerId !== req.user.id) throw new ForbiddenError('Not your offer');

  const updated = await prisma.offer.update({ where: { id: req.params.id }, data: req.body });
  res.json({ offer: updated, message: 'Offer updated' });
}));

/**
 * @swagger
 * /api/v1/offers/{id}:
 *   delete:
 *     summary: Deactivate an offer
 *     tags: [Offers]
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
 *         description: Offer deactivated
 */
router.delete('/:id', authenticate, asyncHandler(async (req, res) => {
  const offer = await prisma.offer.findUnique({ where: { id: req.params.id }, include: { store: true } });
  if (!offer) throw new NotFoundError('Offer not found');
  if (offer.store.ownerId !== req.user.id) throw new ForbiddenError('Not your offer');

  await prisma.offer.update({ where: { id: req.params.id }, data: { isActive: false } });
  res.json({ message: 'Offer deactivated' });
}));

module.exports = router;
