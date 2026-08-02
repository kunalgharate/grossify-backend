const analyticsService = require('./analytics.service');

const getDashboard = async (req, res) => {
  const metrics = await analyticsService.getPlatformMetrics();
  res.status(200).json({ metrics });
};

const getStoreAnalytics = async (req, res) => {
  const { period } = req.query; // daily, weekly, monthly
  const analytics = await analyticsService.getStoreMetrics(req.params.storeId, period);
  res.status(200).json({ analytics });
};

module.exports = { getDashboard, getStoreAnalytics };
