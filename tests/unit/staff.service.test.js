jest.mock('../../src/shared/database', () => ({
  prisma: {
    store: { findMany: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn() },
    storeStaff: { findMany: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(), upsert: jest.fn(), updateMany: jest.fn() },
    user: { findUnique: jest.fn(), create: jest.fn() },
  },
}));

const { prisma } = require('../../src/shared/database');
const staff = require('../../src/modules/vendor/staff.service');

describe('staff.service', () => {
  beforeEach(() => jest.clearAllMocks());

  it('accessibleStoreIds unions owned + active memberships (deduped)', async () => {
    prisma.store.findMany.mockResolvedValue([{ id: 's1' }]);
    prisma.storeStaff.findMany.mockResolvedValue([{ storeId: 's1' }, { storeId: 's2' }]);
    const ids = await staff.accessibleStoreIds('u1');
    expect(ids.sort()).toEqual(['s1', 's2']);
  });

  it('roleOnStore returns OWNER for the owner', async () => {
    prisma.store.findUnique.mockResolvedValue({ ownerId: 'u1' });
    expect(await staff.roleOnStore('u1', 's1')).toBe('OWNER');
  });

  it('roleOnStore returns the active member role for staff', async () => {
    prisma.store.findUnique.mockResolvedValue({ ownerId: 'other' });
    prisma.storeStaff.findUnique.mockResolvedValue({ role: 'CASHIER', status: 'ACTIVE' });
    expect(await staff.roleOnStore('u1', 's1')).toBe('CASHIER');
  });

  it('roleOnStore returns null for a removed member', async () => {
    prisma.store.findUnique.mockResolvedValue({ ownerId: 'other' });
    prisma.storeStaff.findUnique.mockResolvedValue({ role: 'STAFF', status: 'REMOVED' });
    expect(await staff.roleOnStore('u1', 's1')).toBeNull();
  });

  it('invite forbids a non-manager', async () => {
    prisma.store.findUnique.mockResolvedValue({ ownerId: 'other' });
    prisma.storeStaff.findUnique.mockResolvedValue(null); // no role
    await expect(staff.invite('u1', 's1', { phone: '+911', role: 'STAFF' })).rejects.toThrow(/owner or a manager/);
  });

  it('invite creates the user and upserts an ACTIVE membership', async () => {
    prisma.store.findUnique.mockResolvedValue({ ownerId: 'u1' }); // caller is owner
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({ id: 'new', phone: '+912' });
    prisma.storeStaff.upsert.mockResolvedValue({ id: 'm1', role: 'CASHIER' });
    const m = await staff.invite('u1', 's1', { phone: '+912', role: 'CASHIER' });
    expect(m.role).toBe('CASHIER');
    expect(prisma.storeStaff.upsert).toHaveBeenCalled();
  });

  it('invite rejects assigning OWNER', async () => {
    prisma.store.findUnique.mockResolvedValue({ ownerId: 'u1' });
    await expect(staff.invite('u1', 's1', { phone: '+913', role: 'OWNER' })).rejects.toThrow(/Cannot assign OWNER/);
  });

  it('remove refuses to remove the owner', async () => {
    prisma.store.findUnique
      .mockResolvedValueOnce({ ownerId: 'u1' }) // requireManage check
      .mockResolvedValueOnce({ ownerId: 'u1' }); // owner guard
    await expect(staff.remove('u1', 's1', 'u1')).rejects.toThrow(/Cannot remove the store owner/);
  });
});
