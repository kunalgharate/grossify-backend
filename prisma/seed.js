const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...\n');

  // ─── Categories (from PRD Section 5) ───────────────────────
  const categories = [
    { name: 'Grocery / Kirana', slug: 'grocery', icon: '🛒', radius: 3000, sortOrder: 1 },
    { name: 'Fruits & Vegetables', slug: 'fruits-vegetables', icon: '🥕', radius: 3000, sortOrder: 2 },
    { name: 'Dairy', slug: 'dairy', icon: '🥛', radius: 3000, sortOrder: 3 },
    { name: 'Bakery', slug: 'bakery', icon: '🍞', radius: 3000, sortOrder: 4 },
    { name: 'Meat & Fish', slug: 'meat-fish', icon: '🍖', radius: 5000, sortOrder: 5 },
    { name: 'Mobile & Electronics', slug: 'electronics', icon: '📱', radius: 50000, sortOrder: 6 },
    { name: 'Hardware', slug: 'hardware', icon: '🔧', radius: 50000, sortOrder: 7 },
    { name: 'Paint', slug: 'paint', icon: '🎨', radius: 50000, sortOrder: 8 },
    { name: 'Gift Shops', slug: 'gifts', icon: '🎁', radius: 10000, sortOrder: 9 },
    { name: 'Clothing', slug: 'clothing', icon: '👕', radius: 50000, sortOrder: 10 },
    { name: 'Stationery', slug: 'stationery', icon: '📚', radius: 5000, sortOrder: 11 },
    { name: 'Medical / Pharmacy', slug: 'pharmacy', icon: '💊', radius: 3000, sortOrder: 12 },
    { name: 'Pet Supplies', slug: 'pet-supplies', icon: '🐾', radius: 10000, sortOrder: 13 },
    { name: 'Sports', slug: 'sports', icon: '⚽', radius: 50000, sortOrder: 14 },
    { name: 'Home & Kitchen', slug: 'home-kitchen', icon: '🏠', radius: 50000, sortOrder: 15 },
  ];

  for (const cat of categories) {
    await prisma.category.upsert({
      where: { slug: cat.slug },
      update: cat,
      create: cat,
    });
  }
  console.log(`✅ ${categories.length} categories seeded`);

  // ─── Permissions (from PRD Section 4.2.2) ───────────────────
  const permissions = [
    // Stores
    { code: 'stores.view', name: 'View Stores', resource: 'stores', action: 'view' },
    { code: 'stores.create', name: 'Create Store', resource: 'stores', action: 'create' },
    { code: 'stores.edit', name: 'Edit Store', resource: 'stores', action: 'edit' },
    { code: 'stores.delete', name: 'Delete Store', resource: 'stores', action: 'delete' },
    { code: 'stores.approve', name: 'Approve Store', resource: 'stores', action: 'approve' },
    { code: 'stores.suspend', name: 'Suspend Store', resource: 'stores', action: 'suspend' },
    // Products
    { code: 'products.view', name: 'View Products', resource: 'products', action: 'view' },
    { code: 'products.create', name: 'Create Product', resource: 'products', action: 'create' },
    { code: 'products.edit', name: 'Edit Product', resource: 'products', action: 'edit' },
    { code: 'products.delete', name: 'Delete Product', resource: 'products', action: 'delete' },
    { code: 'products.bulk_upload', name: 'Bulk Upload Products', resource: 'products', action: 'bulk_upload' },
    // Orders
    { code: 'orders.view', name: 'View Orders', resource: 'orders', action: 'view' },
    { code: 'orders.edit', name: 'Edit Orders', resource: 'orders', action: 'edit' },
    { code: 'orders.cancel', name: 'Cancel Orders', resource: 'orders', action: 'cancel' },
    { code: 'orders.refund.create', name: 'Create Refund', resource: 'orders', action: 'refund.create' },
    { code: 'orders.refund.approve', name: 'Approve Refund', resource: 'orders', action: 'refund.approve' },
    // Users
    { code: 'users.view', name: 'View Users', resource: 'users', action: 'view' },
    { code: 'users.create', name: 'Create Users', resource: 'users', action: 'create' },
    { code: 'users.edit', name: 'Edit Users', resource: 'users', action: 'edit' },
    { code: 'users.delete', name: 'Delete Users', resource: 'users', action: 'delete' },
    { code: 'users.suspend', name: 'Suspend Users', resource: 'users', action: 'suspend' },
    // Subscriptions
    { code: 'subscriptions.view', name: 'View Subscriptions', resource: 'subscriptions', action: 'view' },
    { code: 'subscriptions.create', name: 'Create Subscription', resource: 'subscriptions', action: 'create' },
    { code: 'subscriptions.edit', name: 'Edit Subscription', resource: 'subscriptions', action: 'edit' },
    { code: 'subscriptions.cancel', name: 'Cancel Subscription', resource: 'subscriptions', action: 'cancel' },
    // Analytics
    { code: 'analytics.view_basic', name: 'View Basic Analytics', resource: 'analytics', action: 'view_basic' },
    { code: 'analytics.view_advanced', name: 'View Advanced Analytics', resource: 'analytics', action: 'view_advanced' },
    { code: 'analytics.export', name: 'Export Analytics', resource: 'analytics', action: 'export' },
    // Roles
    { code: 'roles.view', name: 'View Roles', resource: 'roles', action: 'view' },
    { code: 'roles.create', name: 'Create Role', resource: 'roles', action: 'create' },
    { code: 'roles.edit', name: 'Edit Role', resource: 'roles', action: 'edit' },
    { code: 'roles.delete', name: 'Delete Role', resource: 'roles', action: 'delete' },
    { code: 'roles.assign', name: 'Assign Role', resource: 'roles', action: 'assign' },
    // Payments
    { code: 'payments.view', name: 'View Payments', resource: 'payments', action: 'view' },
    { code: 'payments.refund', name: 'Process Refund', resource: 'payments', action: 'refund' },
    // Notifications
    { code: 'notifications.view', name: 'View Notifications', resource: 'notifications', action: 'view' },
    { code: 'notifications.send_blast', name: 'Send Blast', resource: 'notifications', action: 'send_blast' },
    // Content
    { code: 'content.view', name: 'View Content', resource: 'content', action: 'view' },
    { code: 'content.create', name: 'Create Content', resource: 'content', action: 'create' },
    { code: 'content.edit', name: 'Edit Content', resource: 'content', action: 'edit' },
    { code: 'content.delete', name: 'Delete Content', resource: 'content', action: 'delete' },
    // Settings
    { code: 'settings.view', name: 'View Settings', resource: 'settings', action: 'view' },
    { code: 'settings.edit', name: 'Edit Settings', resource: 'settings', action: 'edit' },
  ];

  for (const perm of permissions) {
    await prisma.permission.upsert({
      where: { code: perm.code },
      update: perm,
      create: perm,
    });
  }
  console.log(`✅ ${permissions.length} permissions seeded`);

  // ─── Roles (from PRD Section 4.2.3) ────────────────────────
  const allPerms = await prisma.permission.findMany();
  const permMap = Object.fromEntries(allPerms.map(p => [p.code, p.id]));

  // Super Admin role
  const superAdmin = await prisma.role.upsert({
    where: { name: 'Super Admin' },
    update: {},
    create: { name: 'Super Admin', description: 'Full platform control', isSystem: true },
  });

  // Assign ALL permissions to Super Admin
  for (const perm of allPerms) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: superAdmin.id, permissionId: perm.id } },
      update: {},
      create: { roleId: superAdmin.id, permissionId: perm.id },
    });
  }

  // Admin role
  const admin = await prisma.role.upsert({
    where: { name: 'Admin' },
    update: {},
    create: { name: 'Admin', description: 'All except critical settings', isSystem: true },
  });

  const adminPermCodes = allPerms
    .filter(p => !['roles.delete', 'settings.edit'].includes(p.code))
    .map(p => p.id);
  for (const permId of adminPermCodes) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: admin.id, permissionId: permId } },
      update: {},
      create: { roleId: admin.id, permissionId: permId },
    });
  }

  // Manager role
  const manager = await prisma.role.upsert({
    where: { name: 'Manager' },
    update: {},
    create: { name: 'Manager', description: 'Operations without delete powers', isSystem: true },
  });

  const managerPermCodes = [
    'stores.view', 'stores.create', 'stores.edit', 'stores.approve',
    'products.view', 'products.create', 'products.edit',
    'orders.view', 'orders.edit', 'orders.cancel', 'orders.refund.create',
    'users.view', 'users.edit',
    'analytics.view_basic', 'analytics.view_advanced',
    'subscriptions.view',
    'notifications.view',
    'content.view', 'content.create', 'content.edit',
  ];
  for (const code of managerPermCodes) {
    if (permMap[code]) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: manager.id, permissionId: permMap[code] } },
        update: {},
        create: { roleId: manager.id, permissionId: permMap[code] },
      });
    }
  }

  // Support role
  const support = await prisma.role.upsert({
    where: { name: 'Support Agent' },
    update: {},
    create: { name: 'Support Agent', description: 'View and edit limited store data', isSystem: true },
  });

  const supportPermCodes = ['stores.view', 'stores.edit', 'orders.view', 'users.view', 'notifications.view'];
  for (const code of supportPermCodes) {
    if (permMap[code]) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: support.id, permissionId: permMap[code] } },
        update: {},
        create: { roleId: support.id, permissionId: permMap[code] },
      });
    }
  }

  console.log('✅ 4 roles seeded (Super Admin, Admin, Manager, Support)');

  // ─── Subscription Plans (from PRD Section 6.2) ─────────────
  const plans = [
    // Grocery / Kirana
    { name: 'Starter', categoryType: 'grocery', monthlyPrice: 199, annualPrice: 1990, productLimit: 100, features: { offers: false, analytics: false, priority_support: false, featured: false }, sortOrder: 1 },
    { name: 'Standard', categoryType: 'grocery', monthlyPrice: 399, annualPrice: 3990, productLimit: 500, features: { offers: true, analytics: true, priority_support: false, featured: false }, sortOrder: 2 },
    { name: 'Premium', categoryType: 'grocery', monthlyPrice: 699, annualPrice: 6990, productLimit: -1, features: { offers: true, analytics: true, priority_support: true, featured: true }, sortOrder: 3 },
    // Electronics
    { name: 'Starter', categoryType: 'electronics', monthlyPrice: 149, annualPrice: 1490, productLimit: 25, features: { offers: false, analytics: false, priority_support: false, featured: false }, sortOrder: 1 },
    { name: 'Standard', categoryType: 'electronics', monthlyPrice: 299, annualPrice: 2990, productLimit: 100, features: { offers: true, analytics: true, priority_support: false, featured: false }, sortOrder: 2 },
    { name: 'Premium', categoryType: 'electronics', monthlyPrice: 499, annualPrice: 4990, productLimit: 500, features: { offers: true, analytics: true, priority_support: true, featured: true }, sortOrder: 3 },
    // Meat / Dairy / Bakery
    { name: 'Starter', categoryType: 'meat-dairy-bakery', monthlyPrice: 99, annualPrice: 990, productLimit: 25, features: { offers: false, analytics: false, priority_support: false, featured: false }, sortOrder: 1 },
    { name: 'Standard', categoryType: 'meat-dairy-bakery', monthlyPrice: 199, annualPrice: 1990, productLimit: 75, features: { offers: true, analytics: true, priority_support: false, featured: false }, sortOrder: 2 },
    { name: 'Premium', categoryType: 'meat-dairy-bakery', monthlyPrice: 349, annualPrice: 3490, productLimit: 200, features: { offers: true, analytics: true, priority_support: true, featured: true }, sortOrder: 3 },
    // Hardware / Paint / Specialty
    { name: 'Starter', categoryType: 'hardware-specialty', monthlyPrice: 199, annualPrice: 1990, productLimit: 50, features: { offers: false, analytics: false, priority_support: false, featured: false }, sortOrder: 1 },
    { name: 'Standard', categoryType: 'hardware-specialty', monthlyPrice: 399, annualPrice: 3990, productLimit: 200, features: { offers: true, analytics: true, priority_support: false, featured: false }, sortOrder: 2 },
    { name: 'Premium', categoryType: 'hardware-specialty', monthlyPrice: 699, annualPrice: 6990, productLimit: 1000, features: { offers: true, analytics: true, priority_support: true, featured: true }, sortOrder: 3 },
    // General (Gift / Clothing)
    { name: 'Starter', categoryType: 'general', monthlyPrice: 149, annualPrice: 1490, productLimit: 50, features: { offers: false, analytics: false, priority_support: false, featured: false }, sortOrder: 1 },
    { name: 'Standard', categoryType: 'general', monthlyPrice: 299, annualPrice: 2990, productLimit: 200, features: { offers: true, analytics: true, priority_support: false, featured: false }, sortOrder: 2 },
    { name: 'Premium', categoryType: 'general', monthlyPrice: 499, annualPrice: 4990, productLimit: -1, features: { offers: true, analytics: true, priority_support: true, featured: true }, sortOrder: 3 },
  ];

  // Delete existing plans and re-create (plans don't have a unique slug)
  await prisma.plan.deleteMany({});
  await prisma.plan.createMany({ data: plans });
  console.log(`✅ ${plans.length} subscription plans seeded`);

  console.log('\n🎉 Seed complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
