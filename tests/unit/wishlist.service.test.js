jest.mock('../../src/shared/database', () => ({
  prisma: {
    product: { findUnique: jest.fn() },
    wishlistItem: { findMany: jest.fn(), upsert: jest.fn(), deleteMany: jest.fn() },
  },
}));

const { prisma } = require('../../src/shared/database');
const wishlistService = require('../../src/modules/wishlist/wishlist.service');

describe('wishlist.service', () => {
  beforeEach(() => jest.clearAllMocks());

  it('add is idempotent (upsert) and validates the product exists', async () => {
    prisma.product.findUnique.mockResolvedValue({ id: 'p1' });
    prisma.wishlistItem.upsert.mockResolvedValue({});
    const res = await wishlistService.add('u1', 'p1');
    expect(res).toEqual({ added: true, productId: 'p1' });
    expect(prisma.wishlistItem.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId_productId: { userId: 'u1', productId: 'p1' } } }),
    );
  });

  it('add rejects a missing/invalid product', async () => {
    prisma.product.findUnique.mockResolvedValue(null);
    await expect(wishlistService.add('u1', 'ghost')).rejects.toThrow(/Invalid productId/);
    await expect(wishlistService.add('u1', undefined)).rejects.toThrow(/required/);
  });

  it('list returns flattened product info with addedAt', async () => {
    prisma.wishlistItem.findMany.mockResolvedValue([
      { createdAt: new Date('2026-01-01'), product: { id: 'p1', name: 'Atta', slug: 'atta' } },
    ]);
    const items = await wishlistService.list('u1');
    expect(items[0].id).toBe('p1');
    expect(items[0].name).toBe('Atta');
    expect(items[0].addedAt).toBeInstanceOf(Date);
  });

  it('remove is a no-op-safe deleteMany', async () => {
    prisma.wishlistItem.deleteMany.mockResolvedValue({ count: 1 });
    const res = await wishlistService.remove('u1', 'p1');
    expect(res).toEqual({ removed: true, productId: 'p1' });
  });
});
