const { prisma } = require('../../shared/database');
const { BadRequestError, NotFoundError } = require('../../shared/errors');

async function listOffers({ status, search, page = 1, limit = 20 } = {}) {
  const pageNumber = Number.parseInt(page, 10);
  const limitNumber = Number.parseInt(limit, 10);
  const safePage = Number.isInteger(pageNumber) && pageNumber > 0 ? pageNumber : 1;
  const safeLimit = Number.isInteger(limitNumber) && limitNumber > 0 ? Math.min(limitNumber, 50) : 20;
  const where = {};

  if (status === 'ACTIVE') where.isActive = true;
  else if (status === 'INACTIVE') where.isActive = false;
  else if (status !== undefined && status !== '') throw new BadRequestError('status must be ACTIVE or INACTIVE');

  if (search) {
    const term = String(search).trim();
    if (term.length > 100) throw new BadRequestError('search must be 100 characters or fewer');
    if (term) {
      where.OR = [
        { title: { contains: term, mode: 'insensitive' } },
        { code: { contains: term, mode: 'insensitive' } },
        { store: { name: { contains: term, mode: 'insensitive' } } },
      ];
    }
  }

  const [offers, total] = await Promise.all([
    prisma.offer.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
      include: { store: { select: { id: true, name: true } } },
    }),
    prisma.offer.count({ where }),
  ]);

  return {
    offers,
    pagination: { page: safePage, limit: safeLimit, total, hasNext: safePage * safeLimit < total },
  };
}

async function setOfferActive(id, isActive) {
  if (typeof isActive !== 'boolean') throw new BadRequestError('isActive must be a boolean');
  const existing = await prisma.offer.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new NotFoundError('Offer not found');
  return prisma.offer.update({ where: { id }, data: { isActive } });
}

module.exports = { listOffers, setOfferActive };
