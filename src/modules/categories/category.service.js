const { prisma } = require('../../shared/database');
const { BadRequestError, ConflictError, NotFoundError } = require('../../shared/errors');

const MAX_RADIUS_METERS = 100_000;

function validateName(name) {
  if (typeof name !== 'string' || !name.trim()) {
    throw new BadRequestError('name is required');
  }
  if (name.trim().length > 100) {
    throw new BadRequestError('name must be 100 characters or fewer');
  }
  return name.trim();
}

function slugFromName(value) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function validateSlug(slug) {
  if (typeof slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new BadRequestError('slug must contain lowercase letters, numbers, and hyphens');
  }
  return slug;
}

function validateInteger(value, field, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new BadRequestError(`${field} must be an integer between ${min} and ${max}`);
  }
  return value;
}

async function validateParent(parentId, categoryId) {
  if (parentId === null || parentId === '') return { parentId: null, level: 0 };
  if (typeof parentId !== 'string') throw new BadRequestError('parentId must be a category id or null');
  if (parentId === categoryId) throw new BadRequestError('A category cannot be its own parent');

  const parent = await prisma.category.findUnique({ where: { id: parentId } });
  if (!parent || !parent.isActive) throw new NotFoundError('Active parent category not found');

  let ancestorId = parent.parentId;
  while (ancestorId) {
    if (ancestorId === categoryId) throw new BadRequestError('Category hierarchy cannot contain a cycle');
    const ancestor = await prisma.category.findUnique({ where: { id: ancestorId } });
    if (!ancestor || !ancestor.isActive) throw new NotFoundError('Active parent category not found');
    ancestorId = ancestor?.parentId ?? null;
  }

  return { parentId, level: parent.level + 1 };
}

async function assertSlugAvailable(slug, excludingId) {
  const existing = await prisma.category.findUnique({ where: { slug } });
  if (existing && existing.id !== excludingId) throw new ConflictError('A category with this slug already exists');
}

async function listAdmin({ page = 1, limit = 50 } = {}) {
  const safePage = Number.isInteger(Number(page)) && Number(page) > 0 ? Number(page) : 1;
  const safeLimit = Number.isInteger(Number(limit)) && Number(limit) > 0
    ? Math.min(Number(limit), 100)
    : 50;
  const where = {};
  const [categories, total] = await Promise.all([
    prisma.category.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
    }),
    prisma.category.count({ where }),
  ]);
  return {
    categories,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      hasNext: safePage * safeLimit < total,
    },
  };
}

async function create(data = {}) {
  const name = validateName(data.name);
  const slug = validateSlug(data.slug || slugFromName(name));
  await assertSlugAvailable(slug);

  const hierarchy = await validateParent(data.parentId ?? null);
  const radius = data.radius === undefined ? 3000 : validateInteger(data.radius, 'radius', 1, MAX_RADIUS_METERS);
  const sortOrder = data.sortOrder === undefined ? 0 : validateInteger(data.sortOrder, 'sortOrder', 0, 1_000_000);
  if (data.isActive !== undefined && typeof data.isActive !== 'boolean') {
    throw new BadRequestError('isActive must be a boolean');
  }
  if (data.icon != null && (typeof data.icon !== 'string' || data.icon.length > 32)) {
    throw new BadRequestError('icon must be 32 characters or fewer');
  }

  return prisma.category.create({
    data: {
      name,
      slug,
      icon: data.icon || null,
      ...hierarchy,
      radius,
      sortOrder,
      isActive: data.isActive !== false,
    },
  });
}

async function update(id, patch = {}) {
  const category = await prisma.category.findUnique({ where: { id } });
  if (!category) throw new NotFoundError('Category not found');

  const data = {};
  if (patch.name !== undefined) data.name = validateName(patch.name);
  if (patch.slug !== undefined) {
    const slug = validateSlug(patch.slug);
    if (slug !== category.slug) {
      throw new BadRequestError('Category slug cannot be changed after creation');
    }
  }
  if (patch.icon !== undefined) {
    if (patch.icon != null && (typeof patch.icon !== 'string' || patch.icon.length > 32)) {
      throw new BadRequestError('icon must be 32 characters or fewer');
    }
    data.icon = patch.icon || null;
  }
  if (patch.radius !== undefined) data.radius = validateInteger(patch.radius, 'radius', 1, MAX_RADIUS_METERS);
  if (patch.sortOrder !== undefined) data.sortOrder = validateInteger(patch.sortOrder, 'sortOrder', 0, 1_000_000);
  if (patch.isActive !== undefined) {
    if (typeof patch.isActive !== 'boolean') throw new BadRequestError('isActive must be a boolean');
    if (patch.isActive && category.parentId && patch.parentId === undefined) {
      await validateParent(category.parentId, id);
    }
    if (!patch.isActive) {
      const activeChildren = await prisma.category.count({ where: { parentId: id, isActive: true } });
      if (activeChildren > 0) {
        throw new BadRequestError('Deactivate child categories before deactivating this category');
      }
    }
    data.isActive = patch.isActive;
  }
  if (patch.parentId !== undefined && patch.parentId !== category.parentId) {
    const hasChildren = await prisma.category.count({ where: { parentId: id } });
    if (hasChildren > 0) throw new BadRequestError('Move or remove child categories before changing this parent');
    Object.assign(data, await validateParent(patch.parentId, id));
  }
  if (Object.keys(data).length === 0) throw new BadRequestError('At least one category field must be provided');

  return prisma.category.update({ where: { id }, data });
}

async function deactivate(id) {
  const category = await prisma.category.findUnique({ where: { id } });
  if (!category) throw new NotFoundError('Category not found');
  const activeChildren = await prisma.category.count({ where: { parentId: id, isActive: true } });
  if (activeChildren > 0) {
    throw new BadRequestError('Deactivate child categories before deactivating this category');
  }
  return prisma.category.update({ where: { id }, data: { isActive: false } });
}

module.exports = { listAdmin, create, update, deactivate, slugFromName };
