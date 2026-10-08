const { prisma } = require('../../shared/database');
const { BadRequestError } = require('../../shared/errors');

/**
 * Wishlist (save-for-later) service. A wishlist item is a (user, product) pair;
 * adding is idempotent (unique constraint), removing is a no-op if absent.
 */

const list = async (userId) => {
  const items = await prisma.wishlistItem.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: {
      product: {
        select: {
          id: true,
          name: true,
          slug: true,
          images: true,
          mrp: true,
          sellingPrice: true,
          isAvailable: true,
          store: { select: { id: true, name: true, slug: true } },
        },
      },
    },
  });
  return items.map((i) => ({ addedAt: i.createdAt, ...i.product }));
};

const add = async (userId, productId) => {
  if (!productId) throw new BadRequestError('productId is required');
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true } });
  if (!product) throw new BadRequestError('Invalid productId');

  // Idempotent: upsert on the unique (userId, productId).
  await prisma.wishlistItem.upsert({
    where: { userId_productId: { userId, productId } },
    create: { userId, productId },
    update: {},
  });
  return { added: true, productId };
};

const remove = async (userId, productId) => {
  await prisma.wishlistItem.deleteMany({ where: { userId, productId } });
  return { removed: true, productId };
};

module.exports = { list, add, remove };
