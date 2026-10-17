jest.mock('../../src/shared/database', () => ({
  prisma: {
    offer: { findMany: jest.fn(), count: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  },
}));

const { prisma } = require('../../src/shared/database');
const service = require('../../src/modules/admin/admin-offers.service');

describe('admin-offers.service', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns filtered, paginated offers and metadata', async () => {
    prisma.offer.findMany.mockResolvedValue([{ id: 'offer-1' }]);
    prisma.offer.count.mockResolvedValue(21);

    const result = await service.listOffers({ status: 'ACTIVE', search: 'sale', page: '2', limit: '10' });

    expect(result).toMatchObject({
      offers: [{ id: 'offer-1' }],
      pagination: { page: 2, limit: 10, total: 21, hasNext: true },
    });
    expect(prisma.offer.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        isActive: true,
        OR: expect.arrayContaining([expect.objectContaining({ title: expect.any(Object) })]),
      }),
      skip: 10,
      take: 10,
    }));
  });

  it('rejects unsupported status filters', async () => {
    await expect(service.listOffers({ status: 'PENDING' })).rejects.toThrow(/status must be ACTIVE or INACTIVE/);
    expect(prisma.offer.findMany).not.toHaveBeenCalled();
  });

  it('rejects invalid moderation values', async () => {
    await expect(service.setOfferActive('offer-1', 'false')).rejects.toThrow(/isActive must be a boolean/);
    expect(prisma.offer.update).not.toHaveBeenCalled();
  });

  it('updates offer status after verifying it exists', async () => {
    prisma.offer.findUnique.mockResolvedValue({ id: 'offer-1' });
    prisma.offer.update.mockResolvedValue({ id: 'offer-1', isActive: false });

    await expect(service.setOfferActive('offer-1', false)).resolves.toMatchObject({ isActive: false });
    expect(prisma.offer.update).toHaveBeenCalledWith({
      where: { id: 'offer-1' },
      data: { isActive: false },
    });
  });
});
