const { cache } = require('../redis');

/**
 * Cache middleware - caches GET responses in Valkey
 * @param {number} ttlSeconds - Time to live in seconds
 * @param {function} keyFn - Function to generate cache key from req (optional)
 */
const cacheMiddleware = (ttlSeconds = 300, keyFn = null) => {
  return async (req, res, next) => {
    if (req.method !== 'GET') return next();

    const key = keyFn ? keyFn(req) : `cache:${req.originalUrl}`;

    // Try cache
    const cached = await cache.get(key);
    if (cached) {
      res.set('X-Cache', 'HIT');
      return res.json(cached);
    }

    // Override res.json to cache the response
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode === 200) {
        cache.set(key, body, ttlSeconds);
      }
      res.set('X-Cache', 'MISS');
      return originalJson(body);
    };

    next();
  };
};

/**
 * Invalidate cache for a pattern
 */
const invalidateCache = async (pattern) => {
  await cache.invalidatePattern(pattern);
};

module.exports = { cacheMiddleware, invalidateCache };
