/**
 * Analytics service — real reporting metrics (Prisma aggregates).
 *
 *   getPlatformMetrics()             → admin dashboard (GMV, MRR, active counts, orders today)
 *   getStoreMetrics(storeId, period) → vendor dashboard (revenue, orders, top products,
 *                                       fulfillment rate, revenue trend)
 *
 * GMV counts revenue from non-cancelled orders (delivered + in-flight). MRR is the
 * monthly-normalised sum of ACTIVE subscriptions' plan prices (annual/12 for annual cycles).
 */
const { prisma } = require('../../shared/database');

const num = (d) => (d == null ? 0 : Number(d));

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Monthly Recurring Revenue from active/grace subscriptions. */
async function computeMrr() {
  const subs = await prisma.subscription.findMany({
    where: { status: { in: ['ACTIVE', 'GRACE'] } },
    include: { plan: { select: { monthlyPrice: true, annualPrice: true } } },
  });
  let mrr = 0;
  for (const s of subs) {
    if (!s.plan) continue;
    mrr += s.billingCycle === 'annual'
      ? num(s.plan.annualPrice) / 12
      : num(s.plan.monthlyPrice);
  }
  return Math.round(mrr * 100) / 100;
}

const getPlatformMetrics = async () => {
  const today = startOfToday();
  const notCancelled = { status: { not: 'CANCELLED' } };

  const [gmvAgg, activeStores, activeUsers, ordersToday, mrr, totalOrders] = await Promise.all([
    prisma.order.aggregate({ where: notCancelled, _sum: { total: true } }),
    prisma.store.count({ where: { status: 'ACTIVE' } }),
    prisma.user.count({ where: { status: 'ACTIVE' } }),
    prisma.order.count({ where: { placedAt: { gte: today } } }),
    computeMrr(),
    prisma.order.count(),
  ]);

  return {
    gmv: num(gmvAgg._sum.total),
    activeStores,
    activeUsers,
    ordersToday,
    mrr,
    totalOrders,
  };
};

/** Number of days in a period window. */
function periodDays(period) {
  switch (period) {
    case 'weekly': return 7;
    case 'monthly': return 30;
    case 'yearly': return 365;
    default: return 1; // daily
  }
}

const getStoreMetrics = async (storeId, period = 'daily') => {
  const since = new Date();
  since.setDate(since.getDate() - periodDays(period));
  since.setHours(0, 0, 0, 0);

  const delivered = { storeId, status: 'DELIVERED' };

  const [revenueAgg, periodRevenueAgg, totalOrders, deliveredOrders, cancelledOrders, topItems] =
    await Promise.all([
      prisma.order.aggregate({ where: delivered, _sum: { total: true } }),
      prisma.order.aggregate({
        where: { storeId, status: 'DELIVERED', placedAt: { gte: since } },
        _sum: { total: true },
        _count: true,
      }),
      prisma.order.count({ where: { storeId } }),
      prisma.order.count({ where: { storeId, status: 'DELIVERED' } }),
      prisma.order.count({ where: { storeId, status: 'CANCELLED' } }),
      // Top products by quantity sold (delivered orders only).
      prisma.orderItem.groupBy({
        by: ['productName'],
        where: { order: { storeId, status: 'DELIVERED' } },
        _sum: { quantity: true, totalPrice: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: 5,
      }),
    ]);

  const topProducts = topItems.map((t) => ({
    name: t.productName,
    quantity: num(t._sum.quantity),
    revenue: num(t._sum.totalPrice),
  }));

  return {
    revenue: num(revenueAgg._sum.total),
    periodRevenue: num(periodRevenueAgg._sum.total),
    periodOrders: periodRevenueAgg._count,
    totalOrders,
    deliveredOrders,
    cancelledOrders,
    topProducts,
    fulfillmentRate: totalOrders > 0 ? Math.round((deliveredOrders / totalOrders) * 100) : 0,
    period,
  };
};

module.exports = { getPlatformMetrics, getStoreMetrics, computeMrr };
