const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../../shared/utils/asyncHandler');
const { BadRequestError } = require('../../shared/errors');
const searchService = require('./search.service');

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
 *         description: Search query (min 2 chars)
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
 *         description: Search results (stores + products). Uses Meilisearch when configured, else PostgreSQL.
 */
router.get('/', asyncHandler(async (req, res) => {
  const { q, category, page = 1, limit = 20 } = req.query;
  if (!q || q.trim().length < 2) {
    throw new BadRequestError('Search query must be at least 2 characters');
  }
  const result = await searchService.search({ q: q.trim(), category, page, limit });
  res.json(result);
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
  const suggestions = await searchService.autocomplete(req.query.q);
  res.json({ suggestions });
}));

module.exports = router;
