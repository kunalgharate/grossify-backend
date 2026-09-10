/**
 * Settlement worker — daily delivery-partner payouts + reconciliation.
 * Queue: 'settlement'
 * Schedule: daily (agent payouts 11 PM, reconciliation 6 AM).
 *
 * Delivery economics (subscription model — no commission on merchant sales):
 *   Grossify's only order-level revenue is the delivery commission (5% of the
 *   delivery pool). Each GROSSIFY order has a `DeliveryEarning` row with the
 *   partner payout (pool − commission). This worker sums the PENDING payouts for
 *   DELIVERED orders per agent, marks them settled, and (when RazorpayX Payouts
 *   is wired) disburses. Until then it computes + marks settled so reporting is
 *   correct and idempotent.
 */

const { prisma } = require('../shared/database');
const razorpayService = require('../modules/payments/razorpay.service');

/**
 * Compute and settle pending delivery-partner payouts.
 * @param {object} [opts]
 * @param {boolean} [opts.markSettled=true] when false, only computes (dry run)
 * @returns {Promise<{agents:number, totalPayout:number, settledCount:number}>}
 */
async function runAgentPayouts({ markSettled = true } = {}) {
  // Only settle earnings for orders that have actually been delivered.
  const pending = await prisma.deliveryEarning.findMany({
    where: { status: 'pending', agentId: { not: null }, order: { status: 'DELIVERED' } },
    select: { id: true, agentId: true, partnerPayout: true },
  });

  const byAgent = new Map();
  for (const e of pending) {
    const cur = byAgent.get(e.agentId) || { total: 0, ids: [] };
    cur.total += Number(e.partnerPayout);
    cur.ids.push(e.id);
    byAgent.set(e.agentId, cur);
  }

  let totalPayout = 0;
  let settledCount = 0;
  for (const [agentId, agg] of byAgent.entries()) {
    totalPayout += agg.total;
    // Disburse to the agent via RazorpayX (demo mode returns a synthetic ref).
    const result = await razorpayService.payout({
      amount: agg.total,
      referenceId: `agent_${agentId}_${Date.now()}`,
      narration: 'Grossify delivery payout',
    });
    if (markSettled && result.success) {
      const res = await prisma.deliveryEarning.updateMany({
        where: { id: { in: agg.ids } },
        data: {
          status: 'settled',
          settledAt: new Date(),
          payoutRef: result.payoutId,
          payoutStatus: result.status,
        },
      });
      settledCount += res.count;
    }
  }

  return {
    agents: byAgent.size,
    totalPayout: Math.round(totalPayout * 100) / 100,
    settledCount,
  };
}

/**
 * Reconciliation: sum platform delivery commission over a window (Grossify's
 * revenue) for reporting. Non-mutating.
 */
async function runReconciliation({ from, to } = {}) {
  const where = { order: { status: 'DELIVERED' } };
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    if (to) where.createdAt.lte = new Date(to);
  }
  const agg = await prisma.deliveryEarning.aggregate({
    where, _sum: { platformCommission: true, partnerPayout: true, pool: true }, _count: true,
  });
  const num = (d) => (d == null ? 0 : Number(d));
  return {
    orders: agg._count,
    platformCommission: num(agg._sum.platformCommission),
    partnerPayout: num(agg._sum.partnerPayout),
    pool: num(agg._sum.pool),
  };
}

const processSettlementJob = async (job) => {
  const { type } = job.data || {};
  switch (type) {
    case 'agent_payout': {
      const r = await runAgentPayouts();
      console.log(`[Settlement] agent payouts: ${r.agents} agents, ₹${r.totalPayout}, ${r.settledCount} settled`);
      return r;
    }
    case 'reconciliation': {
      const r = await runReconciliation();
      console.log(`[Settlement] reconciliation: ${r.orders} orders, commission ₹${r.platformCommission}`);
      return r;
    }
    default:
      console.log(`[Settlement Worker] Unknown job type: ${type}`);
  }
};

module.exports = { processSettlementJob, runAgentPayouts, runReconciliation };
