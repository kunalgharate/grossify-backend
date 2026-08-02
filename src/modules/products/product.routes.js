const express = require('express');
const router = express.Router();
const productController = require('./product.controller');
const { asyncHandler } = require('../../shared/utils/asyncHandler');
const { authenticate } = require('../../shared/middleware/auth');

/**
 * @swagger
 * tags:
 *   name: Products
 *   description: Product catalog, variants, inventory
 */

/**
 * @swagger
 * /api/v1/products:
 *   get:
 *     summary: List products (filter by store, category, search)
 *     tags: [Products]
 *     parameters:
 *       - in: query
 *         name: storeId
 *         schema:
 *           type: string
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Category slug
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
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
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [price_asc, price_desc, newest, popular]
 *     responses:
 *       200:
 *         description: List of products
 */
router.get('/', asyncHandler(productController.list));

/**
 * @swagger
 * /api/v1/products/{id}:
 *   get:
 *     summary: Get product details by ID
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Product details with variants
 *       404:
 *         description: Product not found
 */
router.get('/:id', asyncHandler(productController.getById));

/**
 * @swagger
 * /api/v1/products:
 *   post:
 *     summary: Create a new product (vendor)
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [storeId, name, categoryId, mrp, sellingPrice]
 *             properties:
 *               storeId:
 *                 type: string
 *               name:
 *                 type: string
 *                 example: Tata Salt 1kg
 *               description:
 *                 type: string
 *               categoryId:
 *                 type: string
 *               mrp:
 *                 type: number
 *                 example: 28
 *               sellingPrice:
 *                 type: number
 *                 example: 25
 *               stockQuantity:
 *                 type: integer
 *                 example: 50
 *               unit:
 *                 type: string
 *                 enum: [piece, kg, litre, pack, gram, ml]
 *                 default: piece
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *               barcode:
 *                 type: string
 *               attributes:
 *                 type: object
 *                 example: {"brand": "Tata", "weight": "1kg"}
 *               variants:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     variantName:
 *                       type: string
 *                       example: "500g"
 *                     variantType:
 *                       type: string
 *                       example: "weight"
 *                     priceOverride:
 *                       type: number
 *                     stockQuantity:
 *                       type: integer
 *     responses:
 *       201:
 *         description: Product created
 *       403:
 *         description: Plan product limit reached
 */
router.post('/', authenticate, asyncHandler(productController.create));

/**
 * @swagger
 * /api/v1/products/{id}:
 *   put:
 *     summary: Update product
 *     tags: [Products]
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
 *               sellingPrice:
 *                 type: number
 *               stockQuantity:
 *                 type: integer
 *               isAvailable:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Product updated
 */
router.put('/:id', authenticate, asyncHandler(productController.update));

/**
 * @swagger
 * /api/v1/products/{id}:
 *   delete:
 *     summary: Delete product (soft delete)
 *     tags: [Products]
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
 *         description: Product deleted
 */
router.delete('/:id', authenticate, asyncHandler(productController.remove));

module.exports = router;
