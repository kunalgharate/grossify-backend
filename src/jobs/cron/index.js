const cron = require('node-cron');
const { runSubscriptionCheck } = require('./subscriptionCheck');
const { runAbandonedCartRecovery } = require('./abandonedCart');

/**
 * Initialize all cron jobs
 * Call this from server.js on startup
 */
const initCronJobs = () => {
  // Every hour: Check subscription lifecycle
  cron.schedule('0 * * * *', async () => {
    try {
      await runSubscriptionCheck();
    } catch (e) {
      console.error('[Cron] Subscription check failed:', e.message);
    }
  });

  // Every 2 hours: Abandoned cart recovery
  cron.schedule('0 */2 * * *', async () => {
    try {
      await runAbandonedCartRecovery();
    } catch (e) {
      console.error('[Cron] Cart recovery failed:', e.message);
    }
  });

  console.log('⏰ Cron jobs initialized (subscription check: hourly, cart recovery: every 2h)');
};

module.exports = { initCronJobs };
