const { prisma } = require('../../shared/database');
const { NotFoundError, BadRequestError, ForbiddenError } = require('../../shared/errors');

/**
 * List products with filters
 */
const list = async ({ storeId, category, search, page = 1, limit = 20, sort }) => {
  const pageNum = parseInt(page);
  const limitNum = Math.min(parseInt(limit) || 20, 50);
  const skip = (pageNum - 1) * limitNum;

  const where = { status: 'ACTIVE' };

  if (storeId) where.storeId = storeId;

  if (category) {
    const cat = await prisma.category.findUnique({ where: { slug: category } });
    if (cat) where.categoryId = cat.id;
  }

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ];
  }

  // Sort options
  let orderBy = { createdAt: 'desc' };
  if (sort === 'price_asc') orderBy = { sellingPrice: 'asc' };
  else if (sort === 'price_desc') orderBy = { sellingPrice: 'desc' };
  else if (sort === 'newest') orderBy = { createdAt: 'desc' };
  else if (sort === 'popular') orderBy = { store: { totalOrders: 'desc' } };

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      skip,
      take: limitNum,
      orderBy,
      select: {
        id: true,
        name: true,
        slug: true,
        images: true,
        mrp: true,
        sellingPrice: true,
        isAvailable: true,
        stockQuantity: true,
        unit: true,
        store: { select: { id: true, name: true, slug: true } },
        category: { select: { name: true, slug: true } },
      },
    }),
    prisma.product.count({ where }),
  ]);

  return {
    products,
    pagination: { page: pageNum, limit: limitNum, total, hasNext: skip + limitNum < total },
  };
};

/**
 * Get single product by ID
 */
const getById = async (productId) => {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      variants: true,
      store: { select: { id: true, name: true, slug: true, isOpen: true } },
      category: { select: { id: true, name: true, slug: true } },
    },
  });

  if (!product || product.status === 'DELETED') {
    throw new NotFoundError('Product not found');
  }

  return product;
};

/**
 * Create product (vendor)
 */
const create = async (userId, data) => {
  const { storeId, name, description, categoryId, mrp, sellingPrice, stockQuantity, unit, images, barcode, hsn, attributes, variants } = data;

  if (!storeId || !name || !categoryId || !mrp || !sellingPrice) {
    throw new BadRequestError('Required: storeId, name, categoryId, mrp, sellingPrice');
  }

  // Verify store ownership
  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) throw new NotFoundError('Store not found');
  if (store.ownerId !== userId) throw new ForbiddenError('Not your store');
  if (store.status !== 'ACTIVE') throw new BadRequestError('Store is not active');

  // Check plan product limit
  const subscription = await prisma.subscription.findUnique({ where: { storeId } });
  if (subscription) {
    const plan = await prisma.plan.findUnique({ where: { id: subscription.planId } });
    if (plan && plan.productLimit !== -1) {
      const currentCount = await prisma.product.count({ where: { storeId, status: 'ACTIVE' } });
      if (currentCount >= plan.productLimit) {
        throw new ForbiddenError(`Plan limit reached (${plan.productLimit} products). Upgrade your plan.`);
      }
    }
  }

  // Generate slug
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const product = await prisma.product.create({
    data: {
      storeId,
      name,
      slug,
      description: description || null,
      categoryId,
      mrp,
      sellingPrice,
      stockQuantity: stockQuantity || 0,
      unit: unit || 'piece',
      images: images || [],
      barcode: barcode || null,
      hsn: hsn || null,
      attributes: attributes || null,
      variants: variants && variants.length > 0 ? {
        create: variants.map(v => ({
          variantName: v.variantName,
          variantType: v.variantType,
          priceOverride: v.priceOverride || null,
          stockQuantity: v.stockQuantity || 0,
        })),
      } : undefined,
    },
    include: { variants: true },
  });

  return product;
};

/**
 * Update product
 */
const update = async (productId, userId, data) => {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { store: { select: { ownerId: true } } },
  });

  if (!product || product.status === 'DELETED') throw new NotFoundError('Product not found');
  if (product.store.ownerId !== userId) throw new ForbiddenError('Not your product');

  const allowedFields = ['name', 'description', 'mrp', 'sellingPrice', 'stockQuantity',
    'isAvailable', 'unit', 'images', 'barcode', 'attributes'];

  const updateData = {};
  for (const field of allowedFields) {
    if (data[field] !== undefined) updateData[field] = data[field];
  }

  const updated = await prisma.product.update({
    where: { id: productId },
    data: updateData,
  });

  return updated;
};

/**
 * Soft delete product
 */
const remove = async (productId, userId) => {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { store: { select: { ownerId: true } } },
  });

  if (!product) throw new NotFoundError('Product not found');
  if (product.store.ownerId !== userId) throw new ForbiddenError('Not your product');

  await prisma.product.update({
    where: { id: productId },
    data: { status: 'DELETED' },
  });

  return true;
};

module.exports = { list, getById, create, update, remove };
