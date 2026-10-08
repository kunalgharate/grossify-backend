const { prisma } = require('../../shared/database');
const { BadRequestError, NotFoundError, ForbiddenError } = require('../../shared/errors');

/**
 * Customer returns / replacement / exchange.
 *
 * The return has its OWN state machine (ReturnRequest.status):
 *   REQUESTED → APPROVED → PICKUP_SCHEDULED → PICKED_UP → QC
 *            → REFUNDED | REPLACED | REJECTED | CANCELLED
 * It drives the order to REFUNDED via the existing refund flow on QC pass.
 * Per the E-Commerce Rules, defective/wrong/not-as-described claims are always
 * eligible regardless of the per-product return window.
 */

const ALWAYS_ELIGIBLE_REASONS = ['DAMAGED', 'WRONG_ITEM', 'NOT_AS_DESCRIBED', 'DEFECTIVE', 'EXPIRED'];
const OUTCOMES = ['RETURN', 'REPLACE', 'EXCHANGE'];

/** Per-item eligibility: delivered + within window, OR an always-eligible defect reason. */
const eligibility = async (userId, orderId) => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: { include: { product: { select: { returnable: true, returnWindowDays: true } } } } },
  });
  if (!order) throw new NotFoundError('Order not found');
  if (order.customerId !== userId) throw new ForbiddenError('Not your order');

  const delivered = order.status === 'DELIVERED' || order.status === 'REFUNDED';
  const deliveredAt = order.deliveredAt || order.updatedAt;
  const items = order.items.map((it) => {
    const windowDays = it.product?.returnWindowDays ?? 0;
    const returnable = Boolean(it.product?.returnable);
    const withinWindow =
      delivered && windowDays > 0 && deliveredAt
        ? (Date.now() - new Date(deliveredAt).getTime()) / 86400000 <= windowDays
        : false;
    return {
      orderItemId: it.id,
      productId: it.productId,
      eligible: delivered && (returnable ? withinWindow : false),
      // defect reasons bypass the window entirely (see create()).
      defectClaimAllowed: delivered,
      windowDays,
    };
  });
  return { orderId, delivered, items };
};

const create = async (userId, data) => {
  const { orderId, outcome, reason, reasonNote, photos = [], items } = data;
  if (!orderId || !outcome || !reason) throw new BadRequestError('orderId, outcome, reason are required');
  if (!OUTCOMES.includes(outcome)) throw new BadRequestError(`Invalid outcome: ${outcome}`);
  if (!Array.isArray(items) || items.length === 0) throw new BadRequestError('items[] is required');

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new NotFoundError('Order not found');
  if (order.customerId !== userId) throw new ForbiddenError('Not your order');
  if (!['DELIVERED', 'REFUNDED'].includes(order.status)) {
    throw new BadRequestError('Only delivered orders can be returned');
  }

  // E-Commerce Rules: defect/wrong/not-as-described always allowed; otherwise
  // the eligibility window applies.
  const isDefectClaim = ALWAYS_ELIGIBLE_REASONS.includes(reason);
  if (!isDefectClaim) {
    const elig = await eligibility(userId, orderId);
    const eligibleIds = new Set(elig.items.filter((i) => i.eligible).map((i) => i.orderItemId));
    for (const i of items) {
      if (!eligibleIds.has(i.orderItemId)) {
        throw new BadRequestError('One or more items are outside the return window');
      }
    }
  }

  const req = await prisma.returnRequest.create({
    data: {
      orderId,
      customerId: userId,
      outcome,
      reason,
      reasonNote: reasonNote || null,
      photos,
      refundMethod: data.refundMethod || null,
      items: {
        create: items.map((i) => ({
          orderItemId: i.orderItemId,
          quantity: i.quantity || 1,
          targetVariantId: i.targetVariantId || null,
        })),
      },
    },
    include: { items: true },
  });
  return { returnRequest: req };
};

const listForCustomer = async (userId) =>
  prisma.returnRequest.findMany({
    where: { customerId: userId },
    orderBy: { createdAt: 'desc' },
    include: { items: true },
  });

/** Returns on orders belonging to a vendor's own store(s). */
const listForVendor = async (userId) =>
  prisma.returnRequest.findMany({
    where: { order: { store: { ownerId: userId } } },
    orderBy: { createdAt: 'desc' },
    include: {
      items: true,
      order: { select: { orderNumber: true, storeId: true } },
    },
  });

const cancel = async (userId, id) => {
  const req = await prisma.returnRequest.findUnique({ where: { id } });
  if (!req || req.customerId !== userId) throw new NotFoundError('Return request not found');
  if (!['REQUESTED', 'APPROVED', 'PICKUP_SCHEDULED'].includes(req.status)) {
    throw new BadRequestError('Return can no longer be cancelled');
  }
  return prisma.returnRequest.update({ where: { id }, data: { status: 'CANCELLED' } });
};

// ── Vendor/admin side ──────────────────────────────────────────────────────

const requireOwnOrderStore = async (userId, returnId) => {
  const req = await prisma.returnRequest.findUnique({
    where: { id: returnId },
    include: { order: { include: { store: { select: { ownerId: true } } } } },
  });
  if (!req) throw new NotFoundError('Return request not found');
  if (req.order.store.ownerId !== userId) throw new ForbiddenError('Not your store');
  return req;
};

const decide = async (userId, id, approve, note) => {
  const req = await requireOwnOrderStore(userId, id);
  if (req.status !== 'REQUESTED') throw new BadRequestError('Return already processed');
  const status = approve ? 'PICKUP_SCHEDULED' : 'REJECTED';
  return prisma.returnRequest.update({
    where: { id },
    data: { status, qcNote: note || null },
  });
};

const markPickedUp = async (userId, id) => {
  const req = await requireOwnOrderStore(userId, id);
  if (req.status !== 'PICKUP_SCHEDULED') throw new BadRequestError('Return not scheduled for pickup');
  return prisma.returnRequest.update({ where: { id }, data: { status: 'PICKED_UP' } });
};

/**
 * QC gate. On PASS: RETURN → refund (reuses the refunds flow via status), or
 * REPLACE/EXCHANGE → mark REPLACED (replacement order creation is a follow-up).
 * On FAIL: REJECTED.
 */
const qc = async (userId, id, pass, note) => {
  const req = await requireOwnOrderStore(userId, id);
  if (!['PICKED_UP', 'QC'].includes(req.status)) throw new BadRequestError('Return not ready for QC');
  if (!pass) {
    return prisma.returnRequest.update({ where: { id }, data: { status: 'REJECTED', qcResult: 'FAIL', qcNote: note || null } });
  }
  const terminal = req.outcome === 'RETURN' ? 'REFUNDED' : 'REPLACED';
  return prisma.returnRequest.update({
    where: { id },
    data: { status: terminal, qcResult: 'PASS', qcNote: note || null },
  });
};

module.exports = {
  eligibility,
  create,
  listForCustomer,
  listForVendor,
  cancel,
  decide,
  markPickedUp,
  qc,
  ALWAYS_ELIGIBLE_REASONS,
  OUTCOMES,
};
