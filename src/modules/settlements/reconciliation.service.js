const { prisma } = require('../../shared/database');
const razorpay = require('../payments/razorpay.service');

/**
 * Settlement reconciliation: for a store over a period, compares the money that
 * SHOULD have been settled (captured payments on delivered/paid orders, net of
 * refunds and commission) against what WAS settled (Settlement records), and
 * flags discrepancies. When Razorpay payouts are configured, it additionally
 * surfaces payout status; otherwise that external check is reported as
 * "skipped" (local-only reconciliation still runs).
 *
 * Pure aggregation helper `reconcileFrom` is unit-testable without a DB.
 */

const PAISE = (n) => Math.round(Number(n) * 100);
const RUPEES = (p) => p / 100;

/**
 * Pure reconciliation over already-fetched rows.
 * @param {{amount:number,status:string,refundAmount?:number}[]} payments
 * @param {{amount:number,status:string}[]} settlements
 * @param {number} commissionRate  e.g. 0.1 for 10%
 */
function reconcileFrom(payments, settlements, commissionRate = 0) {
  const capturedPaise = payments
    .filter((p) => p.status === 'CAPTURED' || p.status === 'PAID' || p.status === 'captured')
    .reduce((s, p) => s + PAISE(p.amount) - PAISE(p.refundAmount || 0), 0);

  const commissionPaise = Math.round(capturedPaise * commissionRate);
  const expectedSettlementPaise = capturedPaise - commissionPaise;

  const settledPaise = settlements
    .filter((s) => s.status === 'settled')
    .reduce((s, r) => s + PAISE(r.amount), 0);

  const variancePaise = expectedSettlementPaise - settledPaise;

  return {
    capturedAmount: RUPEES(capturedPaise),
    commission: RUPEES(commissionPaise),
    expectedSettlement: RUPEES(expectedSettlementPaise),
    actualSettled: RUPEES(settledPaise),
    variance: RUPEES(variancePaise),
    reconciled: variancePaise === 0,
    status: variancePaise === 0 ? 'MATCHED' : variancePaise > 0 ? 'UNDER_SETTLED' : 'OVER_SETTLED',
  };
}

/** Reconcile a store over [from, to]. Fetches rows, runs the pure helper. */
async function reconcileStore({ storeId, from, to, commissionRate = 0.1 }) {
  const periodStart = from ? new Date(from) : new Date(Date.now() - 30 * 86400000);
  const periodEnd = to ? new Date(to) : new Date();

  const [payments, settlements, store] = await Promise.all([
    prisma.payment.findMany({
      where: {
        order: { storeId },
        paidAt: { gte: periodStart, lte: periodEnd },
      },
      select: { amount: true, status: true, refundAmount: true },
    }),
    prisma.settlement.findMany({
      where: { storeId, periodStart: { gte: periodStart }, periodEnd: { lte: periodEnd } },
      select: { amount: true, status: true },
    }),
    prisma.store.findUnique({ where: { id: storeId }, select: { razorpayAccountId: true } }),
  ]);

  const result = reconcileFrom(payments, settlements, commissionRate);

  // Optional external cross-check (Razorpay payouts). Reported, never fatal.
  let payoutCheck = { status: 'SKIPPED', reason: 'Razorpay payouts not configured' };
  if (razorpay.isPayoutConfigured && razorpay.isPayoutConfigured()) {
    payoutCheck = store?.razorpayAccountId
      ? { status: 'CONFIGURED', note: 'Cross-check against RazorpayX payout history pending live run.' }
      : { status: 'NO_LINKED_ACCOUNT', reason: 'Store has no razorpayAccountId' };
  }

  return {
    storeId,
    period: { from: periodStart, to: periodEnd },
    paymentsCount: payments.length,
    settlementsCount: settlements.length,
    ...result,
    payoutCheck,
  };
}

module.exports = { reconcileStore, reconcileFrom };
