const request = require('supertest');
const app = require('../../src/app');
const { prisma } = require('../../src/shared/database');
const { runSubscriptionCheck } = require('../../src/jobs/cron/subscriptionCheck');

let token, userId, ticketId;

beforeAll(async () => {
  await prisma.ticketMessage.deleteMany({});
  await prisma.ticket.deleteMany({});
  await prisma.notification.deleteMany({ where: { userId: { in: (await prisma.user.findMany({ where: { phone: { startsWith: '+91TK' } }, select: { id: true } })).map(u => u.id) } } });
  await prisma.subscription.deleteMany({ where: { store: { owner: { phone: { startsWith: '+91TK' } } } } });
  await prisma.store.deleteMany({ where: { owner: { phone: { startsWith: '+91TK' } } } });
  await prisma.user.deleteMany({ where: { phone: { startsWith: '+91TK' } } });

  const reg = await request(app).post('/api/v1/auth/register').send({ name: 'Ticket User', phone: '+91TK001', password: 'Test@1234' });
  token = reg.body.accessToken;
  userId = reg.body.user.id;
});

afterAll(async () => {
  const userIds = (await prisma.user.findMany({ where: { phone: { startsWith: '+91TK' } }, select: { id: true } })).map(u => u.id);
  await prisma.ticketMessage.deleteMany({ where: { ticket: { userId: { in: userIds } } } });
  await prisma.ticket.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.subscription.deleteMany({ where: { store: { ownerId: { in: userIds } } } });
  await prisma.store.deleteMany({ where: { ownerId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { phone: { startsWith: '+91TK' } } });
  await prisma.$disconnect();
});

describe('Tickets API', () => {
  test('POST /api/v1/tickets - should create ticket', async () => {
    const res = await request(app).post('/api/v1/tickets')
      .set('Authorization', `Bearer ${token}`)
      .send({ category: 'order', subject: 'Order not delivered', description: 'My order GRS-123 was not delivered after 2 hours.' });

    expect(res.status).toBe(201);
    expect(res.body.ticket.ticketNumber).toMatch(/^TKT-/);
    expect(res.body.ticket.priority).toBe('P1'); // auto-assigned for order category
    expect(res.body.ticket.status).toBe('open');
    ticketId = res.body.ticket.id;
  });

  test('POST /api/v1/tickets - payment ticket gets P0', async () => {
    const res = await request(app).post('/api/v1/tickets')
      .set('Authorization', `Bearer ${token}`)
      .send({ category: 'payment', subject: 'Payment deducted but order failed', description: 'Money deducted from UPI.' });

    expect(res.status).toBe(201);
    expect(res.body.ticket.priority).toBe('P0');
  });

  test('GET /api/v1/tickets - should list user tickets', async () => {
    const res = await request(app).get('/api/v1/tickets')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.tickets.length).toBe(2);
  });

  test('GET /api/v1/tickets/:id - should return ticket with messages', async () => {
    const res = await request(app).get(`/api/v1/tickets/${ticketId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.ticket.messages.length).toBe(1); // initial message
  });

  test('POST /api/v1/tickets/:id/reply - should add reply', async () => {
    const res = await request(app).post(`/api/v1/tickets/${ticketId}/reply`)
      .set('Authorization', `Bearer ${token}`)
      .send({ message: 'Please check order GRS-123, it has been 3 hours now.' });

    expect(res.status).toBe(201);
  });

  test('PATCH /api/v1/tickets/:id/assign - should assign ticket', async () => {
    const res = await request(app).patch(`/api/v1/tickets/${ticketId}/assign`)
      .set('Authorization', `Bearer ${token}`)
      .send({ assignedTo: userId });

    expect(res.status).toBe(200);
    expect(res.body.ticket.status).toBe('in_progress');
  });

  test('PATCH /api/v1/tickets/:id/escalate - should escalate', async () => {
    const res = await request(app).patch(`/api/v1/tickets/${ticketId}/escalate`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.ticket.priority).toBe('P0'); // P1 → P0
    expect(res.body.ticket.status).toBe('escalated');
  });

  test('PATCH /api/v1/tickets/:id/resolve - should resolve ticket', async () => {
    const res = await request(app).patch(`/api/v1/tickets/${ticketId}/resolve`)
      .set('Authorization', `Bearer ${token}`)
      .send({ resolution: 'Order was delivered to wrong address. Redelivery arranged.' });

    expect(res.status).toBe(200);
    expect(res.body.ticket.status).toBe('resolved');
  });
});

describe('Subscription Lifecycle Cron', () => {
  test('Should expire trials past trialEndsAt', async () => {
    const cat = await prisma.category.findFirst({ where: { slug: 'grocery' } });
    const plan = await prisma.plan.findFirst({ where: { categoryType: 'grocery' } });

    // Create store with expired trial
    const store = await prisma.store.create({
      data: {
        ownerId: userId, name: 'Cron Test Store', slug: 'cron-test-' + Date.now(),
        categoryId: cat.id, address: '1 Cron St', city: 'Test', state: 'Test', pincode: '000000',
        latitude: 0, longitude: 0, status: 'ACTIVE',
      },
    });

    await prisma.subscription.create({
      data: {
        storeId: store.id, planId: plan.id, status: 'TRIAL',
        currentPeriodStart: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
        currentPeriodEnd: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
        trialEndsAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // expired yesterday
      },
    });

    // Run cron
    const result = await runSubscriptionCheck();

    expect(result.trialExpired).toBeGreaterThanOrEqual(1);

    // Verify store is deactivated
    const updated = await prisma.store.findUnique({ where: { id: store.id } });
    expect(updated.status).toBe('DEACTIVATED');

    // Verify notification sent
    const notif = await prisma.notification.findFirst({
      where: { userId, title: 'Trial Expired' },
    });
    expect(notif).toBeTruthy();
  });
});
