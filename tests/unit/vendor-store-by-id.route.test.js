jest.mock('../../src/shared/database', () => ({
  prisma: {
    store: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock('../../src/shared/middleware/auth', () => ({
  authenticate: (req, res, next) => {
    req.user = { id: 'user-1' };
    next();
  },
  requireStaff: (req, res, next) => next(),
  requireRoles: () => (req, res, next) => next(),
}));

jest.mock('../../src/shared/middleware/auditLog', () => ({
  auditLog: () => (req, res, next) => next(),
}));

jest.mock('../../src/shared/middleware/cache', () => ({
  cacheMiddleware: () => (req, res, next) => next(),
  invalidateCache: jest.fn(),
}));

jest.mock('../../src/modules/vendor/staff.service', () => ({
  roleOnStore: jest.fn(),
  ORDER_OPERATIONS_ROLES: [],
  MANAGE_ROLES: [],
}));

jest.mock('../../src/modules/stores/kyc.service', () => ({}));
jest.mock('../../src/modules/stores/kyc-storage', () => ({
  upload: { single: () => (req, res, next) => next() },
}));

const express = require('express');
const request = require('supertest');
const { prisma } = require('../../src/shared/database');
const staffService = require('../../src/modules/vendor/staff.service');
const { errorHandler } = require('../../src/shared/middleware/errorHandler');
const vendorRoutes = require('../../src/modules/vendor/vendor.routes');

const app = express();
app.use(express.json());
app.use('/api/v1/vendor', vendorRoutes);
app.use(errorHandler);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/v1/vendor/stores/:id', () => {
  it('returns the requested store for its owner', async () => {
    staffService.roleOnStore.mockResolvedValue('OWNER');
    prisma.store.findUnique.mockResolvedValue({
      id: 'store-2',
      name: 'Second Store',
      gstScheme: 'REGULAR',
      gstNumber: '27ABCDE1234F1Z5',
      stateCode: 27,
    });

    const response = await request(app).get('/api/v1/vendor/stores/store-2');

    expect(response.status).toBe(200);
    expect(response.body.store.id).toBe('store-2');
    expect(staffService.roleOnStore).toHaveBeenCalledWith('user-1', 'store-2');
    expect(prisma.store.findUnique).toHaveBeenCalledWith({
      where: { id: 'store-2' },
      include: { category: true, subscription: { include: { plan: true } } },
    });
  });

  it('does not disclose a store to non-owners', async () => {
    staffService.roleOnStore.mockResolvedValue('MANAGER');

    const response = await request(app).get('/api/v1/vendor/stores/store-2');

    expect(response.status).toBe(404);
    expect(prisma.store.findUnique).not.toHaveBeenCalled();
  });
});
