/**
 * Segment-aware store discovery: radius (nearby) is B2C-only; B2B browse is
 * unbounded (no radius) and B2B-only. DB-free — prisma is mocked to capture the
 * where-clauses the service builds.
 */
const mockFindMany = jest.fn();
const mockCount = jest.fn();
const mockCategoryFind = jest.fn();

jest.mock('../../src/shared/database', () => ({
  prisma: {
    store: { findMany: (...a) => mockFindMany(...a), count: (...a) => mockCount(...a) },
    category: { findUnique: (...a) => mockCategoryFind(...a) },
  },
}));

const storeService = require('../../src/modules/stores/store.service');

beforeEach(() => {
  mockFindMany.mockReset();
  mockCount.mockReset();
  mockCategoryFind.mockReset();
  mockFindMany.mockResolvedValue([]);
  mockCount.mockResolvedValue(0);
});

describe('findNearby (radius discovery)', () => {
  test('restricts to ACTIVE B2C stores (B2B hidden from radius results)', async () => {
    await storeService.findNearby({ lat: 19.99, lng: 73.78, radius: 3000 });
    const arg = mockFindMany.mock.calls[0][0];
    expect(arg.where.status).toBe('ACTIVE');
    expect(arg.where.storeType).toBe('B2C');
    // radius → bounding-box lat/lng constraints present
    expect(arg.where.latitude).toBeDefined();
    expect(arg.where.longitude).toBeDefined();
  });

  test('throws when lat/lng missing', async () => {
    await expect(storeService.findNearby({})).rejects.toThrow();
  });
});

describe('listB2B (unbounded B2B browse)', () => {
  test('restricts to ACTIVE B2B stores with NO radius/geo constraints', async () => {
    await storeService.listB2B({});
    const arg = mockFindMany.mock.calls[0][0];
    expect(arg.where.status).toBe('ACTIVE');
    expect(arg.where.storeType).toBe('B2B');
    expect(arg.where.latitude).toBeUndefined();
    expect(arg.where.longitude).toBeUndefined();
  });

  test('applies optional city + search filters', async () => {
    await storeService.listB2B({ city: 'Nashik', search: 'farm' });
    const arg = mockFindMany.mock.calls[0][0];
    expect(arg.where.city).toEqual({ equals: 'Nashik', mode: 'insensitive' });
    expect(arg.where.name).toEqual({ contains: 'farm', mode: 'insensitive' });
  });

  test('paginates with hasNext', async () => {
    mockFindMany.mockResolvedValue(new Array(20).fill({ id: 'x' }));
    mockCount.mockResolvedValue(45);
    const res = await storeService.listB2B({ page: 1, limit: 20 });
    expect(res.pagination.total).toBe(45);
    expect(res.pagination.hasNext).toBe(true);
    expect(res.meta.segment).toBe('B2B');
  });
});
