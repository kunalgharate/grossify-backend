// DB-free unit tests for product.service.getByStoreAndSlug (the new SEO-friendly
// slug lookup). Prisma is mocked so these run without Postgres.

jest.mock('../../src/shared/database', () => ({
  prisma: {
    store: { findUnique: jest.fn() },
    product: { findFirst: jest.fn() },
  },
}));

const { prisma } = require('../../src/shared/database');
const productService = require('../../src/modules/products/product.service');

describe('product.service.getByStoreAndSlug', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resolves the store by slug then the product by slug within it', async () => {
    prisma.store.findUnique.mockResolvedValue({ id: 'store-1' });
    prisma.product.findFirst.mockResolvedValue({
      id: 'prod-1',
      slug: 'white-bread-400g',
      name: 'White Bread (400g)',
      store: { id: 'store-1', name: 'Oven Fresh Bakery', slug: 'oven-fresh-bakery' },
    });

    const product = await productService.getByStoreAndSlug('oven-fresh-bakery', 'white-bread-400g');

    expect(product.name).toBe('White Bread (400g)');
    expect(prisma.store.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { slug: 'oven-fresh-bakery' } }),
    );
    expect(prisma.product.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ storeId: 'store-1', slug: 'white-bread-400g' }),
      }),
    );
  });

  it('throws NotFound when the store slug does not exist', async () => {
    prisma.store.findUnique.mockResolvedValue(null);
    await expect(
      productService.getByStoreAndSlug('nope', 'white-bread-400g'),
    ).rejects.toThrow(/not found/i);
    expect(prisma.product.findFirst).not.toHaveBeenCalled();
  });

  it('throws NotFound when the product slug does not exist in the store', async () => {
    prisma.store.findUnique.mockResolvedValue({ id: 'store-1' });
    prisma.product.findFirst.mockResolvedValue(null);
    await expect(
      productService.getByStoreAndSlug('oven-fresh-bakery', 'ghost'),
    ).rejects.toThrow(/not found/i);
  });
});
