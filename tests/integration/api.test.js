const request = require('supertest');
const app = require('../../src/app');
const { prisma } = require('../../src/shared/database');

let token;
let userId;
let storeId;
let productId;
let orderId;
let categoryId;

beforeAll(async () => {
  // Clean test data
  await prisma.orderItem.deleteMany({});
  await prisma.order.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.subscription.deleteMany({});
  await prisma.store.deleteMany({});
  await prisma.address.deleteMany({});
  await prisma.notification.deleteMany({});
  await prisma.userRole.deleteMany({});
  await prisma.user.deleteMany({ where: { phone: { startsWith: '+91TEST' } } });

  // Get a category
  const cat = await prisma.category.findFirst({ where: { slug: 'grocery' } });
  categoryId = cat.id;
});

afterAll(async () => {
  // Cleanup
  await prisma.orderItem.deleteMany({});
  await prisma.order.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.subscription.deleteMany({});
  await prisma.store.deleteMany({});
  await prisma.address.deleteMany({});
  await prisma.notification.deleteMany({});
  await prisma.userRole.deleteMany({});
  await prisma.user.deleteMany({ where: { phone: { startsWith: '+91TEST' } } });
  await prisma.$disconnect();
});

// ═══════════════════════════════════════════════════════════
// AUTH MODULE
// ═══════════════════════════════════════════════════════════

