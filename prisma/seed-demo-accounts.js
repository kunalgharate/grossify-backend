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

  console.log('\n=== DEMO LOGINS (OTP = 123456) ===');
  console.log(`Admin  portal: phone ${ADMIN_PHONE}`);
  console.log(`Seller portal: phone ${SELLER_PHONE}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
