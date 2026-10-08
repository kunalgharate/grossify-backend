jest.mock('../../src/shared/database', () => ({
  prisma: {
    category: { findUnique: jest.fn() },
    store: { findMany: jest.fn() },
    product: { findMany: jest.fn(), count: jest.fn() },
  },
}));

// Control the meilisearch config flag per-test.
jest.mock('../../src/shared/config', () => ({
  meilisearch: { host: 'http://localhost:7700', apiKey: undefined },
}));

const { prisma } = require('../../src/shared/database');
const config = require('../../src/shared/config');
const searchService = require('../../src/modules/search/search.service');

describe('search.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    config.meilisearch.apiKey = undefined; // default: Meili disabled
    prisma.store.findMany.mockResolvedValue([{ id: 's1', name: 'Bakery' }]);
    prisma.product.findMany.mockResolvedValue([{ id: 'p1', name: 'Bread' }]);
    prisma.product.count.mockResolvedValue(1);
    prisma.category.findUnique.mockResolvedValue(null);
  });

  it('meiliEnabled reflects the api key config', () => {
    config.meilisearch.apiKey = undefined;
    expect(searchService.meiliEnabled()).toBe(false);
    config.meilisearch.apiKey = 'key';
    expect(searchService.meiliEnabled()).toBe(true);
  });

  it('search falls back to Postgres when Meili is disabled', async () => {
    const res = await searchService.search({ q: 'bread', page: 1, limit: 20 });
    expect(res.results.stores).toHaveLength(1);
    expect(res.results.products).toHaveLength(1);
    expect(res.pagination.total).toBe(1);
    expect(prisma.product.findMany).toHaveBeenCalled();
  });

  it('resolveCategoryId maps a slug to an id', async () => {
    prisma.category.findUnique.mockResolvedValue({ id: 'c1' });
    expect(await searchService.resolveCategoryId('bakery')).toBe('c1');
    expect(await searchService.resolveCategoryId(null)).toBeNull();
  });

  it('postgresSearch applies the category filter when resolvable', async () => {
    prisma.category.findUnique.mockResolvedValue({ id: 'c1' });
    await searchService.postgresSearch({ q: 'bread', category: 'bakery' });
    const productArgs = prisma.product.findMany.mock.calls[0][0];
    expect(productArgs.where.categoryId).toBe('c1');
  });
});