describe('Auth API', () => {
  test('POST /api/v1/auth/register - should register a new user', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      name: 'Test User',
      email: 'test@grossify.in',
      phone: '+91TEST001',
      password: 'Test@1234',
    });

    expect(res.status).toBe(201);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.name).toBe('Test User');
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    token = res.body.accessToken;
    userId = res.body.user.id;
  });

  test('POST /api/v1/auth/register - should reject duplicate phone', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      name: 'Duplicate',
      phone: '+91TEST001',
      password: 'Test@1234',
    });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('CONFLICT');
  });

  test('POST /api/v1/auth/login - should login with valid credentials', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({
      identifier: '+91TEST001',
      password: 'Test@1234',
    });

    expect(res.status).toBe(200);
    expect(res.body.user.phone).toBe('+91TEST001');
    expect(res.body.accessToken).toBeDefined();
    token = res.body.accessToken;
  });

  test('POST /api/v1/auth/login - should reject wrong password', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({
      identifier: '+91TEST001',
      password: 'WrongPass',
    });

    expect(res.status).toBe(401);
  });

  test('POST /api/v1/auth/refresh-token - should refresh token', async () => {
    const loginRes = await request(app).post('/api/v1/auth/login').send({
      identifier: '+91TEST001',
      password: 'Test@1234',
    });

    const res = await request(app).post('/api/v1/auth/refresh-token').send({
      refreshToken: loginRes.body.refreshToken,
    });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════
// USERS MODULE
// ═══════════════════════════════════════════════════════════

describe('Users API', () => {
  test('GET /api/v1/users/profile - should return user profile', async () => {
    const res = await request(app)
      .get('/api/v1/users/profile')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe('Test User');
  });

  test('PUT /api/v1/users/profile - should update profile', async () => {
    const res = await request(app)
      .put('/api/v1/users/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Updated Name' });

    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe('Updated Name');
  });

  test('POST /api/v1/users/addresses - should add address', async () => {
    const res = await request(app)
      .post('/api/v1/users/addresses')
      .set('Authorization', `Bearer ${token}`)
      .send({
        label: 'Home',
        fullAddress: '123 Test Road, Pune',
        city: 'Pune',
        pincode: '411001',
        latitude: 18.5204,
        longitude: 73.8567,
      });

    expect(res.status).toBe(201);
    expect(res.body.address.city).toBe('Pune');
  });

  test('GET /api/v1/users/addresses - should list addresses', async () => {
    const res = await request(app)
      .get('/api/v1/users/addresses')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.addresses.length).toBeGreaterThan(0);
  });

  test('GET /api/v1/users/profile - should reject without token', async () => {
    const res = await request(app).get('/api/v1/users/profile');
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════
// CATEGORIES MODULE
// ═══════════════════════════════════════════════════════════

describe('Categories API', () => {
  test('GET /api/v1/categories - should return categories', async () => {
    const res = await request(app).get('/api/v1/categories');

    expect(res.status).toBe(200);
    expect(res.body.categories.length).toBeGreaterThan(0);
  });

  test('GET /api/v1/categories?flat=true - should return flat list', async () => {
    const res = await request(app).get('/api/v1/categories?flat=true');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.categories)).toBe(true);
  });

  test('GET /api/v1/categories/grocery - should return single category', async () => {
    const res = await request(app).get('/api/v1/categories/grocery');

    expect(res.status).toBe(200);
    expect(res.body.category.slug).toBe('grocery');
    expect(res.body.category.radius).toBe(3000);
  });
});

// ═══════════════════════════════════════════════════════════
// STORES MODULE
// ═══════════════════════════════════════════════════════════

describe('Stores API', () => {
  test('POST /api/v1/stores - should create store (pending)', async () => {
    const res = await request(app)
      .post('/api/v1/stores')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Test Mart',
        categoryId,
        address: '456 Test Lane',
        city: 'Pune',
        state: 'Maharashtra',
        pincode: '411002',
        latitude: 18.5304,
        longitude: 73.8667,
      });

    expect(res.status).toBe(201);
    expect(res.body.store.status).toBe('PENDING');
    storeId = res.body.store.id;
  });

  test('GET /api/v1/stores/:id - should return store', async () => {
    const res = await request(app).get(`/api/v1/stores/${storeId}`);

    expect(res.status).toBe(200);
    expect(res.body.store.name).toBe('Test Mart');
  });

  test('PUT /api/v1/stores/:id - should update own store', async () => {
    const res = await request(app)
      .put(`/api/v1/stores/${storeId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ description: 'Updated description' });

    expect(res.status).toBe(200);
    expect(res.body.store.description).toBe('Updated description');
  });

  test('GET /api/v1/stores/nearby - should search nearby stores', async () => {
    // Activate store first
    await prisma.store.update({ where: { id: storeId }, data: { status: 'ACTIVE' } });

    const res = await request(app)
      .get('/api/v1/stores/nearby?lat=18.5304&lng=73.8667&radius=5000');

    expect(res.status).toBe(200);
    expect(res.body.stores).toBeDefined();
    expect(res.body.pagination).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════
// PRODUCTS MODULE
// ═══════════════════════════════════════════════════════════

describe('Products API', () => {
  test('POST /api/v1/products - should create product', async () => {
    const res = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        storeId,
        name: 'Test Product 1kg',
        categoryId,
        mrp: 50,
        sellingPrice: 45,
        stockQuantity: 100,
        unit: 'piece',
      });

    expect(res.status).toBe(201);
    expect(res.body.product.name).toBe('Test Product 1kg');
    expect(res.body.product.stockQuantity).toBe(100);
    productId = res.body.product.id;
  });

  test('GET /api/v1/products - should list products', async () => {
    const res = await request(app).get(`/api/v1/products?storeId=${storeId}`);

    expect(res.status).toBe(200);
    expect(res.body.products.length).toBe(1);
  });

  test('GET /api/v1/products/:id - should get product details', async () => {
    const res = await request(app).get(`/api/v1/products/${productId}`);

    expect(res.status).toBe(200);
    expect(res.body.product.id).toBe(productId);
    expect(res.body.product.store).toBeDefined();
  });

  test('PUT /api/v1/products/:id - should update product', async () => {
    const res = await request(app)
      .put(`/api/v1/products/${productId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ sellingPrice: 42, stockQuantity: 80 });

    expect(res.status).toBe(200);
    expect(parseFloat(res.body.product.sellingPrice)).toBe(42);
  });
});

// ═══════════════════════════════════════════════════════════
// ORDERS MODULE
// ═══════════════════════════════════════════════════════════

