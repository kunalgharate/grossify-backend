jest.mock('../../src/shared/database', () => ({
  prisma: { product: { findFirst: jest.fn() } },
}));

jest.mock('../../src/modules/vendor/staff.service', () => ({
  requireStoreRole: jest.fn(),
}));

const { prisma } = require('../../src/shared/database');
const staffService = require('../../src/modules/vendor/staff.service');
const barcode = require('../../src/modules/products/barcode.service');

describe('barcode scan authorization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    staffService.requireStoreRole.mockResolvedValue('CASHIER');
  });

  it('authorizes store staff before resolving a barcode', async () => {
    prisma.product.findFirst.mockResolvedValue({ id: 'product-1', barcode: '12345678' });

    await expect(barcode.resolveScan('cashier-1', 'store-1', '12345678'))
      .resolves.toMatchObject({ id: 'product-1' });
    expect(staffService.requireStoreRole).toHaveBeenCalledWith(
      'cashier-1',
      'store-1',
      ['OWNER', 'MANAGER', 'STAFF', 'CASHIER'],
    );
    expect(prisma.product.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { storeId: 'store-1', barcode: '12345678' },
    }));
  });

  it('does not query products when the caller lacks store access', async () => {
    staffService.requireStoreRole.mockRejectedValue(new Error('Forbidden'));

    await expect(barcode.resolveScan('customer-1', 'store-1', '12345678'))
      .rejects.toThrow('Forbidden');
    expect(prisma.product.findFirst).not.toHaveBeenCalled();
  });
});
