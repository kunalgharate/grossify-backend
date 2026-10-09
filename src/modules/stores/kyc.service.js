const { prisma } = require('../../shared/database');
const { BadRequestError, NotFoundError, ForbiddenError } = require('../../shared/errors');

/**
 * Seller onboarding KYC: document submission (seller) + verification (admin).
 * Store.kycStatus: PENDING -> SUBMITTED (docs uploaded) -> VERIFIED | REJECTED.
 * Approving a store for listing (admin) should require kycStatus=VERIFIED.
 */

const DOC_TYPES = ['SHOP_ACT', 'AADHAAR', 'PAN', 'GSTIN', 'FSSAI', 'OTHER'];

async function requireOwnStore(userId, storeId) {
  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { id: true, ownerId: true } });
  if (!store) throw new NotFoundError('Store not found');
  if (store.ownerId !== userId) throw new ForbiddenError('Not your store');
  return store;
}

/** Seller submits a KYC document (url from the uploads module). */
async function submitDocument(userId, storeId, { type, url, aadhaarNumber }) {
  await requireOwnStore(userId, storeId);
  if (!DOC_TYPES.includes(type)) throw new BadRequestError(`Invalid document type: ${type}`);
  if (!url) throw new BadRequestError('url is required');

  const doc = await prisma.kycDocument.create({ data: { storeId, type, url, status: 'SUBMITTED' } });

  // Move the store to SUBMITTED and store aadhaar number if provided.
  await prisma.store.update({
    where: { id: storeId },
    data: {
      kycStatus: 'SUBMITTED',
      ...(aadhaarNumber ? { aadhaarNumber } : {}),
    },
  });
  return doc;
}

/** List a store's KYC documents + status (seller or admin). */
async function getKyc(storeId) {
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: {
      id: true, name: true, gstNumber: true, fssaiNumber: true, aadhaarNumber: true,
      aadhaarVerified: true, kycStatus: true, kycRejectionReason: true, kycVerifiedAt: true, status: true,
    },
  });
  if (!store) throw new NotFoundError('Store not found');
  const documents = await prisma.kycDocument.findMany({ where: { storeId }, orderBy: { createdAt: 'desc' } });
  return { store, documents };
}

/** Admin: the KYC review queue (stores awaiting verification). */
async function kycQueue() {
  return prisma.store.findMany({
    where: { kycStatus: { in: ['SUBMITTED', 'PENDING'] } },
    select: { id: true, name: true, city: true, kycStatus: true, gstNumber: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
}

/** Admin: verify or reject a store's KYC. */
async function reviewKyc(storeId, { approve, reason, aadhaarVerified }) {
  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { id: true } });
  if (!store) throw new NotFoundError('Store not found');

  if (approve) {
    await prisma.kycDocument.updateMany({ where: { storeId, status: 'SUBMITTED' }, data: { status: 'VERIFIED' } });
    return prisma.store.update({
      where: { id: storeId },
      data: {
        kycStatus: 'VERIFIED',
        kycVerifiedAt: new Date(),
        kycRejectionReason: null,
        aadhaarVerified: aadhaarVerified !== undefined ? Boolean(aadhaarVerified) : true,
      },
    });
  }

  if (!reason) throw new BadRequestError('Rejection reason is required');
  return prisma.store.update({
    where: { id: storeId },
    data: { kycStatus: 'REJECTED', kycRejectionReason: reason },
  });
}

module.exports = { DOC_TYPES, submitDocument, getKyc, kycQueue, reviewKyc };
