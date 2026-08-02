/**
 * SMS worker - processes OTP and notification SMS jobs
 * Queue: 'sms'
 * Priority: Critical (OTP), High (order notifications)
 */

// const { Worker } = require('bullmq');
// const notificationService = require('../modules/notifications/notification.service');

const processSmsJob = async (job) => {
  const { phone, message, template } = job.data;

  // TODO: Call MSG91 API to send SMS
  // await notificationService.sendSms(phone, message);

  console.log(`[SMS Worker] Sent to ${phone}: ${template}`);
};

module.exports = { processSmsJob };
