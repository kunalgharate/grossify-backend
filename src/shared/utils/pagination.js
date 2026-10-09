'use strict';

/**
 * Pure, DB-agnostic pagination helpers.
 *
 * Backward-compatible by design: `parsePagination` only opts a request into
 * paged mode when the client explicitly sends `page` and/or `limit`. Existing
 * callers that send neither keep receiving the full result set (paged === false),
 * so wiring these helpers into a previously-unpaginated endpoint does not change
 * its default response shape beyond ADDING a `pagination` meta object.
 */

/**
 * Parse page/limit query params into Prisma-friendly skip/take.
 *
 * @param {object} query - typically req.query
 * @param {object} [opts]
 * @param {number} [opts.defaultLimit=20]
 * @param {number} [opts.maxLimit=50]
 * @returns {{ paged: boolean, page: number, limit: number, skip: number, take: number }}
 */
function parsePagination(query = {}, opts = {}) {
  const defaultLimit = opts.defaultLimit ?? 20;
  const maxLimit = opts.maxLimit ?? 50;

  const hasPage = query.page !== undefined && query.page !== null && query.page !== '';
  const hasLimit = query.limit !== undefined && query.limit !== null && query.limit !== '';
  const paged = hasPage || hasLimit;

  let page = parseInt(query.page, 10);
  if (!Number.isFinite(page) || page < 1) page = 1;

  let limit = parseInt(query.limit, 10);
  if (!Number.isFinite(limit) || limit < 1) limit = defaultLimit;
  limit = Math.min(limit, maxLimit);

  return {
    paged,
    page,
    limit,
    skip: (page - 1) * limit,
    take: limit,
  };
}

/**
 * Build the standard `pagination` meta object used across the API
 * (mirrors GET /vendor/orders: { page, limit, total, hasNext }).
 *
 * @param {number} page
 * @param {number} limit
 * @param {number} total
 * @returns {{ page: number, limit: number, total: number, hasNext: boolean }}
 */
function buildPagination(page, limit, total) {
  const safeTotal = Number.isFinite(total) ? total : 0;
  return {
    page,
    limit,
    total: safeTotal,
    hasNext: page * limit < safeTotal,
  };
}

module.exports = { parsePagination, buildPagination };
