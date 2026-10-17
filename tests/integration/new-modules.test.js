process.env.JWT_EXPIRES_IN = '15m';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';

const request = require('supertest');
const fs = require('fs');
const path = require('path');
const app = require('../../src/app');
const { prisma } = require('../../src/shared/database');
const { acceptCurrentOrderPolicies } = require('../fixtures/order-policy-acceptance');

let token;
let userId;
let storeId;
let productId;
let orderId;
let categoryId;
let cleanupPolicyAcceptances;

beforeAll(async () => {
  // Clean
  await prisma.review.deleteMany({});
  await prisma.offer.deleteMany({});
  await prisma.orderItem.deleteMany({});
  await prisma.order.deleteMany({});
  await prisma.productVariant.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.subscription.deleteMany({});
  await prisma.store.deleteMany({});
  await prisma.address.deleteMany({});
  await prisma.notification.deleteMany({});
  await prisma.userRole.deleteMany({});
  await prisma.user.deleteMany({ where: { phone: { startsWith: '+91NEW' } } });
  await prisma.address.deleteMany({});
  await prisma.user.deleteMany({ where: { phone: { startsWith: '+91NEW' } } });

  const cat = await prisma.category.findFirst({ where: { slug: 'grocery' } });
  categoryId = cat.id;

  // Register user
  const reg = await request(app).post('/api/v1/auth/register').send({
    name: 'Vendor Test', phone: '+91NEW001', password: 'Test@1234',
  });
  token = reg.body.accessToken;
  userId = reg.body.user.id;
  cleanupPolicyAcceptances = await acceptCurrentOrderPolicies(prisma, userId);

  // Create store and activate it
  const storeRes = await request(app).post('/api/v1/stores')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'New Test Store', categoryId, address: '789 Lane', city: 'Mumbai', state: 'Maharashtra', pincode: '400001', latitude: 19.076, longitude: 72.877 });
  storeId = storeRes.body.store.id;
  await prisma.store.update({ where: { id: storeId }, data: { status: 'ACTIVE' } });

  // Create product
  const prodRes = await request(app).post('/api/v1/products')
    .set('Authorization', `Bearer ${token}`)
    .send({ storeId, name: 'Test Rice 5kg', categoryId, mrp: 300, sellingPrice: 280, stockQuantity: 50 });
  productId = prodRes.body.product.id;

  // Create address
  await request(app).post('/api/v1/users/addresses')
    .set('Authorization', `Bearer ${token}`)
    .send({ fullAddress: '789 Test', city: 'Mumbai', pincode: '400001', latitude: 19.076, longitude: 72.877 });
});

afterAll(async () => {
  if (cleanupPolicyAcceptances) await cleanupPolicyAcceptances();
  await prisma.review.deleteMany({});
  await prisma.offer.deleteMany({});
  await prisma.orderItem.deleteMany({});
  await prisma.order.deleteMany({});
  await prisma.productVariant.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.subscription.deleteMany({});
  await prisma.store.deleteMany({});
  await prisma.address.deleteMany({});
  await prisma.notification.deleteMany({});
  await prisma.user.deleteMany({ where: { phone: { startsWith: '+91NEW' } } });
  await prisma.$disconnect();
});

// ═══════════════════════════════════════════════════════════
// VENDOR MODULE
// ═══════════════════════════════════════════════════════════

describe('Vendor API', () => {
  test('GET /api/v1/vendor/my-store - should return vendor store', async () => {
    const res = await request(app).get('/api/v1/vendor/my-store').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.store.name).toBe('New Test Store');
  });

  test('GET /api/v1/vendor/orders - should return store orders', async () => {
    const res = await request(app).get('/api/v1/vendor/orders').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.orders).toBeDefined();
  });

  test('POST /api/v1/vendor/customers/add - should add customer', async () => {
    const res = await request(app).post('/api/v1/vendor/customers/add')
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '+91NEW999', name: 'New Customer' });

    expect(res.status).toBe(201);
    expect(res.body.tempPassword).toBeUndefined();
    expect(res.text).not.toMatch(/password/i);
    expect(res.body.message).toMatch(/phone OTP/i);
    expect(res.body.customer).toBeUndefined();
    expect(res.text).not.toContain('+91NEW999');
  });

  test('POST /api/v1/vendor/customers/add - existing user returns 200', async () => {
    const res = await request(app).post('/api/v1/vendor/customers/add')
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '+91NEW001' });

    expect(res.status).toBe(200);
    expect(res.body.message).toContain('already registered');
  });

  test('GET /api/v1/vendor/analytics - should return analytics', async () => {
    const res = await request(app).get('/api/v1/vendor/analytics').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.analytics.totalProducts).toBeGreaterThan(0);
  });

  test('POST /api/v1/orders rejects missing current policy acceptance', async () => {
    await prisma.policyAcceptance.deleteMany({ where: { userId } });
    const address = await prisma.address.findFirst({ where: { userId } });
    const response = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        storeId,
        items: [{ productId, quantity: 1 }],
        addressId: address.id,
        paymentMethod: 'COD',
      });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('POLICY_ACCEPTANCE_REQUIRED');

    const policies = await prisma.policyVersion.findMany({
      where: { isCurrent: true, policyType: { in: ['TOS', 'PRIVACY'] } },
      select: { policyType: true, version: true },
    });
    await prisma.policyAcceptance.createMany({
      data: policies.map((policy) => ({ userId, ...policy })),
    });
  });

  test('Vendor order accept/reject flow', async () => {
    // Place order
    const addr = await prisma.address.findFirst({ where: { userId } });
    const orderRes = await request(app).post('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ storeId, items: [{ productId, quantity: 1 }], addressId: addr.id, paymentMethod: 'COD' });
    expect(orderRes.status).toBe(201);
    orderId = orderRes.body.order.id;

    // Accept
    const accept = await request(app).patch(`/api/v1/vendor/orders/${orderId}/accept`)
      .set('Authorization', `Bearer ${token}`);
    expect(accept.status).toBe(200);
    expect(accept.body.order.status).toBe('ACCEPTED');

    // Mark ready
    const ready = await request(app).patch(`/api/v1/vendor/orders/${orderId}/ready`)
      .set('Authorization', `Bearer ${token}`);
    expect(ready.status).toBe(200);
    expect(ready.body.order.status).toBe('READY');
  });
});

