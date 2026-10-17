const { prisma } = require('../../shared/database');
const { BadRequestError, NotFoundError, ForbiddenError } = require('../../shared/errors');
const { documentKey, resolveDocument, contentType, validateDocument } = require('./kyc-storage');

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

/** Seller submits a KYC document using the private upload endpoint. */
async function submitDocument(userId, storeId, { type, file, aadhaarNumber }) {
  await requireOwnStore(userId, storeId);
  if (!DOC_TYPES.includes(type)) throw new BadRequestError(`Invalid document type: ${type}`);
  if (!file) throw new BadRequestError('A KYC document file is required');
  await validateDocument(file);

  const [doc] = await prisma.$transaction([
    prisma.kycDocument.create({
      data: { storeId, type, url: documentKey(file.filename), status: 'SUBMITTED' },
    }),
    prisma.store.update({
      where: { id: storeId },
      data: {
        kycStatus: 'SUBMITTED',
        ...(aadhaarNumber ? { aadhaarNumber } : {}),
      },
    }),
  ]);
  return doc;
}

/** List a store's KYC documents + status (owner or an authorized reviewer). */
async function getKyc(storeId, { userId, reviewer = false } = {}) {
  if (!reviewer) {
    if (!userId) throw new ForbiddenError('Store ownership or reviewer access is required');
    await requireOwnStore(userId, storeId);
  }

  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: {
      id: true, name: true, gstNumber: true, fssaiNumber: true, aadhaarNumber: true,
      aadhaarVerified: true, kycStatus: true, kycRejectionReason: true, kycVerifiedAt: true, status: true,
    },
  });
  if (!store) throw new NotFoundError('Store not found');
  const documents = await prisma.kycDocument.findMany({
    where: { storeId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, type: true, status: true, createdAt: true },
  });
  return { store, documents };
}

async function getDocumentFile(storeId, documentId, { userId, reviewer = false } = {}) {
  if (!reviewer) {
    if (!userId) throw new ForbiddenError('Store ownership or reviewer access is required');
    await requireOwnStore(userId, storeId);
  }

  const document = await prisma.kycDocument.findFirst({
    where: { id: documentId, storeId },
    select: { url: true },
  });
  if (!document) throw new NotFoundError('KYC document not found');
  const match = /^private:\/\/kyc\/(.+)$/.exec(document.url || '');
  if (!match) throw new NotFoundError('This legacy KYC document must be securely resubmitted');
  const filePath = resolveDocument(match[1]);
  return { filePath, contentType: contentType(match[1]) };
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
    return prisma.$transaction(async (tx) => {
      await tx.kycDocument.updateMany({
        where: { storeId, status: 'SUBMITTED' },
        data: { status: 'VERIFIED' },
      });
      return tx.store.update({
        where: { id: storeId },
        data: {
          kycStatus: 'VERIFIED',
          kycVerifiedAt: new Date(),
          kycRejectionReason: null,
          aadhaarVerified: aadhaarVerified !== undefined ? Boolean(aadhaarVerified) : true,
        },
      });
    });
  }

  if (!reason) throw new BadRequestError('Rejection reason is required');
  return prisma.$transaction(async (tx) => {
    await tx.kycDocument.updateMany({
      where: { storeId, status: 'SUBMITTED' },
      data: { status: 'REJECTED' },
    });
    return tx.store.update({
      where: { id: storeId },
      data: { kycStatus: 'REJECTED', kycRejectionReason: reason },
    });
  });
}

module.exports = { DOC_TYPES, requireOwnStore, submitDocument, getKyc, getDocumentFile, kycQueue, reviewKyc };
