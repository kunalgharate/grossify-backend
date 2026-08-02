const express = require('express');
const router = express.Router();
const { prisma } = require('../../shared/database');
const { asyncHandler } = require('../../shared/utils/asyncHandler');
const { cacheMiddleware } = require('../../shared/middleware/cache');

/**
 * @swagger
 * tags:
 *   name: Categories
 *   description: Store/product category tree
 */

/**
 * @swagger
 * /api/v1/categories:
 *   get:
 *     summary: Get all categories (tree structure)
 *     tags: [Categories]
 *     parameters:
 *       - in: query
 *         name: flat
 *         schema:
 *           type: boolean
 *         description: Return flat list instead of tree
 *     responses:
 *       200:
 *         description: List of categories
 */
router.get('/', cacheMiddleware(3600), asyncHandler(async (req, res) => {
  const categories = await prisma.category.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
    include: { children: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } } },
  });

  if (req.query.flat === 'true') {
    const flat = await prisma.category.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } });
    return res.json({ categories: flat });
  }

  // Return only root categories with children nested
  const roots = categories.filter(c => !c.parentId);
  res.json({ categories: roots });
}));

/**
 * @swagger
 * /api/v1/categories/{slug}:
 *   get:
 *     summary: Get category by slug
 *     tags: [Categories]
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Category details
 */
router.get('/:slug', asyncHandler(async (req, res) => {
  const category = await prisma.category.findUnique({
    where: { slug: req.params.slug },
    include: { children: { where: { isActive: true } } },
  });
  if (!category) return res.status(404).json({ error: 'NOT_FOUND', message: 'Category not found' });
  res.json({ category });
}));

module.exports = router;
