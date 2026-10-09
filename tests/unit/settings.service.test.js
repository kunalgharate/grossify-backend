jest.mock('../../src/shared/database', () => ({
  prisma: { setting: { findMany: jest.fn(), upsert: jest.fn() } },
}));

const { prisma } = require('../../src/shared/database');
const svc = require('../../src/modules/settings/settings.service');

describe('settings.service', () => {
  beforeEach(() => jest.clearAllMocks());

  it('getEffective returns DEFAULTS when nothing is stored', async () => {
    prisma.setting.findMany.mockResolvedValue([]);
    const s = await svc.getEffective(null);
    expect(s.gstScheme).toBe('REGULAR');
    expect(s.deliveryFeeBase).toBe(20);
    expect(s.offersEnabled).toBe(true);
  });

  it('STORE overrides PLATFORM overrides DEFAULTS', async () => {
    prisma.setting.findMany.mockResolvedValue([
      { scope: 'PLATFORM', storeId: null, key: 'deliveryFeeBase', value: 30 },
      { scope: 'STORE', storeId: 's1', key: 'deliveryFeeBase', value: 10 },
      { scope: 'PLATFORM', storeId: null, key: 'minOrderValue', value: 99 },
    ]);
    const s = await svc.getEffective('s1');
    expect(s.deliveryFeeBase).toBe(10); // store wins
    expect(s.minOrderValue).toBe(99); // platform (no store override)
    expect(s.gstScheme).toBe('REGULAR'); // default
  });

  it('set rejects an unknown key', async () => {
    await expect(svc.set('PLATFORM', null, 'bogusKey', 1)).rejects.toThrow(/Unknown setting key/);
  });

  it('set requires storeId for STORE scope', async () => {
    await expect(svc.set('STORE', null, 'minOrderValue', 50)).rejects.toThrow(/storeId required/);
  });

  it('update upserts each key and returns the count', async () => {
    prisma.setting.upsert.mockResolvedValue({});
    const n = await svc.update('PLATFORM', null, { deliveryFeeBase: 25, minOrderValue: 100 });
    expect(n).toBe(2);
    expect(prisma.setting.upsert).toHaveBeenCalledTimes(2);
  });
});
