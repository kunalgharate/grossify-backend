// Fully DB-free: stub the shared Prisma singleton so requiring the service
// never instantiates a real client. lockAndDeduct/restoreStock operate on the
// transaction client we pass in, which we fake below.
jest.mock('../../src/shared/database', () => ({ prisma: {} }));

const inventoryService = require('../../src/modules/products/inventory.service');

const PRODUCT_ID = '11111111-1111-1111-1111-111111111111';

/**
 * Fake Prisma transaction client. Prisma calls `tx.$queryRaw` as a tagged
 * template (tx.$queryRaw`SELECT …`), which JS invokes as a normal function
 * with (strings, ...values) — so a jest.fn returning our queued rows works.
 */
function makeTx(rows) {
  return {
    $queryRaw: jest.fn().mockResolvedValue(rows),
    product: { update: jest.fn().mockResolvedValue({}) },
  };
}

const product = (overrides = {}) => ({
  id: PRODUCT_ID,
  name: 'Test Product',
  stockQuantity: 10,
  isAvailable: true,
  status: 'ACTIVE',
  ...overrides,
});

describe('inventory.service', () => {
  describe('lockAndDeduct', () => {
    it('locks the row, deducts stock, and returns the remaining quantity', async () => {
      const tx = makeTx([product({ stockQuantity: 10 })]);

      const remaining = await inventoryService.lockAndDeduct(tx, PRODUCT_ID, 3);

      expect(remaining).toBe(7);
      expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
      expect(tx.product.update).toHaveBeenCalledWith({
        where: { id: PRODUCT_ID },
        data: { stockQuantity: { decrement: 3 } },
      });
    });

    it('allows deducting exactly the available stock (boundary)', async () => {
      const tx = makeTx([product({ stockQuantity: 5 })]);
      const remaining = await inventoryService.lockAndDeduct(tx, PRODUCT_ID, 5);
      expect(remaining).toBe(0);
      expect(tx.product.update).toHaveBeenCalled();
    });

    it('throws OUT_OF_STOCK and does NOT deduct when stock is insufficient', async () => {
      const tx = makeTx([product({ stockQuantity: 2 })]);
      await expect(inventoryService.lockAndDeduct(tx, PRODUCT_ID, 5)).rejects.toThrow(
        /ITEM_OUT_OF_STOCK/
      );
      expect(tx.product.update).not.toHaveBeenCalled();
    });

    it('throws UNAVAILABLE when the product is flagged unavailable', async () => {
      const tx = makeTx([product({ isAvailable: false })]);
      await expect(inventoryService.lockAndDeduct(tx, PRODUCT_ID, 1)).rejects.toThrow(
        /ITEM_UNAVAILABLE/
      );
      expect(tx.product.update).not.toHaveBeenCalled();
    });

    it('throws UNAVAILABLE when the product is not ACTIVE', async () => {
      const tx = makeTx([product({ status: 'INACTIVE' })]);
      await expect(inventoryService.lockAndDeduct(tx, PRODUCT_ID, 1)).rejects.toThrow(
        /ITEM_UNAVAILABLE/
      );
    });

    it('throws NotFound when the product row does not exist', async () => {
      const tx = makeTx([]);
      await expect(inventoryService.lockAndDeduct(tx, 'missing-id', 1)).rejects.toThrow(
        /Product not found/
      );
    });

    it('rejects non-integer or non-positive quantities before touching the DB', async () => {
      const tx = makeTx([product()]);
      await expect(inventoryService.lockAndDeduct(tx, PRODUCT_ID, 0)).rejects.toThrow(
        /positive integer/
      );
      await expect(inventoryService.lockAndDeduct(tx, PRODUCT_ID, 1.5)).rejects.toThrow(
        /positive integer/
      );
      await expect(inventoryService.lockAndDeduct(tx, PRODUCT_ID, -2)).rejects.toThrow(
        /positive integer/
      );
      expect(tx.$queryRaw).not.toHaveBeenCalled();
    });
  });

  describe('restoreStock', () => {
    it('increments the product stock by the given quantity', async () => {
      const tx = makeTx([]);
      await inventoryService.restoreStock(tx, PRODUCT_ID, 4);
      expect(tx.product.update).toHaveBeenCalledWith({
        where: { id: PRODUCT_ID },
        data: { stockQuantity: { increment: 4 } },
      });
    });
  });
});
