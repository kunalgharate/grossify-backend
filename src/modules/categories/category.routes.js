const express = require('express');
const router = express.Router();
const { prisma } = require('../../shared/database');
const { asyncHandler } = require('../../shared/utils/asyncHandler');
const { cacheMiddleware, invalidateCache } = require('../../shared/middleware/cache');
const { authenticate, requireStaff, requireRoles } = require('../../shared/middleware/auth');
const { auditLog } = require('../../shared/middleware/auditLog');
const categoryService = require('./category.service');

/**
 * @swagger
 * /api/v1/categories/admin:
 *   get:
 *     summary: List all categories for staff, including inactive categories
 *     tags: [Categories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100 }
 *     responses:
 *       200:
 *         description: Categories and pagination metadata
 *       403:
 *         description: Requires a staff role
 */
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

router.get('/admin', authenticate, requireStaff, asyncHandler(async (req, res) => {
  const result = await categoryService.listAdmin(req.query);
  res.json(result);
}));

/**
 * @swagger
 * /api/v1/categories/admin:
 *   post:
 *     summary: Create a catalog category
 *     tags: [Categories]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string }
 *               slug: { type: string }
 *               parentId: { type: string, nullable: true }
 *               icon: { type: string }
 *               sortOrder: { type: integer }
 *               radius: { type: integer }
 *     responses:
 *       201:
 *         description: Category created
 *       403:
 *         description: Requires admin or manager
 */
router.post(
  '/admin',
  authenticate,
  requireRoles('admin', 'manager'),
  auditLog('categories.create'),
  asyncHandler(async (req, res) => {
    const category = await categoryService.create(req.body || {});
    await invalidateCache('cache:/api/v1/categories*');
    res.status(201).json({ category });
  }),
);

/**
 * @swagger
 * /api/v1/categories/admin/{id}:
 *   patch:
 *     summary: Update a category or reactivate an inactive category
 *     tags: [Categories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Category updated
 *       403:
 *         description: Requires admin or manager
 *       404:
 *         description: Category not found
 */
router.patch(
  '/admin/:id',
  authenticate,
  requireRoles('admin', 'manager'),
  auditLog('categories.update'),
  asyncHandler(async (req, res) => {
    const category = await categoryService.update(req.params.id, req.body || {});
    await invalidateCache('cache:/api/v1/categories*');
    res.json({ category });
  }),
);

/**
 * @swagger
 * /api/v1/categories/admin/{id}:
 *   delete:
 *     summary: Deactivate a category without deleting historical references
 *     tags: [Categories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Category deactivated
 *       400:
 *         description: Active child categories must be deactivated first
 */
router.delete(
  '/admin/:id',
  authenticate,
  requireRoles('admin', 'manager'),
  auditLog('categories.deactivate'),
  asyncHandler(async (req, res) => {
    const category = await categoryService.deactivate(req.params.id);
    await invalidateCache('cache:/api/v1/categories*');
    res.json({ category, message: 'Category deactivated' });
  }),
);

/**
 * @swagger
 * /api/v1/categories/admin/{id}/hard:
 *   delete:
 *     summary: Permanently delete a deactivated, unreferenced category
 *     tags: [Categories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Category permanently deleted
 *       400:
 *         description: Category is active or still referenced by other records
 *       404:
 *         description: Category not found
 */
router.delete(
  '/admin/:id/hard',
  authenticate,
  requireRoles('admin', 'manager'),
  auditLog('categories.hardDelete'),
  asyncHandler(async (req, res) => {
    const category = await categoryService.remove(req.params.id);
    await invalidateCache('cache:/api/v1/categories*');
    res.json({ category, message: 'Category permanently deleted' });
  }),
);

/**
 * @swagger
 * /api/v1/categories/admin/{id}:
 *   get:
 *     summary: Get a single category by id (staff view)
 *     tags: [Categories]
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
 *         description: Category details
 *       403:
 *         description: Requires a staff role
 *       404:
 *         description: Category not found
 */
router.get('/admin/:id', authenticate, requireStaff, asyncHandler(async (req, res) => {
  const category = await categoryService.getById(req.params.id);
  res.json({ category });
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
  if (!category || !category.isActive) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Category not found' });
  }
  res.json({ category });
}));

module.exports = router;
