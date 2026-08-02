const request = require('supertest');
const app = require('../../src/app');
const { prisma } = require('../../src/shared/database');

let vendorToken, customerToken, agentToken;
let storeId, productId, orderId, categoryId;

beforeAll(async () => {
  await prisma.review.deleteMany({});
  await prisma.offer.deleteMany({});
  await prisma.orderItem.deleteMany({});
  await prisma.order.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.subscription.deleteMany({});
  await prisma.store.deleteMany({});
  await prisma.address.deleteMany({});
  await prisma.auditLog.deleteMany({});
  await prisma.notification.deleteMany({});
  await prisma.user.deleteMany({ where: { phone: { startsWith: '+91FLOW' } } });

  const cat = await prisma.category.findFirst({ where: { slug: 'grocery' } });
  categoryId = cat.id;

  // Create vendor
  const vendor = await request(app).post('/api/v1/auth/register').send({ name: 'Flow Vendor', phone: '+91FLOW001', password: 'Test@1234' });
  vendorToken = vendor.body.accessToken;

  // Create customer
  const customer = await request(app).post('/api/v1/auth/register').send({ name: 'Flow Customer', phone: '+91FLOW002', password: 'Test@1234' });
  customerToken = customer.body.accessToken;

  // Create delivery agent
  const agent = await request(app).post('/api/v1/auth/register').send({ name: 'Flow Agent', phone: '+91FLOW003', password: 'Test@1234' });
  agentToken = agent.body.accessToken;

  // Vendor creates store
  const storeRes = await request(app).post('/api/v1/stores')
    .set('Authorization', `Bearer ${vendorToken}`)
    .send({ name: 'Flow Grocery', categoryId, address: '1 Flow St', city: 'Pune', state: 'Maharashtra', pincode: '411001', latitude: 18.52, longitude: 73.85 });
  storeId = storeRes.body.store.id;
  await prisma.store.update({ where: { id: storeId }, data: { status: 'ACTIVE' } });

  // Add product
  const prodRes = await request(app).post('/api/v1/products')
    .set('Authorization', `Bearer ${vendorToken}`)
    .send({ storeId, name: 'Flow Atta 5kg', categoryId, mrp: 250, sellingPrice: 230, stockQuantity: 50 });
  productId = prodRes.body.product.id;

  // Customer adds address
  await request(app).post('/api/v1/users/addresses')
    .set('Authorization', `Bearer ${customerToken}`)
    .send({ fullAddress: '99 Customer Lane', city: 'Pune', pincode: '411001', latitude: 18.53, longitude: 73.86 });
});

afterAll(async () => {
  await prisma.review.deleteMany({});
  await prisma.offer.deleteMany({});
  await prisma.orderItem.deleteMany({});
  await prisma.order.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.subscription.deleteMany({});
  await prisma.store.deleteMany({});
  await prisma.address.deleteMany({});
  await prisma.auditLog.deleteMany({});
  await prisma.notification.deleteMany({});
  await prisma.user.deleteMany({ where: { phone: { startsWith: '+91FLOW' } } });
  await prisma.$disconnect();
});

