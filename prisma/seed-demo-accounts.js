/**
 * Demo accounts for portal logins (OTP = 123456 in demo mode).
 * Idempotent: safe to re-run. Creates/ensures:
 *   - Admin  : phone +919000000001  -> Super Admin role (logical 'admin')
 *   - Seller : phone +919000000002  -> owns an ACTIVE, KYC-VERIFIED store (logical 'vendor')
 * Does NOT delete anything. Run: node prisma/seed-demo-accounts.js
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const ADMIN_PHONE = '+919000000001';
const SELLER_PHONE = '+919000000002';
const STAFF_PHONE = '+919000000003';

async function ensureUser(phone, name) {
  let user = await prisma.user.findUnique({ where: { phone } });
  if (!user) {
    user = await prisma.user.create({ data: { phone, name, status: 'ACTIVE' } });
    console.log(`created user ${name} (${phone}) -> ${user.id}`);
  } else {
    console.log(`user exists ${name} (${phone}) -> ${user.id}`);
  }
  return user;
}

async function main() {
  // ── Admin ───────────────────────────────────────────────────────────────
  const admin = await ensureUser(ADMIN_PHONE, 'Demo Admin');
  const superAdmin = await prisma.role.findUnique({ where: { name: 'Super Admin' } });
  if (!superAdmin) {
    console.error('✗ "Super Admin" role not found — run `npm run db:seed` first.');
    process.exit(1);
  }
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: superAdmin.id } },
    create: { userId: admin.id, roleId: superAdmin.id },
    update: {},
  });
  console.log(`✓ admin ${ADMIN_PHONE} has Super Admin`);

  // ── Seller (must own a store) ─────────────────────────────────────────────
  const seller = await ensureUser(SELLER_PHONE, 'Demo Seller');
  let store = await prisma.store.findFirst({ where: { ownerId: seller.id } });
  if (!store) {
    // Need a category to attach the store to.
    const category =
      (await prisma.category.findFirst({ where: { slug: 'grocery' } })) ||
      (await prisma.category.findFirst());
    if (!category) {
      console.error('✗ No category found — run `npm run db:seed` first.');
      process.exit(1);
    }
    store = await prisma.store.create({
      data: {
        ownerId: seller.id,
        name: 'Demo Mart',
        slug: `demo-mart-${Date.now().toString(36)}`,
        categoryId: category.id,
        description: 'Demo seller store for portal testing',
        address: 'Demo Street',
        city: 'Nashik',
        state: 'Maharashtra',
        pincode: '422001',
        latitude: 19.9975,
        longitude: 73.7898,
        phone: SELLER_PHONE,
        status: 'ACTIVE',
        kycStatus: 'VERIFIED',
        aadhaarVerified: true,
      },
    });
    console.log(`created store "Demo Mart" -> ${store.id}`);
  } else {
    // Make sure it's active + verified so the seller can actually use it.
    store = await prisma.store.update({
      where: { id: store.id },
      data: { status: 'ACTIVE', kycStatus: 'VERIFIED' },
    });
    console.log(`store exists "${store.name}" -> ${store.id} (ensured ACTIVE/VERIFIED)`);
  }
  console.log(`✓ seller ${SELLER_PHONE} owns store ${store.id}`);

  // ── Owner as OWNER staff + a demo STAFF member ───────────────────────────
  await prisma.storeStaff.upsert({
    where: { storeId_userId: { storeId: store.id, userId: seller.id } },
    create: { storeId: store.id, userId: seller.id, role: 'OWNER', status: 'ACTIVE' },
    update: { role: 'OWNER', status: 'ACTIVE' },
  });
  const staffUser = await ensureUser(STAFF_PHONE, 'Demo Staff');
  await prisma.storeStaff.upsert({
    where: { storeId_userId: { storeId: store.id, userId: staffUser.id } },
    create: { storeId: store.id, userId: staffUser.id, role: 'CASHIER', status: 'ACTIVE', invitedBy: seller.id },
    update: { role: 'CASHIER', status: 'ACTIVE' },
  });
  console.log(`✓ staff ${STAFF_PHONE} is CASHIER at ${store.name}`);

  // ── Demo products ────────────────────────────────────────────────────────
  const catId = store.categoryId;
  const demoProducts = [
    { name: 'Toor Dal 1kg', mrp: 180, sellingPrice: 160, stock: 50, hsn: '0713' },
    { name: 'Basmati Rice 5kg', mrp: 650, sellingPrice: 599, stock: 30, hsn: '1006' },
    { name: 'Sunflower Oil 1L', mrp: 150, sellingPrice: 139, stock: 40, hsn: '1512' },
    { name: 'Sugar 1kg', mrp: 55, sellingPrice: 50, stock: 100, hsn: '1701' },
  ];
  const products = [];
  for (const dp of demoProducts) {
    const slug = `${dp.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${store.id.slice(0, 6)}`;
    const existing = await prisma.product.findFirst({ where: { storeId: store.id, name: dp.name } });
    const p = existing
      ? existing
      : await prisma.product.create({
          data: {
            storeId: store.id, name: dp.name, slug, categoryId: catId,
            mrp: dp.mrp, sellingPrice: dp.sellingPrice, stockQuantity: dp.stock,
            unit: 'piece', hsn: dp.hsn, isAvailable: true, reorderLevel: 10,
          },
        });
    products.push(p);
  }
  console.log(`✓ ${products.length} demo products ensured`);

  // ── Demo orders (idempotent on orderNumber) ──────────────────────────────
  const demoOrders = [
    { num: 'GRS-DEMO-0001', status: 'DELIVERED', channel: 'ONLINE', items: [[0, 2], [3, 1]] },
    { num: 'GRS-DEMO-0002', status: 'PLACED', channel: 'ONLINE', items: [[1, 1]] },
    { num: 'GRS-DEMO-0003', status: 'DELIVERED', channel: 'POS', items: [[2, 3], [3, 2]] },
  ];
  let created = 0;
  for (const o of demoOrders) {
    const existing = await prisma.order.findUnique({ where: { orderNumber: o.num } });
    if (existing) continue;
    const items = o.items.map(([idx, qty]) => {
      const p = products[idx];
      const unit = Number(p.sellingPrice);
      return { productId: p.id, productName: p.name, quantity: qty, unitPrice: unit, totalPrice: unit * qty };
    });
    const subtotal = items.reduce((s, i) => s + i.totalPrice, 0);
    await prisma.order.create({
      data: {
        orderNumber: o.num, storeId: store.id, customerId: null,
        status: o.status, channel: o.channel, paymentMethod: 'COD',
        subtotal, total: subtotal,
        items: { create: items },
      },
    });
    created++;
  }
  console.log(`✓ ${created} demo orders created (idempotent)`);

  console.log('\n=== DEMO LOGINS (OTP = 123456) ===');
  console.log(`Admin  portal: phone ${ADMIN_PHONE}`);
  console.log(`Seller portal: phone ${SELLER_PHONE}  (owner of "Demo Mart")`);
  console.log(`Store staff  : phone ${STAFF_PHONE}  (CASHIER at "Demo Mart" — sees store orders)`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
