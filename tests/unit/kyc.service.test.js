jest.mock('../../src/shared/database', () => ({
  prisma: {
    $transaction: jest.fn(),
    store: { findUnique: jest.fn(), update: jest.fn() },
    kycDocument: { create: jest.fn(), updateMany: jest.fn(), findMany: jest.fn(), findFirst: jest.fn() },
  },
}));

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { prisma } = require('../../src/shared/database');
const kyc = require('../../src/modules/stores/kyc.service');
let temporaryFiles = [];

describe('kyc.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    temporaryFiles = [];
    prisma.$transaction.mockImplementation(async (operation) => {
      if (typeof operation === 'function') {
        return operation({ store: prisma.store, kycDocument: prisma.kycDocument });
      }
      const [doc] = await Promise.all([operation[0]]);
      return [await doc];
    });
  });

  afterEach(() => {
    for (const filePath of temporaryFiles) {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
  });

  it('submitDocument validates type and moves store to SUBMITTED', async () => {
    const filePath = '/tmp/kyc-unit-submit.jpg';
    fs.writeFileSync(filePath, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]));
    temporaryFiles.push(filePath);
    prisma.store.findUnique.mockResolvedValue({ id: 's1', ownerId: 'u1' });
    prisma.kycDocument.create.mockResolvedValue({ id: 'd1', type: 'AADHAAR', url: 'private://kyc/abc.jpg', status: 'SUBMITTED' });
    prisma.store.update.mockResolvedValue({});
    const doc = await kyc.submitDocument('u1', 's1', {
      type: 'AADHAAR',
      aadhaarNumber: '1234',
      file: { filename: 'abc.jpg', path: filePath },
    });
    expect(doc.type).toBe('AADHAAR');
    const upd = prisma.store.update.mock.calls[0][0];
    expect(upd.data.kycStatus).toBe('SUBMITTED');
    expect(upd.data.aadhaarNumber).toBe('1234');
  });

  it('submitDocument rejects an invalid type', async () => {
    prisma.store.findUnique.mockResolvedValue({ id: 's1', ownerId: 'u1' });
    await expect(kyc.submitDocument('u1', 's1', { type: 'FOO', file: { filename: 'x.jpg', path: '/tmp/x.jpg' } })).rejects.toThrow(/Invalid document type/);
  });

  it("submitDocument forbids a non-owner", async () => {
    prisma.store.findUnique.mockResolvedValue({ id: 's1', ownerId: 'other' });
    await expect(kyc.submitDocument('u1', 's1', { type: 'PAN', file: { filename: 'x.jpg', path: '/tmp/x.jpg' } })).rejects.toThrow(/Not your store/);
  });

  it('allows the store owner to read KYC status and documents', async () => {
    prisma.store.findUnique.mockResolvedValue({ id: 's1', ownerId: 'u1', kycStatus: 'SUBMITTED' });
    prisma.kycDocument.findMany.mockResolvedValue([{ id: 'd1', type: 'PAN', status: 'SUBMITTED', createdAt: new Date() }]);

    const result = await kyc.getKyc('s1', { userId: 'u1' });

    expect(result.documents).toHaveLength(1);
    expect(prisma.store.findUnique).toHaveBeenCalledTimes(2);
  });

  it('forbids an unrelated user from reading store KYC status and documents', async () => {
    prisma.store.findUnique.mockResolvedValue({ id: 's1', ownerId: 'owner' });

    await expect(kyc.getKyc('s1', { userId: 'unrelated' })).rejects.toThrow(/Not your store/);
    expect(prisma.kycDocument.findMany).not.toHaveBeenCalled();
  });

  it('serves private documents only after checking store ownership', async () => {
    const filename = `${crypto.randomUUID()}.jpg`;
    const filePath = path.join(process.cwd(), 'uploads-private', 'kyc', filename);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, Buffer.from([0xff, 0xd8, 0xff]));
    temporaryFiles.push(filePath);
    prisma.store.findUnique.mockResolvedValue({ id: 's1', ownerId: 'u1' });
    prisma.kycDocument.findFirst.mockResolvedValue({ url: `private://kyc/${filename}` });

    await expect(kyc.getDocumentFile('s1', 'd1', { userId: 'u1' })).resolves.toEqual({
      filePath,
      contentType: 'image/jpeg',
    });

    await expect(kyc.getDocumentFile('s1', 'd1', { userId: 'unrelated' })).rejects.toThrow(/Not your store/);
    expect(prisma.kycDocument.findFirst).toHaveBeenCalledTimes(1);
  });

  it('requires legacy public KYC files to be resubmitted privately', async () => {
    prisma.store.findUnique.mockResolvedValue({ id: 's1', ownerId: 'u1' });
    prisma.kycDocument.findFirst.mockResolvedValue({ url: '/uploads/kyc/legacy.jpg' });

    await expect(kyc.getDocumentFile('s1', 'd1', { userId: 'u1' }))
      .rejects.toThrow(/securely resubmitted/);
  });

  it('allows an explicitly authorized reviewer to read KYC status and documents', async () => {
    prisma.store.findUnique.mockResolvedValue({ id: 's1', kycStatus: 'SUBMITTED' });
    prisma.kycDocument.findMany.mockResolvedValue([]);

    await expect(kyc.getKyc('s1', { reviewer: true })).resolves.toMatchObject({
      store: { id: 's1' },
      documents: [],
    });
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
    expect(prisma.kycDocument.updateMany).toHaveBeenCalledWith({
      where: { storeId: 's1', status: 'SUBMITTED' },
      data: { status: 'REJECTED' },
    });
  });

  it('keeps KYC review writes in one transaction', async () => {
    prisma.store.findUnique.mockResolvedValue({ id: 's1' });
    prisma.kycDocument.updateMany.mockResolvedValue({});
    prisma.store.update.mockRejectedValue(new Error('store update failed'));

    await expect(kyc.reviewKyc('s1', { approve: true })).rejects.toThrow('store update failed');
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function));
    expect(prisma.kycDocument.updateMany).toHaveBeenCalledWith({
      where: { storeId: 's1', status: 'SUBMITTED' },
      data: { status: 'VERIFIED' },
    });
  });
});
