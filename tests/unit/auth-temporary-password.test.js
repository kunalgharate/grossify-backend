jest.mock('../../src/shared/database', () => ({
  prisma: {
    user: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn(), create: jest.fn() },
    store: { findFirst: jest.fn() },
    deliveryAgent: { findUnique: jest.fn() },
    userRole: { findMany: jest.fn() },
    storeStaff: { findFirst: jest.fn() },
  },
}));

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn(() => 'signed-token'),
  verify: jest.fn(),
}));

jest.mock('../../src/modules/auth/msg91.service', () => ({
  verifyOtp: jest.fn(),
  verifyWidgetToken: jest.fn(),
}));

const { prisma } = require('../../src/shared/database');
const msg91 = require('../../src/modules/auth/msg91.service');
const auth = require('../../src/modules/auth/auth.service');

describe('temporary credential retirement', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.update.mockResolvedValue({});
    prisma.store.findFirst.mockResolvedValue(null);
    prisma.deliveryAgent.findUnique.mockResolvedValue(null);
    prisma.userRole.findMany.mockResolvedValue([]);
    prisma.storeStaff.findFirst.mockResolvedValue(null);
  });

  it('rejects a legacy temporary password for password login', async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: 'legacy-user',
      status: 'ACTIVE',
      passwordHash: 'legacy-hash',
      isTempPassword: true,
    });

    await expect(auth.login({ identifier: '+919876543210', password: 'legacy-temp' }))
      .rejects.toThrow('Invalid credentials');
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('retires a legacy temporary password after successful phone OTP verification', async () => {
    const legacyUser = {
      id: 'legacy-user',
      name: 'Legacy Customer',
      phone: '+919876543210',
      status: 'ACTIVE',
      passwordHash: 'legacy-hash',
      isTempPassword: true,
    };
    msg91.verifyOtp.mockResolvedValue({ success: true });
    prisma.user.findUnique.mockResolvedValue(legacyUser);

    const result = await auth.verifyOtp('+919876543210', '123456');

    expect(result.accessToken).toBe('signed-token');
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'legacy-user' },
      data: expect.objectContaining({ passwordHash: null, isTempPassword: false }),
    }));
  });
});
