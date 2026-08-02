/**
 * BullMQ Job Queue Setup
 * Background jobs for: SMS, Email, Image processing, Search sync, etc.
 * Uses Valkey (free Redis-compatible server) as the backend
 * Gracefully handles missing Valkey (jobs just won't queue in dev without it)
 */

let smsQueue = null;
let emailQueue = null;
let notificationQueue = null;

try {
  const { Queue } = require('bullmq');
  const config = require('../shared/config');

  const connection = { host: 'localhost', port: 6379 };

  smsQueue = new Queue('sms', { connection });
  emailQueue = new Queue('email', { connection });
  notificationQueue = new Queue('notification', { connection });

  console.log('📋 Job queues initialized');
} catch (e) {
  // Redis not available - jobs won't queue but app still works
}

/**
 * Add SMS job (OTP, order notifications)
 */
const queueSms = async (phone, message, template = 'general') => {
  if (!smsQueue) {
    console.log(`[SMS-MOCK] To: ${phone} | ${message}`);
    return;
  }
  await smsQueue.add('send-sms', { phone, message, template }, { priority: 1, attempts: 3 });
};

/**
 * Add Email job
 */
const queueEmail = async (to, subject, template, data = {}) => {
  if (!emailQueue) {
    console.log(`[EMAIL-MOCK] To: ${to} | Subject: ${subject}`);
    return;
  }
  await emailQueue.add('send-email', { to, subject, template, data }, { attempts: 5, backoff: { type: 'exponential', delay: 5000 } });
};

/**
 * Add Push Notification job
 */
const queueNotification = async (userId, title, body, data = {}) => {
  if (!notificationQueue) {
    console.log(`[PUSH-MOCK] To: ${userId} | ${title}`);
    return;
  }
  await notificationQueue.add('send-push', { userId, title, body, data }, { attempts: 3 });
};

module.exports = { queueSms, queueEmail, queueNotification };
