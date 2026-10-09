jest.mock('../../src/shared/database', () => ({
  prisma: {
    store: { findUnique: jest.fn(), update: jest.fn() },
    kycDocument: { create: jest.fn(), updateMany: jest.fn(), findMany: jest.fn() },
  },
}));

const { prisma } = require('../../src/shared/database');
const kyc = require('../../src/modules/stores/kyc.service');

describe('kyc.service', () => {
  beforeEach(() => jest.clearAllMocks());

  it('submitDocument validates type and moves store to SUBMITTED', async () => {
    prisma.store.findUnique.mockResolvedValue({ id: 's1', ownerId: 'u1' });
    prisma.kycDocument.create.mockResolvedValue({ id: 'd1', type: 'AADHAAR' });
    prisma.store.update.mockResolvedValue({});
    const doc = await kyc.submitDocument('u1', 's1', { type: 'AADHAAR', url: 'http://x/a.jpg', aadhaarNumber: '1234' });
    expect(doc.type).toBe('AADHAAR');
    const upd = prisma.store.update.mock.calls[0][0];
    expect(upd.data.kycStatus).toBe('SUBMITTED');
    expect(upd.data.aadhaarNumber).toBe('1234');
  });

  it('submitDocument rejects an invalid type', async () => {
    prisma.store.findUnique.mockResolvedValue({ id: 's1', ownerId: 'u1' });
    await expect(kyc.submitDocument('u1', 's1', { type: 'FOO', url: 'x' })).rejects.toThrow(/Invalid document type/);
  });

  it("submitDocument forbids a non-owner", async () => {
    prisma.store.findUnique.mockResolvedValue({ id: 's1', ownerId: 'other' });
    await expect(kyc.submitDocument('u1', 's1', { type: 'PAN', url: 'x' })).rejects.toThrow(/Not your store/);
  });

  it('reviewKyc approve → VERIFIED + verifies docs', async () => {
    prisma.store.findUnique.mockResolvedValue({ id: 's1' });
    prisma.kycDocument.updateMany.mockResolvedValue({});
    prisma.store.update.mockImplementation(({ data }) => Promise.resolve({ id: 's1', ...data }));
    const s = await kyc.reviewKyc('s1', { approve: true });
    expect(s.kycStatus).toBe('VERIFIED');
    expect(s.aadhaarVerified).toBe(true);
    expect(prisma.kycDocument.updateMany).toHaveBeenCalled();
  });

  it('reviewKyc reject requires a reason and sets REJECTED', async () => {
    prisma.store.findUnique.mockResolvedValue({ id: 's1' });
    await expect(kyc.reviewKyc('s1', { approve: false })).rejects.toThrow(/reason is required/);
    prisma.store.update.mockImplementation(({ data }) => Promise.resolve({ id: 's1', ...data }));
    const s = await kyc.reviewKyc('s1', { approve: false, reason: 'blurry aadhaar' });
    expect(s.kycStatus).toBe('REJECTED');
    expect(s.kycRejectionReason).toBe('blurry aadhaar');
  });
});
