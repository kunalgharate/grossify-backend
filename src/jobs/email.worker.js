/**
 * Email worker - processes transactional email jobs
 * Queue: 'email'
 * Priority: Medium
 * Retry: 5 retries with exponential backoff
 *
 * Delegates to the notification service's Brevo-backed sendEmail (which falls
 * back to a logged stub when BREVO_API_KEY is unset).
 */

const notificationService = require('../modules/notifications/notification.service');

const processEmailJob = async (job) => {
  const { to, subject, template, data } = job.data;
  const result = await notificationService.sendEmail(to, subject, template, data || {});
  if (!result.success) {
    // Throw so BullMQ retries with backoff.
    throw new Error(`Email dispatch failed for ${to}: ${result.error || result.status || 'unknown'}`);
  }
  return result;
};

module.exports = { processEmailJob };
