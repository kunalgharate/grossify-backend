const { prisma } = require('../../shared/database');
const { BadRequestError, NotFoundError } = require('../../shared/errors');

/**
 * Stock ledger service (Phase B2).
 *
 * The append-only `InventoryTransaction` table is the source of truth for stock
 * movement; `Product.stockQuantity` is a **cached projection** kept in sync on
 * every post. All posts run inside a transaction and lock the product row with
 * `SELECT … FOR UPDATE` (same oversell-safe pattern as the original
 * inventory.service) so concurrent movements serialize correctly.
 *
 * Sign convention: PURCHASE_IN / RETURN_IN → +qty; SALE_OUT / WASTAGE /
 * RETURN_OUT → −qty; ADJUSTMENT → signed delta as given.
 */

const INBOUND = new Set(['PURCHASE_IN', 'RETURN_IN']);
const OUTBOUND = new Set(['SALE_OUT', 'WASTAGE', 'RETURN_OUT']);

/** Normalize a caller-supplied quantity + type into a signed delta. */
function signedDelta(type, qty) {
  const n = Math.abs(Number(qty));
  if (!Number.isFinite(n) || n <= 0) {
    if (type === 'ADJUSTMENT') return Number(qty); // adjustments may be signed / zero-ish
    throw new BadRequestError('Quantity must be a positive number');
  }
  if (INBOUND.has(type)) return n;
  if (OUTBOUND.has(type)) return -n;
  if (type === 'ADJUSTMENT' || type === 'TRANSFER') return Number(qty); // signed as given
  throw new BadRequestError(`Unknown inventory transaction type: ${type}`);
}

/**
 * Post a stock movement inside an existing transaction client `tx`.
 * Locks the product row, applies the delta, writes the ledger row, and (for
 * batch-tracked products) adjusts the batch's remaining qty.
 *
 * @returns {Promise<{balanceAfter:number, transactionId:string}>}
 */
async function postTxn(tx, {
  storeId, productId, type, quantity, unitCost = null,
  batchId = null, referenceType = null, referenceId = null, reason = null, createdBy = null,
}) {
  if (!storeId || !productId || !type) {
    throw new BadRequestError('storeId, productId and type are required');
  }
  const delta = signedDelta(type, quantity);

  // Lock the product row (oversell-safe under concurrency).
  const rows = await tx.$queryRaw`
    SELECT id, stock_quantity AS "stockQuantity", track_inventory AS "trackInventory"
    FROM products WHERE id = ${productId} FOR UPDATE
  `;
  const product = rows[0];
  if (!product) throw new NotFoundError(`Product not found: ${productId}`);

  const balanceAfter = product.stockQuantity + delta;
  if (balanceAfter < 0) {
    throw new BadRequestError(`INSUFFICIENT_STOCK: cannot move ${delta} (have ${product.stockQuantity})`);
  }

  await tx.product.update({
    where: { id: productId },
    data: { stockQuantity: balanceAfter },
  });

  if (batchId) {
    await tx.stockBatch.update({
      where: { id: batchId },
      data: { qtyRemaining: { increment: delta } },
    });
  }

  const txn = await tx.inventoryTransaction.create({
    data: {
      storeId, productId, batchId, type,
      qtyDelta: delta, balanceAfter,
      unitCost: unitCost != null ? unitCost : undefined,
      referenceType, referenceId, reason, createdBy,
    },
  });

  return { balanceAfter, transactionId: txn.id };
}

/** Convenience: post a movement in its own transaction (non-batched flows). */
async function post(input) {
  return prisma.$transaction((tx) => postTxn(tx, input));
}

/**
 * Deduct stock for a sale (used by POS/online). Batch-tracked products pick the
 * earliest-expiry batch first (FEFO). Returns the balance after.
 */
async function deductForSale(tx, { storeId, productId, quantity, referenceId, createdBy }) {
  const product = await tx.product.findUnique({
    where: { id: productId },
    select: { trackBatch: true },
  });
  if (product?.trackBatch) {
    let remaining = Number(quantity);
    const batches = await tx.stockBatch.findMany({
      where: { storeId, productId, qtyRemaining: { gt: 0 } },
      orderBy: [{ expiryDate: 'asc' }, { createdAt: 'asc' }], // FEFO
    });
    let lastBalance = null;
    for (const b of batches) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, b.qtyRemaining);
      const res = await postTxn(tx, {
        storeId, productId, type: 'SALE_OUT', quantity: take,
        batchId: b.id, referenceType: 'ORDER', referenceId, createdBy,
      });
      lastBalance = res.balanceAfter;
      remaining -= take;
    }
    if (remaining > 0) throw new BadRequestError('INSUFFICIENT_STOCK across batches');
    return lastBalance;
  }
  const res = await postTxn(tx, {
    storeId, productId, type: 'SALE_OUT', quantity,
    referenceType: 'ORDER', referenceId, createdBy,
  });
  return res.balanceAfter;
}

/** Product ledger history (paginated). */
async function history(storeId, productId, { page = 1, limit = 50 } = {}) {
  const pageNum = Number(page) || 1;
  const limitNum = Math.min(Number(limit) || 50, 200);
  const [transactions, total] = await Promise.all([
    prisma.inventoryTransaction.findMany({
      where: { storeId, productId },
      orderBy: { createdAt: 'desc' },
      skip: (pageNum - 1) * limitNum, take: limitNum,
    }),
    prisma.inventoryTransaction.count({ where: { storeId, productId } }),
  ]);
  return { transactions, pagination: { page: pageNum, limit: limitNum, total } };
}

/** Products at/below reorder level (low-stock alerts). */
async function lowStock(storeId) {
  const rows = await prisma.$queryRaw`
    SELECT id, name, stock_quantity AS "stockQuantity", reorder_level AS "reorderLevel"
    FROM products
    WHERE store_id = ${storeId} AND reorder_level IS NOT NULL
      AND stock_quantity <= reorder_level AND status = 'ACTIVE'
    ORDER BY stock_quantity ASC
  `;
  return rows;
}

module.exports = { postTxn, post, deductForSale, history, lowStock, signedDelta };
