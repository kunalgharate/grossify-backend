const express = require('express');
const router = express.Router();
const { prisma } = require('../../shared/database');
const { asyncHandler } = require('../../shared/utils/asyncHandler');
const { authenticate } = require('../../shared/middleware/auth');
const { BadRequestError, NotFoundError } = require('../../shared/errors');

/**
 * @swagger
 * tags:
 *   name: Catalog
 *   description: Master product catalog (admin manages, vendors pick from it)
 */

/**
 * @swagger
 * /api/v1/catalog:
 *   get:
 *     summary: Browse master catalog
 *     tags: [Catalog]
 *     parameters:
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
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Master products list
 */
router.get('/', asyncHandler(async (req, res) => {
  const { category, search, page = 1, limit = 20 } = req.query;
  const pageNum = parseInt(page);
  const limitNum = Math.min(parseInt(limit) || 20, 50);
  const where = { isActive: true };

  if (category) {
    const cat = await prisma.category.findUnique({ where: { slug: category } });
    if (cat) where.categoryId = cat.id;
  }

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { brand: { contains: search, mode: 'insensitive' } },
      { barcode: { equals: search } },
    ];
  }

  const [products, total] = await Promise.all([
    prisma.masterProduct.findMany({
      where, skip: (pageNum - 1) * limitNum, take: limitNum,
      orderBy: { name: 'asc' },
      include: { category: { select: { name: true, slug: true } } },
    }),
    prisma.masterProduct.count({ where }),
  ]);

  res.json({ products, pagination: { page: pageNum, limit: limitNum, total } });
}));

/**
 * @swagger
 * /api/v1/catalog/{id}:
 *   get:
 *     summary: Get master product by ID or barcode
 *     tags: [Catalog]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Master product details
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const product = await prisma.masterProduct.findFirst({
    where: { OR: [{ id: req.params.id }, { barcode: req.params.id }, { slug: req.params.id }] },
    include: { category: true },
  });
  if (!product) throw new NotFoundError('Product not found in catalog');
  res.json({ product });
}));

/**
 * @swagger
 * /api/v1/catalog:
 *   post:
 *     summary: Add product to master catalog (admin)
 *     tags: [Catalog]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, categoryId, mrp]
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Tata Salt 1kg"
 *               categoryId:
 *                 type: string
 *               brand:
 *                 type: string
 *                 example: "Tata"
 *               description:
 *                 type: string
 *               mrp:
 *                 type: number
 *                 example: 28
 *               unit:
 *                 type: string
 *               barcode:
 *                 type: string
 *               hsn:
 *                 type: string
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *               attributes:
 *                 type: object
 *     responses:
 *       201:
 *         description: Product added to catalog
 */
router.post('/', authenticate, asyncHandler(async (req, res) => {
  const { name, categoryId, brand, description, mrp, unit, barcode, hsn, images, attributes } = req.body;

  if (!name || !categoryId || !mrp) throw new BadRequestError('name, categoryId, mrp required');

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    + '-' + Math.random().toString(36).substring(2, 6);

  const product = await prisma.masterProduct.create({
    data: { name, slug, categoryId, brand, description, mrp, unit: unit || 'piece', barcode, hsn, images: images || [], attributes },
  });

  res.status(201).json({ product, message: 'Added to master catalog' });
}));

/**
 * @swagger
 * /api/v1/catalog/{id}/add-to-store:
 *   post:
 *     summary: Vendor picks product from catalog and adds to their store
 *     tags: [Catalog]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Master product ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [storeId, sellingPrice, stockQuantity]
 *             properties:
 *               storeId:
 *                 type: string
 *               sellingPrice:
 *                 type: number
 *               stockQuantity:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Product added to vendor's store from catalog
 */
router.post('/:id/add-to-store', authenticate, asyncHandler(async (req, res) => {
  const { storeId, sellingPrice, stockQuantity } = req.body;
  if (!storeId || !sellingPrice) throw new BadRequestError('storeId and sellingPrice required');

  const masterProduct = await prisma.masterProduct.findUnique({ where: { id: req.params.id } });
  if (!masterProduct) throw new NotFoundError('Master product not found');

  // Verify store ownership
  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store || store.ownerId !== req.user.id) throw new BadRequestError('Invalid store');

  const slug = masterProduct.slug + '-' + Math.random().toString(36).substring(2, 6);

  const product = await prisma.product.create({
    data: {
      storeId,
      name: masterProduct.name,
      slug,
      description: masterProduct.description,
      categoryId: masterProduct.categoryId,
      mrp: masterProduct.mrp,
      sellingPrice,
      stockQuantity: stockQuantity || 0,
      unit: masterProduct.unit,
      images: masterProduct.images,
      barcode: masterProduct.barcode,
      hsn: masterProduct.hsn,
      attributes: masterProduct.attributes,
    },
  });

  res.status(201).json({ product, message: 'Product added to your store from catalog' });
}));

module.exports = router;