describe('Full Order Lifecycle (Customer → Vendor → Delivery)', () => {
  test('1. Customer places order', async () => {
    const addr = await prisma.address.findFirst({ where: { user: { phone: '+91FLOW002' } } });
    const res = await request(app).post('/api/v1/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ storeId, items: [{ productId, quantity: 3 }], addressId: addr.id, paymentMethod: 'COD' });

    expect(res.status).toBe(201);
    expect(res.body.order.status).toBe('PLACED');
    orderId = res.body.order.id;
  });

  test('2. Vendor sees order in their panel', async () => {
    const res = await request(app).get('/api/v1/vendor/orders')
      .set('Authorization', `Bearer ${vendorToken}`);

    expect(res.status).toBe(200);
    expect(res.body.orders.some(o => o.id === orderId)).toBe(true);
  });

  test('3. Vendor accepts order', async () => {
    const res = await request(app).patch(`/api/v1/vendor/orders/${orderId}/accept`)
      .set('Authorization', `Bearer ${vendorToken}`);

    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('ACCEPTED');
  });

  test('4. Vendor marks order ready', async () => {
    const res = await request(app).patch(`/api/v1/vendor/orders/${orderId}/ready`)
      .set('Authorization', `Bearer ${vendorToken}`);

    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('READY');
  });

  test('5. Delivery agent sees available orders', async () => {
    const res = await request(app).get('/api/v1/delivery/available')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.orders.some(o => o.id === orderId)).toBe(true);
  });

  test('6. Delivery agent picks up order', async () => {
    const res = await request(app).post(`/api/v1/delivery/${orderId}/accept`)
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('PICKED');
  });

  test('7. Delivery agent delivers order', async () => {
    const res = await request(app).post(`/api/v1/delivery/${orderId}/delivered`)
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('DELIVERED');
  });

  test('8. Customer receives delivery notification', async () => {
    const res = await request(app).get('/api/v1/notifications')
      .set('Authorization', `Bearer ${customerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.notifications.some(n => n.title === 'Order Delivered!')).toBe(true);
  });

  test('9. Customer leaves a review', async () => {
    const res = await request(app).post('/api/v1/reviews')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ orderId, storeId, rating: 4, text: 'Quick delivery!' });

    expect(res.status).toBe(201);
    expect(res.body.review.rating).toBe(4);
  });

  test('10. Delivery agent checks earnings', async () => {
    const res = await request(app).get('/api/v1/delivery/earnings')
      .set('Authorization', `Bearer ${agentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.earnings.totalDeliveries).toBe(1);
    expect(res.body.earnings.total).toBeGreaterThan(0);
  });
});

describe('Vendor Store Management', () => {
  test('Toggle store open/close', async () => {
    const close = await request(app).patch('/api/v1/vendor/toggle-open')
      .set('Authorization', `Bearer ${vendorToken}`)
      .send({ isOpen: false });

    expect(close.status).toBe(200);
    expect(close.body.isOpen).toBe(false);

    const open = await request(app).patch('/api/v1/vendor/toggle-open')
      .set('Authorization', `Bearer ${vendorToken}`)
      .send({ isOpen: true });

    expect(open.status).toBe(200);
    expect(open.body.isOpen).toBe(true);
  });

  test('Set business hours', async () => {
    const res = await request(app).put('/api/v1/vendor/business-hours')
      .set('Authorization', `Bearer ${vendorToken}`)
      .send({
        mon: { open: '09:00', close: '21:00' },
        tue: { open: '09:00', close: '21:00' },
        wed: { open: '09:00', close: '21:00' },
        thu: { open: '09:00', close: '21:00' },
        fri: { open: '09:00', close: '21:00' },
        sat: { open: '10:00', close: '20:00' },
        sun: null,
      });

    expect(res.status).toBe(200);
    expect(res.body.businessHours.mon.open).toBe('09:00');
    expect(res.body.businessHours.sun).toBeNull();
  });

  test('List vendor products', async () => {
    const res = await request(app).get('/api/v1/vendor/products')
      .set('Authorization', `Bearer ${vendorToken}`);

    expect(res.status).toBe(200);
    expect(res.body.products.length).toBeGreaterThan(0);
  });
});

describe('Admin Audit Logs', () => {
  test('GET /api/v1/admin/audit-logs', async () => {
    // Create an audit log entry
    await prisma.auditLog.create({
      data: {
        userId: (await prisma.user.findFirst({ where: { phone: '+91FLOW001' } })).id,
        action: 'stores.approve',
        resourceType: 'store',
        resourceId: storeId,
        details: { test: true },
      },
    });

    const res = await request(app).get('/api/v1/admin/audit-logs')
      .set('Authorization', `Bearer ${vendorToken}`);

    expect(res.status).toBe(200);
    expect(res.body.logs.length).toBeGreaterThan(0);
  });
});

describe('Payment History', () => {
  test('GET /api/v1/payments/history - should return empty for new user', async () => {
    const res = await request(app).get('/api/v1/payments/history')
      .set('Authorization', `Bearer ${customerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.payments).toBeDefined();
  });
});
