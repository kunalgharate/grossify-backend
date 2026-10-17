jest.mock('../../src/shared/database', () => ({
  prisma: {
    $transaction: jest.fn(),
    store: { findUnique: jest.fn(), update: jest.fn(), findFirst: jest.fn() },
    kycDocument: { findMany: jest.fn(), updateMany: jest.fn(), findFirst: jest.fn() },
    user: { findUnique: jest.fn(), create: jest.fn() },
    userRole: { findMany: jest.fn() },
  },
}));

jest.mock('../../src/shared/middleware/auth', () => {
  const actual = jest.requireActual('../../src/shared/middleware/auth');
  return {
    ...actual,
    authenticate: (req, _res, next) => {
      req.user = { id: req.get('x-user-id') };
      next();
    },
  };
});

jest.mock('../../src/shared/middleware/auditLog', () => ({
  auditLog: () => (_req, _res, next) => next(),
}));

const express = require('express');
const request = require('supertest');
const { prisma } = require('../../src/shared/database');
const { errorHandler } = require('../../src/shared/middleware/errorHandler');
const vendorRoutes = require('../../src/modules/vendor/vendor.routes');
const adminRoutes = require('../../src/modules/admin/admin.routes');

const app = express();
app.use(express.json());
app.use('/api/v1/vendor', vendorRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use(errorHandler);

const storeRecord = {
  id: 'store-1',
  ownerId: 'vendor-1',
  name: 'Test Store',
  kycStatus: 'SUBMITTED',
  gstNumber: null,
  fssaiNumber: null,
  aadhaarNumber: null,
  aadhaarVerified: false,
  kycRejectionReason: null,
  kycVerifiedAt: null,
  status: 'PENDING',
};

describe('KYC access and customer account responses', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((operation) =>
      operation({ store: prisma.store, kycDocument: prisma.kycDocument }),
    );
    prisma.store.findUnique.mockResolvedValue(storeRecord);
    prisma.store.findFirst.mockResolvedValue(storeRecord);
    prisma.kycDocument.findMany.mockResolvedValue([{ id: 'doc-1', type: 'PAN', url: '/private/doc', status: 'SUBMITTED', createdAt: new Date() }]);
    prisma.kycDocument.findFirst.mockResolvedValue({ id: 'doc-1', url: 'private://kyc/test.jpg' });
    prisma.userRole.findMany.mockImplementation(async ({ where }) => {
      const roleByUser = { admin: 'Admin', manager: 'Manager', support: 'Support Agent' };
      const role = roleByUser[where.userId];
      return role ? [{ role: { name: role } }] : [];
    });
    prisma.kycDocument.updateMany.mockResolvedValue({ count: 1 });
    prisma.store.update.mockImplementation(async ({ data }) => ({ ...storeRecord, ...data }));
  });

  it('allows the owning vendor to read their store KYC', async () => {
    const response = await request(app)
      .get('/api/v1/vendor/stores/store-1/kyc')
      .set('x-user-id', 'vendor-1');

    expect(response.status).toBe(200);
    expect(response.body.store.id).toBe('store-1');
    expect(response.body.documents).toHaveLength(1);
  });

  it('denies an unrelated vendor access to store KYC', async () => {
    const response = await request(app)
      .get('/api/v1/vendor/stores/store-1/kyc')
      .set('x-user-id', 'vendor-2');

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('FORBIDDEN');
    expect(prisma.kycDocument.findMany).not.toHaveBeenCalled();
  });

  it('allows a manager reviewer and denies support staff KYC reads', async () => {
    const managerResponse = await request(app)
      .get('/api/v1/admin/stores/store-1/kyc')
      .set('x-user-id', 'manager');
    const supportResponse = await request(app)
      .get('/api/v1/admin/stores/store-1/kyc')
      .set('x-user-id', 'support');

    expect(managerResponse.status).toBe(200);
    expect(managerResponse.body.documents).toHaveLength(1);
    expect(supportResponse.status).toBe(403);
  });

  it('allows admin review approval and rejection, applying document statuses', async () => {
    const approved = await request(app)
      .post('/api/v1/admin/stores/store-1/kyc')
      .set('x-user-id', 'admin')
      .send({ approve: true });
    expect(approved.status).toBe(200);
    expect(approved.body.store.kycStatus).toBe('VERIFIED');
    expect(prisma.kycDocument.updateMany).toHaveBeenCalledWith({
      where: { storeId: 'store-1', status: 'SUBMITTED' },
      data: { status: 'VERIFIED' },
    });

    prisma.kycDocument.updateMany.mockClear();
    const rejected = await request(app)
      .post('/api/v1/admin/stores/store-1/kyc')
      .set('x-user-id', 'admin')
      .send({ approve: false, reason: 'Document is unclear' });
    expect(rejected.status).toBe(200);
    expect(rejected.body.store.kycStatus).toBe('REJECTED');
    expect(prisma.kycDocument.updateMany).toHaveBeenCalledWith({
      where: { storeId: 'store-1', status: 'SUBMITTED' },
      data: { status: 'REJECTED' },
    });
  });

  it('creates customer using existing phone OTP sign-in and serializes no credential', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({
      id: 'customer-1',
      name: 'New Customer',
      phone: '+919876543210',
    });

    const response = await request(app)
      .post('/api/v1/vendor/customers/add')
      .set('x-user-id', 'vendor-1')
      .send({ phone: '+919876543210', name: 'New Customer' });

    expect(response.status).toBe(201);
    expect(response.body.message).toMatch(/phone OTP/i);
    expect(response.text).not.toMatch(/password|credential|token|customer\s*:/i);
    expect(prisma.user.create.mock.calls[0][0].data).toEqual({
      phone: '+919876543210',
      name: 'New Customer',
      status: 'ACTIVE',
    });
  });
});
