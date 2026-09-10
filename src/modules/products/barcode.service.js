const { prisma } = require('../../shared/database');
const { BadRequestError, NotFoundError, ForbiddenError } = require('../../shared/errors');

/**
 * Barcode service (Phase B2).
 *
 * Two vendor realities:
 *  - PACKAGED products already carry a manufacturer barcode (EAN/UPC printed on
 *    the pack) → we keep it as-is (`barcodeType = MANUFACTURER`).
 *  - LOOSE / unpackaged products (e.g. grains, sweets, a shop's own SKU) have no
 *    barcode → we GENERATE a unique internal one and (optionally) print a label
 *    (`barcodeType = GENERATED`).
 *
 * A scan then resolves a code to a product for EITHER billing (POS/scan-to-bill)
 * OR purchasing (GRN/scan-to-purchase), so staff can handle thousands of SKUs
 * across many vendors quickly.
 *
 * Generated codes are EAN-13: a 2-digit internal prefix (20 — reserved for
 * in-store use), 10 payload digits, and a mod-10 check digit.
 */

const INTERNAL_PREFIX = '20'; // GS1 "restricted distribution / in-store" range

/** EAN-13 mod-10 check digit for a 12-digit string. */
function ean13CheckDigit(twelve) {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const d = twelve.charCodeAt(i) - 48;
    sum += i % 2 === 0 ? d : d * 3;
  }
  return String((10 - (sum % 10)) % 10);
}

/** Build a candidate EAN-13 from a numeric payload. */
function buildEan13(payloadDigits) {
  const twelve = (INTERNAL_PREFIX + payloadDigits).padEnd(12, '0').slice(0, 12);
  return twelve + ean13CheckDigit(twelve);
}

async function requireOwnProduct(userId, productId) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { store: { select: { ownerId: true, id: true } } },
  });
  if (!product) throw new NotFoundError('Product not found');
  if (product.store.ownerId !== userId) throw new ForbiddenError('Not your product');
  return product;
}

/**
 * Ensure a product has a barcode. If it already has one, return it unchanged.
 * Otherwise generate a unique EAN-13 (GENERATED) and persist it.
 *
 * @returns {Promise<{barcode:string, barcodeType:string, generated:boolean}>}
 */
async function ensureBarcode(userId, productId) {
  const product = await requireOwnProduct(userId, productId);

  if (product.barcode && product.barcode.trim()) {
    return {
      barcode: product.barcode,
      barcodeType: product.barcodeType || 'MANUFACTURER',
      generated: false,
    };
  }

  // Generate a unique code (retry on the rare collision).
  let code;
  for (let attempt = 0; attempt < 5; attempt++) {
    const payload = Date.now().toString().slice(-8) + Math.floor(Math.random() * 100).toString().padStart(2, '0');
    code = buildEan13(payload);
    const clash = await prisma.product.findFirst({ where: { barcode: code }, select: { id: true } });
    if (!clash) break;
    code = null;
  }
  if (!code) throw new BadRequestError('Could not generate a unique barcode, retry');

  await prisma.product.update({
    where: { id: productId },
    data: { barcode: code, barcodeType: 'GENERATED' },
  });
  return { barcode: code, barcodeType: 'GENERATED', generated: true };
}

/**
 * Mark an externally-scanned manufacturer barcode onto a product (packaged
 * goods). Rejects a code already used by another product in the store.
 */
async function assignManufacturerBarcode(userId, productId, barcode) {
  if (!barcode || !barcode.trim()) throw new BadRequestError('barcode is required');
  const product = await requireOwnProduct(userId, productId);
  const clash = await prisma.product.findFirst({
    where: { storeId: product.store.id, barcode, NOT: { id: productId } },
    select: { id: true },
  });
  if (clash) throw new BadRequestError('Barcode already assigned to another product');
  await prisma.product.update({
    where: { id: productId },
    data: { barcode: barcode.trim(), barcodeType: 'MANUFACTURER' },
  });
  return { barcode: barcode.trim(), barcodeType: 'MANUFACTURER' };
}

/**
 * Resolve a scanned barcode to a product within a store. Used by BOTH
 * scan-to-bill (POS) and scan-to-purchase (GRN). Returns a lightweight product
 * shape ready to drop into a bill line or a receipt line.
 */
async function resolveScan(storeId, barcode) {
  if (!storeId || !barcode) throw new BadRequestError('storeId and barcode are required');
  const product = await prisma.product.findFirst({
    where: { storeId, barcode: barcode.trim() },
    select: {
      id: true, name: true, sellingPrice: true, mrp: true, costPrice: true,
      hsn: true, taxRate: true, unit: true, stockQuantity: true, barcode: true,
      barcodeType: true, trackBatch: true,
    },
  });
  if (!product) throw new NotFoundError(`No product for barcode ${barcode}`);
  return product;
}

module.exports = {
  ensureBarcode,
  assignManufacturerBarcode,
  resolveScan,
  buildEan13,
  ean13CheckDigit,
};
