jest.mock('../../src/shared/database', () => ({
  prisma: {
    category: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}));

const { prisma } = require('../../src/shared/database');
const categories = require('../../src/modules/categories/category.service');

describe('category.service', () => {
  beforeEach(() => jest.clearAllMocks());

  it('generates a normalized category slug', () => {
    expect(categories.slugFromName('  Fresh & Dairy  ')).toBe('fresh-dairy');
  });

  it('creates categories with a generated slug and default discovery settings', async () => {
    prisma.category.findUnique.mockResolvedValue(null);
    prisma.category.create.mockImplementation(({ data }) => Promise.resolve(data));

    const category = await categories.create({ name: 'Fresh & Dairy' });

    expect(category).toMatchObject({
      name: 'Fresh & Dairy',
      slug: 'fresh-dairy',
      parentId: null,
      level: 0,
      radius: 3000,
      sortOrder: 0,
      isActive: true,
    });
  });

  it('sets a child category level from its active parent', async () => {
    prisma.category.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'parent', parentId: null, level: 0, isActive: true });
    prisma.category.create.mockImplementation(({ data }) => Promise.resolve(data));

    const category = await categories.create({ name: 'Milk', parentId: 'parent' });

    expect(category).toMatchObject({ parentId: 'parent', level: 1 });
  });

  it('rejects duplicate slugs before writing', async () => {
    prisma.category.findUnique.mockResolvedValue({ id: 'existing', slug: 'milk' });

    await expect(categories.create({ name: 'Milk', slug: 'milk' })).rejects.toThrow(/slug already exists/);
    expect(prisma.category.create).not.toHaveBeenCalled();
  });

  it('does not change an existing public slug', async () => {
    prisma.category.findUnique.mockResolvedValue({ id: 'category', slug: 'old-slug' });

    await expect(categories.update('category', { slug: 'new-slug' })).rejects.toThrow(/cannot be changed/);
    expect(prisma.category.update).not.toHaveBeenCalled();
  });

  it('rejects deactivating a category with active children', async () => {
    prisma.category.findUnique.mockResolvedValue({ id: 'parent' });
    prisma.category.count.mockResolvedValue(1);

    await expect(categories.deactivate('parent')).rejects.toThrow(/Deactivate child categories/);
    expect(prisma.category.update).not.toHaveBeenCalled();
  });

  it('does not allow PATCH to bypass the active-child deactivation guard', async () => {
    prisma.category.findUnique.mockResolvedValue({ id: 'parent' });
    prisma.category.count.mockResolvedValue(1);

    await expect(categories.update('parent', { isActive: false })).rejects.toThrow(/Deactivate child categories/);
    expect(prisma.category.update).not.toHaveBeenCalled();
  });

  it('rejects a parent cycle when editing a category', async () => {
    prisma.category.findUnique
      .mockResolvedValueOnce({ id: 'category', parentId: null })
      .mockResolvedValueOnce({ id: 'parent', parentId: 'category', isActive: true });
    prisma.category.count.mockResolvedValue(0);

    await expect(categories.update('category', { parentId: 'parent' })).rejects.toThrow(/cannot contain a cycle/);
  });

  it('does not reactivate a child under an inactive parent', async () => {
    prisma.category.findUnique
      .mockResolvedValueOnce({ id: 'child', parentId: 'parent' })
      .mockResolvedValueOnce({ id: 'parent', parentId: null, level: 0, isActive: false });

    await expect(categories.update('child', { isActive: true })).rejects.toThrow(/Active parent category/);
    expect(prisma.category.update).not.toHaveBeenCalled();
  });
});
