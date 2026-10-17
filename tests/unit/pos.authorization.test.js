jest.mock('../../src/shared/database', () => ({
  prisma: {
    store: { findUnique: jest.fn() },
    order: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    invoice: { findUnique: jest.fn() },
  },
}));

jest.mock('../../src/modules/vendor/staff.service', () => ({
  requireStoreRole: jest.fn(),
}));

const { prisma } = require('../../src/shared/database');
const staffService = require('../../src/modules/vendor/staff.service');
const pos = require('../../src/modules/pos/pos.service');

describe('POS store authorization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.store.findUnique.mockResolvedValue({
      id: 'store-1',
      ownerId: 'owner-1',
      vendorType: 'RESTAURANT',
      stateCode: 27,
    });
    staffService.requireStoreRole.mockResolvedValue('CASHIER');
  });

  it('checks cashier store access before returning an idempotent result', async () => {
    const existingOrder = { id: 'order-1', storeId: 'store-1', localUuid: 'bill-1' };
    prisma.order.findUnique.mockResolvedValue(existingOrder);
    prisma.invoice.findUnique.mockResolvedValue({ invoiceNumber: 'INV-1' });

    const result = await pos.syncBill('cashier-1', {
      storeId: 'store-1',
      localUuid: 'bill-1',
      items: [{ productId: 'product-1', quantity: 1, unitPrice: 100 }],
    });

    expect(staffService.requireStoreRole).toHaveBeenCalledWith(
      'cashier-1',
      'store-1',
      ['OWNER', 'MANAGER', 'CASHIER'],
    );
    expect(result).toMatchObject({ order: existingOrder, alreadyExisted: true });
  });

  it('does not disclose an idempotent bill owned by another store', async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: 'order-2',
      storeId: 'store-2',
      localUuid: 'bill-from-another-store',
    });

    await expect(pos.syncBill('cashier-1', {
      storeId: 'store-1',
      localUuid: 'bill-from-another-store',
      items: [{ productId: 'product-1', quantity: 1, unitPrice: 100 }],
    })).rejects.toThrow(/another store/);
    expect(prisma.invoice.findUnique).not.toHaveBeenCalled();
  });

  it('allows cashiers to read their store bills with a separate read permission', async () => {
    prisma.order.findMany.mockResolvedValue([]);
    prisma.order.count.mockResolvedValue(0);

    const result = await pos.listBills('cashier-1', { storeId: 'store-1' });

    expect(staffService.requireStoreRole).toHaveBeenCalledWith(
      'cashier-1',
      'store-1',
      ['OWNER', 'MANAGER', 'STAFF', 'CASHIER'],
    );
    expect(result.pagination.total).toBe(0);
  });
});
