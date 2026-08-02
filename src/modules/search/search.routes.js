const express = require('express');
const router = express.Router();
const { prisma } = require('../../shared/database');
const { asyncHandler } = require('../../shared/utils/asyncHandler');
const { BadRequestError } = require('../../shared/errors');

/**
 * @swagger
 * tags:
 *   name: Search
 *   description: Search stores and products
 */

/**
 * @swagger
 * /api/v1/search:
 *   get:
 *     summary: Search stores and products
 *     tags: [Search]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Search query
 *       - in: query
 *         name: lat
 *         schema:
 *           type: number
 *       - in: query
 *         name: lng
 *         schema:
 *           type: number
 *       - in: query
 *         name: category
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
 *         description: Search results (stores + products)
 */
router.get('/', asyncHandler(async (req, res) => {
  const { q, lat, lng, category, page = 1, limit = 20 } = req.query;

  if (!q || q.trim().length < 2) {
    throw new BadRequestError('Search query must be at least 2 characters');
  }

  const pageNum = parseInt(page);
  const limitNum = Math.min(parseInt(limit) || 20, 50);

  // Search stores
  const storeWhere = {
    status: 'ACTIVE',
    OR: [
      { name: { contains: q, mode: 'insensitive' } },
      { description: { contains: q, mode: 'insensitive' } },
    ],
  };

  // Search products
  const productWhere = {
    status: 'ACTIVE',
    store: { status: 'ACTIVE' },
    OR: [
      { name: { contains: q, mode: 'insensitive' } },
      { description: { contains: q, mode: 'insensitive' } },
    ],
  };

  if (category) {
    const cat = await prisma.category.findUnique({ where: { slug: category } });
    if (cat) {
      storeWhere.categoryId = cat.id;
      productWhere.categoryId = cat.id;
    }
  }

  const [stores, products] = await Promise.all([
    prisma.store.findMany({
      where: storeWhere,
      take: 5,
      select: { id: true, name: true, slug: true, logoUrl: true, rating: true, city: true, latitude: true, longitude: true },
    }),
    prisma.product.findMany({
      where: productWhere,
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
      select: {
        id: true, name: true, images: true, sellingPrice: true, mrp: true,
        store: { select: { id: true, name: true, slug: true } },
      },
    }),
  ]);

  const productTotal = await prisma.product.count({ where: productWhere });

  res.json({
    results: { stores, products },
    pagination: { page: pageNum, limit: limitNum, total: productTotal },
  });
}));

/**
 * @swagger
 * /api/v1/search/autocomplete:
 *   get:
 *     summary: Autocomplete suggestions
 *     tags: [Search]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Suggestions list
 */
router.get('/autocomplete', asyncHandler(async (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 2) return res.json({ suggestions: [] });

  const products = await prisma.product.findMany({
    where: { name: { contains: q, mode: 'insensitive' }, status: 'ACTIVE' },
    select: { name: true },
    take: 10,
    distinct: ['name'],
  });

  const suggestions = products.map(p => p.name);
  res.json({ suggestions });
}));

module.exports = router;