// ═══════════════════════════════════════════════════════════
// OFFERS MODULE
// ═══════════════════════════════════════════════════════════

describe('Offers API', () => {
  let offerId;

  test('POST /api/v1/offers - should create offer', async () => {
    const res = await request(app).post('/api/v1/offers')
      .set('Authorization', `Bearer ${token}`)
      .send({
        storeId,
        title: '10% off all items',
        discountType: 'percentage',
        discountValue: 10,
        validFrom: new Date().toISOString(),
        validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        code: 'TEST10',
        minOrderValue: 100,
      });

    expect(res.status).toBe(201);
    expect(res.body.offer.title).toBe('10% off all items');
    offerId = res.body.offer.id;
  });

  test('GET /api/v1/offers?storeId - should list offers', async () => {
    const res = await request(app).get(`/api/v1/offers?storeId=${storeId}`);
    expect(res.status).toBe(200);
    expect(res.body.offers.length).toBeGreaterThan(0);
  });

  test('PUT /api/v1/offers/:id - should update offer', async () => {
    const res = await request(app).put(`/api/v1/offers/${offerId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Updated: 10% off' });
    expect(res.status).toBe(200);
  });

  test('DELETE /api/v1/offers/:id - should deactivate offer', async () => {
    const res = await request(app).delete(`/api/v1/offers/${offerId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════
// REVIEWS MODULE
// ═══════════════════════════════════════════════════════════

describe('Reviews API', () => {
  test('POST /api/v1/reviews - should submit review for delivered order', async () => {
    // Mark order as delivered first
    await prisma.order.update({ where: { id: orderId }, data: { status: 'DELIVERED', deliveredAt: new Date() } });

    const res = await request(app).post('/api/v1/reviews')
      .set('Authorization', `Bearer ${token}`)
      .send({ orderId, storeId, rating: 5, text: 'Great service!' });

    expect(res.status).toBe(201);
    expect(res.body.review.rating).toBe(5);
  });

  test('POST /api/v1/reviews - should reject duplicate review', async () => {
    const res = await request(app).post('/api/v1/reviews')
      .set('Authorization', `Bearer ${token}`)
      .send({ orderId, storeId, rating: 4 });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('already reviewed');
  });

  test('GET /api/v1/reviews?storeId - should list reviews', async () => {
    const res = await request(app).get(`/api/v1/reviews?storeId=${storeId}`);
    expect(res.status).toBe(200);
    expect(res.body.reviews.length).toBeGreaterThan(0);
    expect(res.body.averageRating).toBe(5);
  });
});

// ═══════════════════════════════════════════════════════════
// SEARCH MODULE
// ═══════════════════════════════════════════════════════════

describe('Search API', () => {
  test('GET /api/v1/search?q=rice - should return results', async () => {
    const res = await request(app).get('/api/v1/search?q=rice');
    expect(res.status).toBe(200);
    expect(res.body.results).toBeDefined();
    expect(res.body.results.products.length).toBeGreaterThan(0);
  });

  test('GET /api/v1/search?q=a - should reject short query', async () => {
    const res = await request(app).get('/api/v1/search?q=a');
    expect(res.status).toBe(400);
  });

  test('GET /api/v1/search/autocomplete?q=ri - should return suggestions', async () => {
    const res = await request(app).get('/api/v1/search/autocomplete?q=ri');
    expect(res.status).toBe(200);
    expect(res.body.suggestions).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════
// UPLOAD MODULE
// ═══════════════════════════════════════════════════════════

describe('Upload API', () => {
  test('POST /api/v1/upload/image - should reject without file', async () => {
    const res = await request(app).post('/api/v1/upload/image')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  test('POST /api/v1/upload/image - should store an image in its public category', async () => {
    // Create a simple 1x1 red pixel PNG buffer
    const pngBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
      'base64'
    );

    const res = await request(app).post('/api/v1/upload/image?type=products')
      .set('Authorization', `Bearer ${token}`)
      .attach('image', pngBuffer, 'test.png');

    expect(res.status).toBe(200);
    expect(res.body.url).toMatch(/^\/uploads\/products\//);
    const uploadedPath = path.join(process.cwd(), res.body.url.replace(/^\//, ''));
    expect(fs.existsSync(uploadedPath)).toBe(true);
    fs.unlinkSync(uploadedPath);
  });
});
