/**
 * Billing B0 backfill + GST rate master seed (idempotent, re-runnable).
 *
 * Seed data here is pure (0 orders/invoices/payments), so the only backfill
 * needed is on `stores`:
 *   - gstScheme: has GSTIN -> REGULAR, else UNREGISTERED
 *   - vendorType: derived from category slug
 *   - stateCode: derived from the `state` string via a GST state-code map
 * Plus the GstRate master (GST 2.0 active + GST 1.0 historical).
 *
 * Run: node prisma/backfill-billing-b0.js
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// GST numeric state codes (extend as needed).
const STATE_CODES = {
  'jammu and kashmir': 1, 'himachal pradesh': 2, 'punjab': 3, 'chandigarh': 4,
  'uttarakhand': 5, 'haryana': 6, 'delhi': 7, 'rajasthan': 8, 'uttar pradesh': 9,
  'bihar': 10, 'sikkim': 11, 'arunachal pradesh': 12, 'nagaland': 13, 'manipur': 14,
  'mizoram': 15, 'tripura': 16, 'meghalaya': 17, 'assam': 18, 'west bengal': 19,
  'jharkhand': 20, 'odisha': 21, 'chhattisgarh': 22, 'madhya pradesh': 23,
  'gujarat': 24, 'daman and diu': 25, 'dadra and nagar haveli': 26, 'maharashtra': 27,
  'karnataka': 29, 'goa': 30, 'lakshadweep': 31, 'kerala': 32, 'tamil nadu': 33,
  'puducherry': 34, 'andaman and nicobar islands': 35, 'telangana': 36,
  'andhra pradesh': 37, 'ladakh': 38,
};

// Category slug -> vendor type.
const RESTAURANT_SLUGS = new Set(['restaurants', 'restaurant', 'food', 'cloud-kitchen', 'cafe']);
const GROCERY_SLUGS = new Set([
  'grocery', 'groceries', 'kirana', 'supermarket', 'fruits-vegetables',
  'vegetables', 'fruits', 'dairy', 'pharmacy', 'bakery', 'meat', 'seafood',
]);

function vendorTypeFor(slug) {
  if (!slug) return 'GENERAL_RETAIL';
  if (RESTAURANT_SLUGS.has(slug)) return 'RESTAURANT';
  if (GROCERY_SLUGS.has(slug)) return 'GROCERY';
  return 'GENERAL_RETAIL';
}

async function backfillStores() {
  const stores = await prisma.store.findMany({
    select: { id: true, state: true, gstNumber: true, category: { select: { slug: true } } },
  });
  let updated = 0;
  for (const s of stores) {
    const gstScheme = s.gstNumber && s.gstNumber.trim() ? 'REGULAR' : 'UNREGISTERED';
    const vendorType = vendorTypeFor(s.category?.slug);
    const stateCode = s.state ? STATE_CODES[s.state.trim().toLowerCase()] ?? null : null;
    await prisma.store.update({
      where: { id: s.id },
      data: { gstScheme, vendorType, stateCode },
    });
    updated += 1;
  }
  return updated;
}

async function seedGstRates() {
  // effective-dated master; idempotent by (regime, rate, effectiveFrom).
  const rows = [
    // GST 2.0 — current (from 22-Sep-2025), no end date.
    { rate: 0, regime: 'gst_2.0', effectiveFrom: '2025-09-22', effectiveUntil: null, description: 'GST 2.0 nil-rated' },
    { rate: 5, regime: 'gst_2.0', effectiveFrom: '2025-09-22', effectiveUntil: null, description: 'GST 2.0 merit rate' },
    { rate: 18, regime: 'gst_2.0', effectiveFrom: '2025-09-22', effectiveUntil: null, description: 'GST 2.0 standard rate' },
    { rate: 40, regime: 'gst_2.0', effectiveFrom: '2025-09-22', effectiveUntil: null, description: 'GST 2.0 demerit / sin rate' },
    // GST 1.0 — historical (up to 21-Sep-2025) for reprints of old invoices.
    { rate: 0, regime: 'gst_1.0', effectiveFrom: '2017-07-01', effectiveUntil: '2025-09-21', description: 'GST 1.0 nil-rated' },
    { rate: 5, regime: 'gst_1.0', effectiveFrom: '2017-07-01', effectiveUntil: '2025-09-21', description: 'GST 1.0 5%' },
    { rate: 12, regime: 'gst_1.0', effectiveFrom: '2017-07-01', effectiveUntil: '2025-09-21', description: 'GST 1.0 12%' },
    { rate: 18, regime: 'gst_1.0', effectiveFrom: '2017-07-01', effectiveUntil: '2025-09-21', description: 'GST 1.0 18%' },
    { rate: 28, regime: 'gst_1.0', effectiveFrom: '2017-07-01', effectiveUntil: '2025-09-21', description: 'GST 1.0 28%' },
  ];
  let created = 0;
  for (const r of rows) {
    const exists = await prisma.gstRate.findFirst({
      where: { regime: r.regime, rate: r.rate, hsnCode: null, effectiveFrom: new Date(r.effectiveFrom) },
    });
    if (!exists) {
      await prisma.gstRate.create({
        data: {
          rate: r.rate,
          cessRate: 0,
          regime: r.regime,
          description: r.description,
          effectiveFrom: new Date(r.effectiveFrom),
          effectiveUntil: r.effectiveUntil ? new Date(r.effectiveUntil) : null,
          isActive: r.effectiveUntil === null,
        },
      });
      created += 1;
    }
  }
  return created;
}

(async () => {
  try {
    const stores = await backfillStores();
    const rates = await seedGstRates();
    console.log(`BACKFILL_OK stores_updated=${stores} gst_rates_created=${rates}`);
  } catch (e) {
    console.error('BACKFILL_ERROR:', e.message.split('\n')[0]);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
