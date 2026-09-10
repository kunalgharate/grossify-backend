const { prisma } = require('../../shared/database');
const { BadRequestError, NotFoundError } = require('../../shared/errors');

/**
 * Inventory service — stock management with overselling prevention.
 *
 * The authoritative deduction path is `lockAndDeduct`, which MUST run inside a
 * `prisma.$transaction` interactive transaction. It uses PostgreSQL row-level
 * locking (`SELECT ... FOR UPDATE`) so two concurrent orders for the same
 * product serialize on the row: the second transaction blocks until the first
 * commits, then re-reads the (now decremented) stock. This makes overselling
 * impossible under concurrency (PRD §7.4).
 */

/**
 * Read current product stock (non-locking). Use for fast pre-checks / UI only —
 * never rely on this for the final deduction decision (it is not race-safe).
 */
const checkStock = async (productId) => {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, name: true, stockQuantity: true, isAvailable: true, status: true },
  });
  if (!product) throw new NotFoundError(`Product not found: ${productId}`);
  return {
    productId: product.id,
    available: product.status === 'ACTIVE' && product.isAvailable && product.stockQuantity > 0,
    quantity: product.stockQuantity,
  };
};

/**
 * Atomically lock a product row, verify sufficient stock, and deduct it.
 * MUST be called inside a prisma.$transaction (pass the transaction client `tx`).
 *
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 * @param {string} productId
 * @param {number} quantity
 * @returns {Promise<number>} remaining stock after deduction
 * @throws {NotFoundError} product does not exist
 * @throws {BadRequestError} product unavailable or insufficient stock
 */
const lockAndDeduct = async (tx, productId, quantity) => {
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new BadRequestError('Quantity must be a positive integer');
  }

  // Row-level lock: held until the surrounding transaction commits/rolls back.
  const rows = await tx.$queryRaw`
    SELECT id,
           name,
           stock_quantity AS "stockQuantity",
           is_available   AS "isAvailable",
           status
    FROM products
    WHERE id = ${productId}
    FOR UPDATE
  `;

  const product = rows[0];
  if (!product) throw new NotFoundError(`Product not found: ${productId}`);
  if (product.status !== 'ACTIVE' || !product.isAvailable) {
    throw new BadRequestError(`ITEM_UNAVAILABLE: ${product.name}`);
  }
  if (product.stockQuantity < quantity) {
    throw new BadRequestError(
      `ITEM_OUT_OF_STOCK: ${product.name} (only ${product.stockQuantity} left)`
    );
  }

  await tx.product.update({
    where: { id: productId },
    data: { stockQuantity: { decrement: quantity } },
  });

  return product.stockQuantity - quantity;
};

/**
 * Restore stock when an order is cancelled/refunded. Increment is atomic on its
 * own, so no explicit lock is needed. Call inside the cancellation transaction.
 *
 * @param {import('@prisma/client').Prisma.TransactionClient} tx
 * @param {string} productId
 * @param {number} quantity
 */
const restoreStock = async (tx, productId, quantity) => {
  await tx.product.update({
    where: { id: productId },
    data: { stockQuantity: { increment: quantity } },
  });
};

module.exports = { checkStock, lockAndDeduct, restoreStock };
