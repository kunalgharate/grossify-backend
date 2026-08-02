const config = require('./config');

/**
 * Redis/Valkey client - uses ioredis (compatible with both Redis and Valkey)
 * Valkey is a free, open-source Redis fork (drop-in replacement)
 * Used for: caching, session store, rate limiting, BullMQ
 */

let redis = null;

try {
  const Redis = require('ioredis');
  redis = new Redis(config.redis.url, {
    maxRetriesPerRequest: null, // Required by BullMQ
    lazyConnect: true,
    retryStrategy: (times) => {
      if (times > 3) return null;
      return Math.min(times * 200, 2000);
    },
  });

  redis.on('error', () => {});

  redis.on('connect', () => {
    console.log('📦 Valkey/Redis connected');
  });
} catch (e) {
  // Valkey/Redis not available - continue without it
}

/**
 * Simple cache helper with fallback when Redis unavailable
 */
const cache = {
  async get(key) {
    if (!redis) return null;
    try {
      const val = await redis.get(key);
      return val ? JSON.parse(val) : null;
    } catch { return null; }
  },

  async set(key, value, ttlSeconds = 300) {
    if (!redis) return;
    try {
      await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch {}
  },

  async del(key) {
    if (!redis) return;
    try { await redis.del(key); } catch {}
  },

  async invalidatePattern(pattern) {
    if (!redis) return;
    try {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) await redis.del(...keys);
    } catch {}
  },
};

module.exports = { redis, cache };
