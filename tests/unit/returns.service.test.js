jest.mock('../../src/shared/database', () => ({
  prisma: {
    order: { findUnique: jest.fn() },
    returnRequest: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() },
  },
}));
const { prisma } = require('../../src/shared/database');
const returns = require('../../src/modules/returns/returns.service');

const USER = 'u1';
const deliveredOrder = (overrides = {}) => ({
  id: 'o1',
  customerId: USER,
  status: 'DELIVERED',
  deliveredAt: new Date(),
  updatedAt: new Date(),
  items: [
    { id: 'oi1', productId: 'p1', product: { returnable: true, returnWindowDays: 7 } },
    { id: 'oi2', productId: 'p2', product: { returnable: false, returnWindowDays: 0 } },
  ],
  ...overrides,
});

describe('returns.service', () => {
  beforeEach(() => jest.clearAllMocks());

  it('eligibility: returnable+in-window is eligible; non-returnable is not', async () => {
    prisma.order.findUnique.mockResolvedValue(deliveredOrder());
    const res = await returns.eligibility(USER, 'o1');
    expect(res.items.find((i) => i.orderItemId === 'oi1').eligible).toBe(true);
    expect(res.items.find((i) => i.orderItemId === 'oi2').eligible).toBe(false);
  });

  it('create: a DEFECTIVE claim bypasses the window even for non-returnable items', async () => {
    prisma.order.findUnique.mockResolvedValue(deliveredOrder());
    prisma.returnRequest.create.mockResolvedValue({ id: 'r1', items: [] });
    const res = await returns.create(USER, {
      orderId: 'o1',
      outcome: 'RETURN',
      reason: 'DEFECTIVE',
      items: [{ orderItemId: 'oi2', quantity: 1 }],
    });
    expect(res.returnRequest.id).toBe('r1');
    expect(prisma.returnRequest.create).toHaveBeenCalled();
  });

  it('create: a non-defect reason on an out-of-window item is rejected', async () => {
    prisma.order.findUnique.mockResolvedValue(
      deliveredOrder({ deliveredAt: new Date(Date.now() - 30 * 86400000) }),
    );
    await expect(
      returns.create(USER, {
        orderId: 'o1',
        outcome: 'RETURN',
        reason: 'CHANGED_MIND',
        items: [{ orderItemId: 'oi1', quantity: 1 }],
      }),
    ).rejects.toThrow(/return window/i);
  });

  it('create: rejects returns on non-delivered orders', async () => {
    prisma.order.findUnique.mockResolvedValue(deliveredOrder({ status: 'PLACED' }));
    await expect(
      returns.create(USER, { orderId: 'o1', outcome: 'RETURN', reason: 'DEFECTIVE', items: [{ orderItemId: 'oi1' }] }),
    ).rejects.toThrow(/delivered/i);
  });

  it('qc PASS on a RETURN moves to REFUNDED; on REPLACE moves to REPLACED', async () => {
    const base = { id: 'r1', status: 'PICKED_UP', order: { store: { ownerId: USER } } };
    prisma.returnRequest.findUnique.mockResolvedValue({ ...base, outcome: 'RETURN' });
    prisma.returnRequest.update.mockImplementation(({ data }) => Promise.resolve({ id: 'r1', ...data }));
    const refunded = await returns.qc(USER, 'r1', true);
    expect(refunded.status).toBe('REFUNDED');

    prisma.returnRequest.findUnique.mockResolvedValue({ ...base, outcome: 'REPLACE' });
    const replaced = await returns.qc(USER, 'r1', true);
    expect(replaced.status).toBe('REPLACED');
  });

  it('qc FAIL moves to REJECTED', async () => {
    prisma.returnRequest.findUnique.mockResolvedValue({
      id: 'r1', status: 'PICKED_UP', outcome: 'RETURN', order: { store: { ownerId: USER } },
    });
    prisma.returnRequest.update.mockImplementation(({ data }) => Promise.resolve({ id: 'r1', ...data }));
    const res = await returns.qc(USER, 'r1', false, 'item used');
    expect(res.status).toBe('REJECTED');
    expect(res.qcResult).toBe('FAIL');
  });

  it('listForVendor scopes to the vendor-owned store', async () => {
    prisma.returnRequest.findMany.mockResolvedValue([{ id: 'r1', items: [] }]);
    await returns.listForVendor(USER);
    const arg = prisma.returnRequest.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({ order: { store: { ownerId: USER } } });
  });
});
