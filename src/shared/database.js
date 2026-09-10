const { PrismaClient } = require('@prisma/client');

/**
 * Prisma client with resilience for Neon's serverless pooler.
 *
 * Neon suspends idle compute; the first query after idle can fail with a
 * transient connection error (P1001 "Can't reach database server", P1017
 * "Server has closed the connection") while the compute wakes. We transparently
 * retry those transient errors with a short backoff so callers don't see
 * cold-start blips. Non-transient errors (validation, unique violations, etc.)
 * are never retried.
 */

const MAX_RETRIES = Number(process.env.DB_MAX_RETRIES) || 4;
const BASE_DELAY_MS = Number(process.env.DB_RETRY_DELAY_MS) || 400;

const TRANSIENT_CODES = new Set(['P1001', 'P1002', 'P1008', 'P1017']);
const TRANSIENT_PATTERNS = [
  /can't reach database server/i,
  /server has closed the connection/i,
  /connection.*(closed|terminated|reset)/i,
  /timed out/i,
];

const isTransient = (err) => {
  if (!err) return false;
  if (err.code && TRANSIENT_CODES.has(err.code)) return true;
  const msg = String(err.message || '');
  return TRANSIENT_PATTERNS.some((re) => re.test(msg));
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Run an async DB operation, retrying transient connection errors with
 * exponential backoff. Use for critical reads/writes that must survive a Neon
 * cold-start. Non-transient errors are rethrown immediately.
 *
 * @template T
 * @param {() => Promise<T>} op
 * @param {number} [retries=MAX_RETRIES]
 * @returns {Promise<T>}
 */
async function withRetry(op, retries = MAX_RETRIES) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await op();
    } catch (err) {
      lastErr = err;
      if (!isTransient(err) || attempt === retries) throw err;
      const delay = BASE_DELAY_MS * 2 ** attempt; // 400, 800, 1600, 3200ms
      if (process.env.NODE_ENV !== 'test') {
        console.warn(`[db] transient error (${err.code || 'conn'}), retry ${attempt + 1}/${retries} in ${delay}ms`);
      }
      await sleep(delay);
    }
  }
  throw lastErr;
}

const base = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

/**
 * Extend the client so every top-level query transparently retries transient
 * connection errors. Interactive transactions ($transaction with a callback)
 * are NOT auto-retried here (a mid-transaction reconnect would be unsafe) — wrap
 * those explicitly with `withRetry` at the call site if needed.
 */
const prisma = base.$extends({
  query: {
    async $allOperations({ operation, args, query }) {
      // Don't wrap interactive transactions (unsafe to replay mid-flight).
      if (operation === '$transaction') return query(args);
      return withRetry(() => query(args));
    },
  },
});

module.exports = { prisma, withRetry, isTransient };
