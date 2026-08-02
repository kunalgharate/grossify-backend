const { prisma } = require('../../shared/database');
const { NotFoundError, BadRequestError, ForbiddenError } = require('../../shared/errors');

/**
 * Find nearby stores using basic distance calculation
 */
const findNearby = async ({ lat, lng, radius, category, page = 1, limit = 20 }) => {
  if (!lat || !lng) {
    throw new BadRequestError('Latitude and longitude are required');
  }

  const latNum = parseFloat(lat);
  const lngNum = parseFloat(lng);
  const radiusM = parseInt(radius) || 3000;
  const pageNum = parseInt(page);
  const limitNum = Math.min(parseInt(limit) || 20, 50);
  const skip = (pageNum - 1) * limitNum;

  // Build where clause
  const where = { status: 'ACTIVE' };

  // If category slug provided, resolve to ID
  if (category) {
    const cat = await prisma.category.findUnique({ where: { slug: category } });
    if (cat) {
      where.categoryId = cat.id;
    }
  }

  // Bounding box filter (rough, then exact distance in app layer)
  // 1 degree lat ≈ 111km, 1 degree lng ≈ 111km * cos(lat)
  const latDelta = radiusM / 111000;
  const lngDelta = radiusM / (111000 * Math.cos(latNum * Math.PI / 180));

  where.latitude = { gte: latNum - latDelta, lte: latNum + latDelta };
  where.longitude = { gte: lngNum - lngDelta, lte: lngNum + lngDelta };

  const [stores, total] = await Promise.all([
    prisma.store.findMany({
      where,
      skip,
      take: limitNum,
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
        rating: true,
        totalReviews: true,
        isOpen: true,
        latitude: true,
        longitude: true,
        address: true,
        city: true,
        category: { select: { name: true, slug: true } },
      },
    }),
    prisma.store.count({ where }),
  ]);

  // Calculate distance for each store
  const storesWithDistance = stores.map(store => {
    const distance = haversineDistance(latNum, lngNum, parseFloat(store.latitude), parseFloat(store.longitude));
    return { ...store, distance: Math.round(distance) };
  }).filter(s => s.distance <= radiusM)
    .sort((a, b) => a.distance - b.distance);

  return {
    stores: storesWithDistance,
    pagination: { page: pageNum, limit: limitNum, total, hasNext: skip + limitNum < total },
    meta: { radius_used: radiusM, location: { lat: latNum, lng: lngNum } },
  };
};

/**
 * Get store by ID or slug
 */
const getById = async (idOrSlug) => {
  const store = await prisma.store.findFirst({
    where: {
      OR: [
        { id: idOrSlug },
        { slug: idOrSlug },
      ],
    },
    include: {
      category: { select: { id: true, name: true, slug: true } },
      owner: { select: { id: true, name: true } },
      offers: {
        where: { isActive: true, validUntil: { gte: new Date() } },
        take: 5,
      },
    },
  });

  if (!store) {
    throw new NotFoundError('Store not found');
  }

  return store;
};

/**
 * Create a new store (vendor registration)
 */
const create = async (ownerId, data) => {
  const { name, categoryId, description, address, city, state, pincode, latitude, longitude, phone, gstNumber, fssaiNumber } = data;

  if (!name || !categoryId || !address || !city || !state || !pincode || !latitude || !longitude) {
    throw new BadRequestError('Required fields: name, categoryId, address, city, state, pincode, latitude, longitude');
  }

  // Verify category exists
  const category = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!category) {
    throw new BadRequestError('Invalid category');
  }

  // Generate slug
  const slug = generateSlug(name, city);

  const store = await prisma.store.create({
    data: {
      ownerId,
      name,
      slug,
      categoryId,
      description: description || null,
      address,
      city,
      state,
      pincode,
      latitude,
      longitude,
      phone: phone || null,
      gstNumber: gstNumber || null,
      fssaiNumber: fssaiNumber || null,
      status: 'PENDING',
    },
    include: {
      category: { select: { name: true, slug: true } },
    },
  });

  return store;
};

/**
 * Update store details (owner only)
 */
const update = async (storeId, userId, data) => {
  const store = await prisma.store.findUnique({ where: { id: storeId } });

  if (!store) {
    throw new NotFoundError('Store not found');
  }

  if (store.ownerId !== userId) {
    throw new ForbiddenError('You can only update your own store');
  }

  // Fields allowed to update
  const allowedFields = ['name', 'description', 'address', 'city', 'state', 'pincode',
    'latitude', 'longitude', 'isOpen', 'businessHours', 'phone', 'gstNumber', 'fssaiNumber'];

  const updateData = {};
  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      updateData[field] = data[field];
    }
  }

  const updated = await prisma.store.update({
    where: { id: storeId },
    data: updateData,
  });

  return updated;
};

// ─── Helpers ──────────────────────────────────────────────

function generateSlug(name, city) {
  const base = `${name}-${city}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const suffix = Math.random().toString(36).substring(2, 6);
  return `${base}-${suffix}`;
}

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

module.exports = { findNearby, getById, create, update };
