const express = require('express');
const router = express.Router();
const wishlistService = require('./wishlist.service');
const { asyncHandler } = require('../../shared/utils/asyncHandler');
const { authenticate } = require('../../shared/middleware/auth');

/**
 * @swagger
 * tags:
 *   name: Wishlist
 *   description: Customer save-for-later / favourites
 */

/**
 * @swagger
 * /api/v1/wishlist:
 *   get:
 *     summary: List the authenticated user's wishlist
 *     tags: [Wishlist]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Wishlist items with product details }
 */
router.get('/', authenticate, asyncHandler(async (req, res) => {
  const items = await wishlistService.list(req.user.id);
  res.json({ items });
}));

/**
 * @swagger
 * /api/v1/wishlist:
 *   post:
 *     summary: Add a product to the wishlist (idempotent)
 *     tags: [Wishlist]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [productId]
 *             properties:
 *               productId: { type: string }
 *     responses:
 *       201: { description: Added }
 */
router.post('/', authenticate, asyncHandler(async (req, res) => {
  const result = await wishlistService.add(req.user.id, req.body.productId);
  res.status(201).json(result);
}));

/**
 * @swagger
 * /api/v1/wishlist/{productId}:
 *   delete:
 *     summary: Remove a product from the wishlist
 *     tags: [Wishlist]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Removed }
 */
router.delete('/:productId', authenticate, asyncHandler(async (req, res) => {
  const result = await wishlistService.remove(req.user.id, req.params.productId);
  res.json(result);
}));

module.exports = router;
