const { prisma } = require('../../shared/database');
const { BadRequestError, NotFoundError } = require('../../shared/errors');

/**
 * Legal & compliance service (India DPDP Act 2023 + Consumer Protection
 * E-Commerce Rules 2020). Covers: versioned policy acceptance, granular
 * (unbundled) marketing consent, DPDP data-rights requests, and grievance SLA
 * helpers layered on the tickets model (48h ack / 1-month resolve).
 */

const POLICY_TYPES = ['TOS', 'PRIVACY', 'RETURN_REFUND', 'SHIPPING', 'CANCELLATION', 'SELLER', 'RIDER'];

// ── Policies ────────────────────────────────────────────────────────────────
const currentPolicies = async () =>
  prisma.policyVersion.findMany({ where: { isCurrent: true }, orderBy: { policyType: 'asc' } });

const setPolicyVersion = async ({ policyType, version, materialChange = false }) => {
  if (!POLICY_TYPES.includes(policyType)) throw new BadRequestError(`Invalid policyType: ${policyType}`);
  if (!version) throw new BadRequestError('version is required');
  // New current version supersedes the old one.
  await prisma.policyVersion.updateMany({ where: { policyType, isCurrent: true }, data: { isCurrent: false } });
  return prisma.policyVersion.create({
    data: { policyType, version, materialChange, isCurrent: true, effectiveAt: new Date() },
  });
};

// ── Consent & acceptance ──────────────────────────────────────────────────
const acceptPolicy = async (userId, policyType, version) => {
  if (!POLICY_TYPES.includes(policyType)) throw new BadRequestError(`Invalid policyType: ${policyType}`);
  if (!version) throw new BadRequestError('version is required');
  return prisma.policyAcceptance.create({ data: { userId, policyType, version } });
};

const setConsent = async (userId, purpose, granted) => {
  if (!purpose) throw new BadRequestError('purpose is required');
  return prisma.consentRecord.upsert({
    where: { userId_purpose: { userId, purpose } },
    create: { userId, purpose, granted: Boolean(granted), grantedAt: granted ? new Date() : null },
    update: {
      granted: Boolean(granted),
      grantedAt: granted ? new Date() : undefined,
      withdrawnAt: granted ? null : new Date(),
    },
  });
};

const myConsentState = async (userId) => {
  const [acceptances, consents] = await Promise.all([
    prisma.policyAcceptance.findMany({ where: { userId }, orderBy: { acceptedAt: 'desc' } }),
    prisma.consentRecord.findMany({ where: { userId } }),
  ]);
  return { acceptances, consents };
};

// ── DPDP data rights ────────────────────────────────────────────────────────
const requestDataRight = async (userId, type) => {
  if (!['ACCESS', 'CORRECTION', 'ERASURE'].includes(type)) throw new BadRequestError(`Invalid type: ${type}`);
  return prisma.dataRightsRequest.create({ data: { userId, type } });
};

/**
 * Account deletion = ERASURE: anonymize PII in place (keep legally-required
 * financial records de-identified), mark the account DELETED. Idempotent.
 */
const eraseAccount = async (userId) => {
  const req = await prisma.dataRightsRequest.create({ data: { userId, type: 'ERASURE', status: 'PROCESSING' } });
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        name: 'Deleted User',
        email: null,
        phone: `deleted-${userId}`,
        passwordHash: null,
        status: 'DELETED',
      },
    });
    await tx.address.deleteMany({ where: { userId } }).catch(() => {});
    await tx.consentRecord.updateMany({ where: { userId }, data: { granted: false, withdrawnAt: new Date() } });
  });
  return prisma.dataRightsRequest.update({
    where: { id: req.id },
    data: { status: 'COMPLETED', completedAt: new Date() },
  });
};

// ── Grievance (on tickets, with statutory SLA) ──────────────────────────────
const raiseGrievance = async (userId, { subject, description, category = 'account', orderId }) => {
  if (!subject || !description) throw new BadRequestError('subject and description are required');
  const now = Date.now();
  return prisma.ticket.create({
    data: {
      ticketNumber: `GRV-${now}`,
      userId,
      orderId: orderId || null,
      category,
      subject,
      description,
      isGrievance: true,
      ackDueAt: new Date(now + 48 * 3600 * 1000), // 48h
      resolveDueAt: new Date(now + 30 * 24 * 3600 * 1000), // ~1 month
      slaStatus: 'ON_TIME',
    },
  });
};

/** Recompute SLA status for open grievances (called by a cron / admin view). */
const slaStatusFor = (ticket, now = Date.now()) => {
  if (ticket.status === 'resolved' || ticket.status === 'closed') return 'ON_TIME';
  if (ticket.resolveDueAt && now > new Date(ticket.resolveDueAt).getTime()) return 'BREACHED';
  if (ticket.ackDueAt && !ticket.acknowledgedAt && now > new Date(ticket.ackDueAt).getTime()) return 'BREACHED';
  // within 20% of resolve window → at risk
  if (ticket.resolveDueAt) {
    const remaining = new Date(ticket.resolveDueAt).getTime() - now;
    if (remaining < 0.2 * 30 * 24 * 3600 * 1000) return 'AT_RISK';
  }
  return 'ON_TIME';
};

const listGrievances = async () => {
  const tickets = await prisma.ticket.findMany({
    where: { isGrievance: true },
    orderBy: { createdAt: 'desc' },
  });
  const now = Date.now();
  return tickets.map((t) => ({ ...t, slaStatus: slaStatusFor(t, now) }));
};

const acknowledgeGrievance = async (id) => {
  const t = await prisma.ticket.findUnique({ where: { id } });
  if (!t || !t.isGrievance) throw new NotFoundError('Grievance not found');
  return prisma.ticket.update({ where: { id }, data: { acknowledgedAt: new Date(), status: 'in_progress' } });
};

module.exports = {
  POLICY_TYPES,
  currentPolicies,
  setPolicyVersion,
  acceptPolicy,
  setConsent,
  myConsentState,
  requestDataRight,
  eraseAccount,
  raiseGrievance,
  slaStatusFor,
  listGrievances,
  acknowledgeGrievance,
};
