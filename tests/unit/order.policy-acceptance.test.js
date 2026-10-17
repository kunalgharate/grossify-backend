jest.mock('../../src/shared/database', () => ({
  prisma: {
    policyVersion: { findMany: jest.fn() },
    policyAcceptance: { findMany: jest.fn() },
    store: { findUnique: jest.fn() },
  },
}));

const { prisma } = require('../../src/shared/database');
const orderService = require('../../src/modules/orders/order.service');

const requiredOrder = {
  storeId: 'store-1',
  items: [{ productId: 'product-1', quantity: 1 }],
  addressId: 'address-1',
  paymentMethod: 'COD',
};
const currentPolicies = [
  { policyType: 'TOS', version: 'tos-2' },
  { policyType: 'PRIVACY', version: 'privacy-3' },
];

describe('order policy acceptance', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.policyVersion.findMany.mockResolvedValue(currentPolicies);
    prisma.policyAcceptance.findMany.mockResolvedValue([]);
  });

  it('rejects order creation without current Terms and Privacy acceptance', async () => {
    await expect(orderService.place('customer-1', requiredOrder)).rejects.toMatchObject({
      statusCode: 403,
      code: 'POLICY_ACCEPTANCE_REQUIRED',
    });

    expect(prisma.store.findUnique).not.toHaveBeenCalled();
  });

  it('rejects acceptance of an outdated policy version', async () => {
    prisma.policyAcceptance.findMany.mockResolvedValue([
      { policyType: 'TOS', version: 'tos-1' },
      { policyType: 'PRIVACY', version: 'privacy-3' },
    ]);

    await expect(orderService.place('customer-1', requiredOrder)).rejects.toMatchObject({
      statusCode: 403,
      code: 'POLICY_ACCEPTANCE_REQUIRED',
    });
    expect(prisma.store.findUnique).not.toHaveBeenCalled();
  });

  it('continues order validation after current versions have been accepted', async () => {
    prisma.policyAcceptance.findMany.mockResolvedValue(currentPolicies);
    prisma.store.findUnique.mockResolvedValue(null);

    await expect(orderService.place('customer-1', requiredOrder)).rejects.toThrow('Store not found');
    expect(prisma.store.findUnique).toHaveBeenCalledWith({ where: { id: 'store-1' } });
  });
});
