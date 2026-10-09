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
const CUSTOMER_PHONE = '+919000000004';
const B2B_SELLER_PHONE = '+919000000005';

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

  // ── Demo customer + address + a customer-linked ONLINE order ──────────────
  // Gives the seller app real data for the Customers screen and the order
  // detail's customer relation + delivery address.
  const customer = await ensureUser(CUSTOMER_PHONE, 'Demo Customer');
  let address = await prisma.address.findFirst({ where: { userId: customer.id } });
  if (!address) {
    address = await prisma.address.create({
      data: {
        userId: customer.id,
        label: 'Home',
        fullAddress: '12 College Road, Near City Center',
        landmark: 'Opp. Big Bazaar',
        city: 'Nashik',
        pincode: '422005',
        latitude: 20.0059,
        longitude: 73.7910,
        isDefault: true,
      },
    });
    console.log(`created address for customer -> ${address.id}`);
  }

  const CUST_ORDER_NUM = 'GRS-DEMO-0004';
  const existingCustOrder = await prisma.order.findUnique({ where: { orderNumber: CUST_ORDER_NUM } });
  if (!existingCustOrder) {
    // Toor Dal x2 + Sunflower Oil x1
    const custItems = [[0, 2], [2, 1]].map(([idx, qty]) => {
      const p = products[idx];
      const unit = Number(p.sellingPrice);
      return { productId: p.id, productName: p.name, quantity: qty, unitPrice: unit, totalPrice: unit * qty };
    });
    const custSubtotal = custItems.reduce((s, i) => s + i.totalPrice, 0);
    const deliveryFee = 25;
    await prisma.order.create({
      data: {
        orderNumber: CUST_ORDER_NUM,
        storeId: store.id,
        customerId: customer.id,
        addressId: address.id,
        customerName: customer.name,
        customerPhone: customer.phone,
        status: 'PLACED',
        channel: 'ONLINE',
        paymentMethod: 'COD',
        paymentStatus: 'PENDING',
        subtotal: custSubtotal,
        deliveryFee,
        total: custSubtotal + deliveryFee,
        items: { create: custItems },
      },
    });
    console.log(`✓ customer-linked online order ${CUST_ORDER_NUM} created`);
  } else {
    console.log(`order ${CUST_ORDER_NUM} already exists`);
  }

  // ── B2B demo store (a farm selling to hotels/businesses) ──────────────────
  // Demonstrates the B2B segment: hidden from radius discovery, visible only
  // to users in B2B mode (no radius). Idempotent on ownerId.
  const b2bSeller = await ensureUser(B2B_SELLER_PHONE, 'Demo Farm (B2B)');
  let b2bStore = await prisma.store.findFirst({ where: { ownerId: b2bSeller.id } });
  if (!b2bStore) {
    const b2bCategory =
      (await prisma.category.findFirst({ where: { slug: 'vegetables' } })) ||
      (await prisma.category.findFirst({ where: { slug: 'grocery' } })) ||
      (await prisma.category.findFirst());
    b2bStore = await prisma.store.create({
      data: {
        ownerId: b2bSeller.id,
        name: 'GreenFarm Wholesale',
        slug: `greenfarm-wholesale-${Date.now().toString(36)}`,
        categoryId: b2bCategory.id,
        description: 'Farm-fresh produce in bulk for hotels, restaurants & caterers (B2B)',
        address: 'Gangapur Road Farms',
        city: 'Nashik',
        state: 'Maharashtra',
        pincode: '422013',
        latitude: 20.0110,
        longitude: 73.7500,
        phone: B2B_SELLER_PHONE,
        status: 'ACTIVE',
        kycStatus: 'VERIFIED',
        aadhaarVerified: true,
        storeType: 'B2B',
      },
    });
    console.log(`created B2B store "GreenFarm Wholesale" -> ${b2bStore.id}`);
  } else {
    b2bStore = await prisma.store.update({
      where: { id: b2bStore.id },
      data: { status: 'ACTIVE', kycStatus: 'VERIFIED', storeType: 'B2B' },
    });
    console.log(`B2B store exists "${b2bStore.name}" -> ${b2bStore.id} (ensured ACTIVE/VERIFIED/B2B)`);
  }
  await prisma.storeStaff.upsert({
    where: { storeId_userId: { storeId: b2bStore.id, userId: b2bSeller.id } },
    create: { storeId: b2bStore.id, userId: b2bSeller.id, role: 'OWNER', status: 'ACTIVE' },
    update: { role: 'OWNER', status: 'ACTIVE' },
  });
  const b2bProducts = [
    { name: 'Tomatoes (10kg crate)', mrp: 400, sellingPrice: 350, stock: 200, hsn: '0702' },
    { name: 'Onions (25kg bag)', mrp: 750, sellingPrice: 680, stock: 150, hsn: '0703' },
    { name: 'Potatoes (25kg bag)', mrp: 600, sellingPrice: 540, stock: 180, hsn: '0701' },
    { name: 'Green Chillies (5kg)', mrp: 300, sellingPrice: 260, stock: 90, hsn: '0709' },
  ];
  let b2bCreated = 0;
  for (const dp of b2bProducts) {
    const existing = await prisma.product.findFirst({ where: { storeId: b2bStore.id, name: dp.name } });
    if (existing) continue;
    const slug = `${dp.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${b2bStore.id.slice(0, 6)}`;
    await prisma.product.create({
      data: {
        storeId: b2bStore.id, name: dp.name, slug, categoryId: b2bStore.categoryId,
        mrp: dp.mrp, sellingPrice: dp.sellingPrice, stockQuantity: dp.stock,
        unit: 'crate', hsn: dp.hsn, isAvailable: true, reorderLevel: 20,
      },
    });
    b2bCreated++;
  }
  console.log(`✓ B2B store ensured + ${b2bCreated} B2B products created`);

  console.log('\n=== DEMO LOGINS (OTP = 123456) ===');
  console.log(`Admin  portal: phone ${ADMIN_PHONE}`);
  console.log(`Seller portal: phone ${SELLER_PHONE}  (owner of "Demo Mart" — B2C)`);
  console.log(`Store staff  : phone ${STAFF_PHONE}  (CASHIER at "Demo Mart")`);
  console.log(`Customer     : phone ${CUSTOMER_PHONE} (placed online order ${CUST_ORDER_NUM})`);
  console.log(`B2B seller   : phone ${B2B_SELLER_PHONE} (owner of "GreenFarm Wholesale" — B2B)`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
