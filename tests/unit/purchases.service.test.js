jest.mock('../../src/shared/database', () => ({ prisma: {} }));
jest.mock('../../src/modules/inventory/inventory.service', () => ({
  postTxn: jest.fn(),
}));

const { prisma } = require('../../src/shared/database');
const purchasesService = require('../../src/modules/purchases/purchases.service');

const STORE_ID = 'store-1';
const USER_ID = 'owner-1';
const SUPPLIER_ID = 'supplier-1';
const PRODUCT_ID = 'product-1';
const PURCHASE_ORDER_ID = 'po-1';

function makeTransaction(overrides = {}) {
  return {
    supplier: { findFirst: jest.fn().mockResolvedValue({ id: SUPPLIER_ID }), update: jest.fn() },
    product: { findMany: jest.fn().mockResolvedValue([{ id: PRODUCT_ID }]) },
    purchaseOrder: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    pOItem: { update: jest.fn(), findMany: jest.fn() },
    goodsReceipt: { create: jest.fn() },
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  prisma.store = { findUnique: jest.fn().mockResolvedValue({ id: STORE_ID, ownerId: USER_ID }) };
});

describe('purchases.service', () => {
  describe('createPurchaseOrder', () => {
    it('rejects products that do not belong to the seller store', async () => {
      prisma.supplier = { findFirst: jest.fn().mockResolvedValue({ id: SUPPLIER_ID }) };
      prisma.product = { findMany: jest.fn().mockResolvedValue([]) };
      prisma.purchaseOrder = { create: jest.fn() };

      await expect(purchasesService.createPurchaseOrder(USER_ID, STORE_ID, {
        supplierId: SUPPLIER_ID,
        items: [{ productId: PRODUCT_ID, quantity: 2, costPrice: 10 }],
      })).rejects.toThrow('Product not found');

      expect(prisma.purchaseOrder.create).not.toHaveBeenCalled();
    });

    it('rejects non-integer order quantities before creating a PO', async () => {
      prisma.supplier = { findFirst: jest.fn().mockResolvedValue({ id: SUPPLIER_ID }) };
      prisma.product = { findMany: jest.fn().mockResolvedValue([{ id: PRODUCT_ID }]) };
      prisma.purchaseOrder = { create: jest.fn() };

      await expect(purchasesService.createPurchaseOrder(USER_ID, STORE_ID, {
        supplierId: SUPPLIER_ID,
        items: [{ productId: PRODUCT_ID, quantity: 1.5, costPrice: 10 }],
      })).rejects.toThrow('quantity must be a positive integer');

      expect(prisma.purchaseOrder.create).not.toHaveBeenCalled();
    });

    it('creates a PO with server-calculated subtotal, tax, and total', async () => {
      prisma.supplier = { findFirst: jest.fn().mockResolvedValue({ id: SUPPLIER_ID }) };
      prisma.product = { findMany: jest.fn().mockResolvedValue([{ id: PRODUCT_ID }]) };
      prisma.purchaseOrder = {
        create: jest.fn().mockResolvedValue({ id: PURCHASE_ORDER_ID }),
      };

      await purchasesService.createPurchaseOrder(USER_ID, STORE_ID, {
        supplierId: SUPPLIER_ID,
        items: [{ productId: PRODUCT_ID, quantity: 2, costPrice: 12.5, taxRate: 5 }],
      });

      expect(prisma.purchaseOrder.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          storeId: STORE_ID,
          supplierId: SUPPLIER_ID,
          status: 'draft',
          subtotal: 25,
          taxAmount: 1.25,
          total: 26.25,
          items: {
            create: [{
              productId: PRODUCT_ID,
              quantity: 2,
              costPrice: 12.5,
              taxRate: 5,
            }],
          },
        }),
      }));
    });
  });

  describe('receiveGoods', () => {
    it('rejects products that do not belong to the seller store before creating a GRN', async () => {
      const tx = makeTransaction({
        product: { findMany: jest.fn().mockResolvedValue([]) },
      });
      prisma.$transaction = jest.fn((callback) => callback(tx));

      await expect(purchasesService.receiveGoods(USER_ID, STORE_ID, {
        supplierId: SUPPLIER_ID,
        items: [{ productId: PRODUCT_ID, qtyReceived: 2, costPrice: 10 }],
      })).rejects.toThrow('Product not found');

      expect(tx.goodsReceipt.create).not.toHaveBeenCalled();
    });

    it('rejects receiving more than the remaining PO quantity', async () => {
      const tx = makeTransaction();
      tx.purchaseOrder.findUnique.mockResolvedValue({
        id: PURCHASE_ORDER_ID,
        storeId: STORE_ID,
        supplierId: SUPPLIER_ID,
        status: 'sent',
        items: [{ id: 'po-item-1', productId: PRODUCT_ID, quantity: 4, qtyReceived: 3 }],
      });
      prisma.$transaction = jest.fn((callback) => callback(tx));

      await expect(purchasesService.receiveGoods(USER_ID, STORE_ID, {
        supplierId: SUPPLIER_ID,
        purchaseOrderId: PURCHASE_ORDER_ID,
        items: [{ productId: PRODUCT_ID, qtyReceived: 2, costPrice: 10 }],
      })).rejects.toThrow('Received quantity exceeds the purchase order balance');

      expect(tx.goodsReceipt.create).not.toHaveBeenCalled();
    });

    it('rejects purchase orders belonging to another store', async () => {
      const tx = makeTransaction();
      tx.purchaseOrder.findUnique.mockResolvedValue({
        id: PURCHASE_ORDER_ID,
        storeId: 'another-store',
        supplierId: SUPPLIER_ID,
        status: 'sent',
        items: [{ id: 'po-item-1', productId: PRODUCT_ID, quantity: 4, qtyReceived: 0 }],
      });
      prisma.$transaction = jest.fn((callback) => callback(tx));

      await expect(purchasesService.receiveGoods(USER_ID, STORE_ID, {
        supplierId: SUPPLIER_ID,
        purchaseOrderId: PURCHASE_ORDER_ID,
        items: [{ productId: PRODUCT_ID, qtyReceived: 1, costPrice: 10 }],
      })).rejects.toThrow('Purchase order not found');

      expect(tx.goodsReceipt.create).not.toHaveBeenCalled();
    });
  });
});