describe('Orders API', () => {
  let addressId;

  beforeAll(async () => {
    const addr = await prisma.address.findFirst({ where: { userId } });
    addressId = addr.id;
  });

  test('POST /api/v1/orders - should place order', async () => {
    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        storeId,
        items: [{ productId, quantity: 2 }],
        addressId,
        paymentMethod: 'COD',
      });

    expect(res.status).toBe(201);
    expect(res.body.order.status).toBe('PLACED');
    expect(res.body.order.items.length).toBe(1);
    orderId = res.body.order.id;

    // Verify stock was deducted
    const product = await prisma.product.findUnique({ where: { id: productId } });
    expect(product.stockQuantity).toBe(78); // 80 - 2
  });

  test('GET /api/v1/orders - should list orders', async () => {
    const res = await request(app)
      .get('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.orders.length).toBeGreaterThan(0);
  });

  test('GET /api/v1/orders/:id - should get order details', async () => {
    const res = await request(app)
      .get(`/api/v1/orders/${orderId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.order.orderNumber).toMatch(/^GRS-/);
  });

  test('PATCH /api/v1/orders/:id/status - should update status', async () => {
    // Place a new order for status testing
    const newOrder = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        storeId,
        items: [{ productId, quantity: 1 }],
        addressId,
        paymentMethod: 'COD',
      });

    // If order placement fails (e.g., stock issue), skip
    if (newOrder.status !== 201) {
      console.log('Order place failed:', newOrder.body);
      // Restock and retry
      await prisma.product.update({ where: { id: productId }, data: { stockQuantity: 100 } });
      const retry = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({ storeId, items: [{ productId, quantity: 1 }], addressId, paymentMethod: 'COD' });
      expect(retry.status).toBe(201);
      const testOrderId = retry.body.order.id;
      const res = await request(app)
        .patch(`/api/v1/orders/${testOrderId}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'ACCEPTED' });
      expect(res.status).toBe(200);
      return;
    }

    const testOrderId = newOrder.body.order.id;

    const res = await request(app)
      .patch(`/api/v1/orders/${testOrderId}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'ACCEPTED' });

    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('ACCEPTED');
  });

  test('POST /api/v1/orders/:id/cancel - should cancel a placed order', async () => {
    // Ensure stock is available
    await prisma.product.update({ where: { id: productId }, data: { stockQuantity: 100 } });

    const newOrder = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        storeId,
        items: [{ productId, quantity: 1 }],
        addressId,
        paymentMethod: 'COD',
      });

    expect(newOrder.status).toBe(201);

    const res = await request(app)
      .post(`/api/v1/orders/${newOrder.body.order.id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Changed my mind' });

    expect(res.status).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════
// SUBSCRIPTIONS MODULE
// ═══════════════════════════════════════════════════════════

describe('Subscriptions API', () => {
  test('GET /api/v1/subscriptions/plans - should return plans', async () => {
    const res = await request(app).get('/api/v1/subscriptions/plans');

    expect(res.status).toBe(200);
    expect(res.body.plans.length).toBeGreaterThan(0);
  });

  test('GET /api/v1/subscriptions/plans?categoryType=grocery - should filter', async () => {
    const res = await request(app).get('/api/v1/subscriptions/plans?categoryType=grocery');

    expect(res.status).toBe(200);
    expect(res.body.plans.length).toBe(3);
    expect(res.body.plans[0].categoryType).toBe('grocery');
  });

  test('POST /api/v1/subscriptions - should create trial subscription', async () => {
    const plan = await prisma.plan.findFirst({ where: { categoryType: 'grocery', name: 'Starter' } });

    const res = await request(app)
      .post('/api/v1/subscriptions')
      .set('Authorization', `Bearer ${token}`)
      .send({ planId: plan.id, storeId });

    expect(res.status).toBe(201);
    expect(res.body.subscription.status).toBe('TRIAL');
  });

  test('GET /api/v1/subscriptions/current - should return current sub', async () => {
    const res = await request(app)
      .get('/api/v1/subscriptions/current')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.subscription).toBeDefined();
    expect(res.body.subscription.plan).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════
// ADMIN MODULE
// ═══════════════════════════════════════════════════════════

describe('Admin API', () => {
  test('GET /api/v1/admin/dashboard - should return metrics', async () => {
    const res = await request(app)
      .get('/api/v1/admin/dashboard')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.metrics).toBeDefined();
    expect(res.body.metrics.totalUsers).toBeGreaterThan(0);
  });

  test('GET /api/v1/admin/stores - should list stores', async () => {
    const res = await request(app)
      .get('/api/v1/admin/stores')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.stores).toBeDefined();
    expect(res.body.pagination).toBeDefined();
  });

  test('GET /api/v1/admin/stores?status=ACTIVE - should filter stores', async () => {
    const res = await request(app)
      .get('/api/v1/admin/stores?status=ACTIVE')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    res.body.stores.forEach(s => expect(s.status).toBe('ACTIVE'));
  });

  test('GET /api/v1/admin/users - should list users', async () => {
    const res = await request(app)
      .get('/api/v1/admin/users')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.users.length).toBeGreaterThan(0);
  });

  test('GET /api/v1/admin/roles - should list roles', async () => {
    const res = await request(app)
      .get('/api/v1/admin/roles')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.roles.length).toBeGreaterThanOrEqual(4);
  });

  test('GET /api/v1/admin/permissions - should list permissions', async () => {
    const res = await request(app)
      .get('/api/v1/admin/permissions')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.permissions.length).toBeGreaterThan(40);
  });

  test('POST /api/v1/admin/users/:id/roles - should assign role', async () => {
    const role = await prisma.role.findFirst({ where: { name: 'Admin' } });

    const res = await request(app)
      .post(`/api/v1/admin/users/${userId}/roles`)
      .set('Authorization', `Bearer ${token}`)
      .send({ roleId: role.id });

    expect(res.status).toBe(200);
    expect(res.body.message).toContain('Admin');
  });
});

// ═══════════════════════════════════════════════════════════
// NOTIFICATIONS MODULE
// ═══════════════════════════════════════════════════════════

describe('Notifications API', () => {
  let notificationId;

  beforeAll(async () => {
    // Create a test notification
    const notif = await prisma.notification.create({
      data: { userId, title: 'Test', body: 'Test notification', type: 'system' },
    });
    notificationId = notif.id;
  });

  test('GET /api/v1/notifications - should return notifications', async () => {
    const res = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.notifications.length).toBeGreaterThan(0);
    expect(res.body.unreadCount).toBeGreaterThan(0);
  });

  test('PATCH /api/v1/notifications/:id/read - should mark as read', async () => {
    const res = await request(app)
      .patch(`/api/v1/notifications/${notificationId}/read`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════
// ANALYTICS MODULE
// ═══════════════════════════════════════════════════════════

describe('Analytics API', () => {
  test('GET /api/v1/analytics/platform - should return platform metrics', async () => {
    const res = await request(app)
      .get('/api/v1/analytics/platform')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.metrics.users).toBeGreaterThan(0);
    expect(res.body.metrics.stores).toBeDefined();
  });

  test('GET /api/v1/analytics/store/:storeId - should return store metrics', async () => {
    const res = await request(app)
      .get(`/api/v1/analytics/store/${storeId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.analytics).toBeDefined();
    expect(res.body.analytics.totalProducts).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════
// PAYMENTS MODULE (Scaffold - no Razorpay keys)
// ═══════════════════════════════════════════════════════════

describe('Payments API', () => {
  test('POST /api/v1/payments/verify - should reject incomplete data', async () => {
    const res = await request(app)
      .post('/api/v1/payments/verify')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
  });

  test('POST /api/v1/payments/webhook - should accept webhook', async () => {
    const res = await request(app)
      .post('/api/v1/payments/webhook')
      .send({ event: 'payment.captured' });

    expect(res.status).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════════════════

describe('Health', () => {
  test('GET /health - should return ok', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('Grossify');
  });

  test('GET /unknown - should return 404', async () => {
    const res = await request(app).get('/unknown-route');
    expect(res.status).toBe(404);
  });
});
