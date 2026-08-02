/**
 * Analytics service - reporting and metrics
 * Public interface: analyticsService.getPlatformMetrics()
 */

const getPlatformMetrics = async () => {
  // TODO: Aggregate from database
  return {
    gmv: 0,
    activeStores: 0,
    activeUsers: 0,
    ordersToday: 0,
    mrr: 0,
  };
};

const getStoreMetrics = async (storeId, period = 'daily') => {
  // TODO: Store-level analytics
  return {
    revenue: 0,
    orders: 0,
    topProducts: [],
    fulfillmentRate: 0,
  };
};

module.exports = { getPlatformMetrics, getStoreMetrics };
