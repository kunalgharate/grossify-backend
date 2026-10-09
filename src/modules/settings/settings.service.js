const { prisma } = require('../../shared/database');
const { BadRequestError } = require('../../shared/errors');

/**
 * Platform + per-store configuration (key-value, JSON values). A STORE setting
 * overrides the PLATFORM default of the same key; unset keys fall back to the
 * hard-coded DEFAULTS below so the app always has a value.
 *
 * Known keys (extensible):
 *   gstScheme            'REGULAR' | 'COMPOSITION' | 'UNREGISTERED'
 *   deliveryFeeBase      number (₹)
 *   deliveryFeePerKm     number (₹)
 *   minOrderValue        number (₹)
 *   freeDeliveryAbove    number (₹) | null
 *   offersEnabled        boolean
 *   maxDiscountPercent   number
 */

const DEFAULTS = {
  gstScheme: 'REGULAR',
  deliveryFeeBase: 20,
  deliveryFeePerKm: 5,
  minOrderValue: 0,
  freeDeliveryAbove: null,
  offersEnabled: true,
  maxDiscountPercent: 50,
};

const ALLOWED_KEYS = Object.keys(DEFAULTS);

function assertKey(key) {
  if (!ALLOWED_KEYS.includes(key)) throw new BadRequestError(`Unknown setting key: ${key}`);
}

/** Effective settings for a store: DEFAULTS <- PLATFORM <- STORE. */
async function getEffective(storeId = null) {
  const rows = await prisma.setting.findMany({
    where: { OR: [{ scope: 'PLATFORM' }, ...(storeId ? [{ scope: 'STORE', storeId }] : [])] },
  });
  const platform = {};
  const store = {};
  for (const r of rows) {
    if (r.scope === 'PLATFORM') platform[r.key] = r.value;
    else if (r.scope === 'STORE' && r.storeId === storeId) store[r.key] = r.value;
  }
  return { ...DEFAULTS, ...platform, ...store };
}

/** Raw settings for a scope (admin/vendor editing view). */
async function list(scope, storeId = null) {
  const rows = await prisma.setting.findMany({ where: { scope, ...(scope === 'STORE' ? { storeId } : {}) } });
  const out = { ...(scope === 'PLATFORM' ? DEFAULTS : {}) };
  for (const r of rows) out[r.key] = r.value;
  return out;
}

/** Upsert one setting (validated key). */
async function set(scope, storeId, key, value) {
  if (!['PLATFORM', 'STORE'].includes(scope)) throw new BadRequestError('Invalid scope');
  if (scope === 'STORE' && !storeId) throw new BadRequestError('storeId required for STORE scope');
  assertKey(key);
  return prisma.setting.upsert({
    where: { scope_storeId_key: { scope, storeId: storeId || null, key } },
    create: { scope, storeId: storeId || null, key, value },
    update: { value },
  });
}

/** Bulk update from a { key: value } object. */
async function update(scope, storeId, patch) {
  const entries = Object.entries(patch || {});
  const results = [];
  for (const [key, value] of entries) {
    results.push(await set(scope, storeId, key, value));
  }
  return results.length;
}

module.exports = { DEFAULTS, ALLOWED_KEYS, getEffective, list, set, update };
