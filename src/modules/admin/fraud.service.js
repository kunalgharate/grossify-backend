const { prisma } = require('../../shared/database');

/**
 * Fraud & RTO (return-to-origin) abuse risk scoring. Pure heuristics over a
 * customer's order/return history — no ML, no new tables. Produces a 0–100
 * risk score + flags that admin/ops can act on (review/block). Thresholds are
 * conservative defaults; tune from real data.
 */

const WEIGHTS = {
  highRtoRate: 35, // many delivery-failed/returned orders
  serialReturner: 30, // returns on a large share of orders
  rapidOrders: 15, // many orders in a short window (card-testing / promo abuse)
  highCancelRate: 20, // frequent cancellations
};

/** Pure scorer — unit-testable without a DB. */
function scoreFromStats({ totalOrders = 0, rtoOrders = 0, returnedOrders = 0, cancelledOrders = 0, ordersLastHour = 0 }) {
  const flags = [];
  let score = 0;

  const rtoRate = totalOrders ? rtoOrders / totalOrders : 0;
  const returnRate = totalOrders ? returnedOrders / totalOrders : 0;
  const cancelRate = totalOrders ? cancelledOrders / totalOrders : 0;

  if (totalOrders >= 5 && rtoRate >= 0.4) {
    score += WEIGHTS.highRtoRate;
    flags.push('HIGH_RTO_RATE');
  }
  if (totalOrders >= 5 && returnRate >= 0.5) {
    score += WEIGHTS.serialReturner;
    flags.push('SERIAL_RETURNER');
  }
  if (ordersLastHour >= 5) {
    score += WEIGHTS.rapidOrders;
    flags.push('RAPID_ORDERS');
  }
  if (totalOrders >= 5 && cancelRate >= 0.5) {
    score += WEIGHTS.highCancelRate;
    flags.push('HIGH_CANCEL_RATE');
  }

  score = Math.min(100, score);
  const level = score >= 60 ? 'HIGH' : score >= 30 ? 'MEDIUM' : 'LOW';
  const recommendation = level === 'HIGH' ? 'BLOCK_OR_REVIEW' : level === 'MEDIUM' ? 'REVIEW' : 'ALLOW';
  return { score, level, flags, recommendation, rates: { rtoRate, returnRate, cancelRate } };
}

/** Gather a customer's stats and score them. */
async function assessCustomer(customerId) {
  const hourAgo = new Date(Date.now() - 3600 * 1000);
  const [totalOrders, rtoOrders, returnedOrders, cancelledOrders, ordersLastHour] = await Promise.all([
    prisma.order.count({ where: { customerId } }),
    prisma.order.count({ where: { customerId, status: 'RTO' } }).catch(() => 0),
    prisma.returnRequest.count({ where: { customerId } }).catch(() => 0),
    prisma.order.count({ where: { customerId, status: 'CANCELLED' } }),
    prisma.order.count({ where: { customerId, placedAt: { gte: hourAgo } } }).catch(() => 0),
  ]);
  return {
    customerId,
    stats: { totalOrders, rtoOrders, returnedOrders, cancelledOrders, ordersLastHour },
    ...scoreFromStats({ totalOrders, rtoOrders, returnedOrders, cancelledOrders, ordersLastHour }),
  };
}

module.exports = { scoreFromStats, assessCustomer, WEIGHTS };
