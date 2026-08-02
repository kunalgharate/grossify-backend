/**
 * Notification service - SMS, push, email, in-app
 * Public interface for other modules:
 *   notificationService.send(userId, channel, template, data)
 *   notificationService.sendPush(userId, title, body)
 *   notificationService.sendSms(phone, message)
 */

const send = async (userId, channel, template, data) => {
  // TODO: Route to appropriate channel handler
  // Channels: 'push', 'sms', 'email', 'in_app'
  return true;
};

const sendPush = async (userId, title, body, data = {}) => {
  // TODO: Send via Firebase Cloud Messaging (FCM)
  return true;
};

const sendSms = async (phone, message) => {
  // TODO: Send via MSG91
  return true;
};

const sendEmail = async (email, subject, template, data) => {
  // TODO: Send via AWS SES or Brevo
  return true;
};

const list = async (userId, { page = 1, limit = 20 }) => {
  // TODO: Fetch in-app notifications from DB
  return {
    notifications: [],
    pagination: { page: Number(page), limit: Number(limit), total: 0 },
  };
};

const markRead = async (userId, notificationId) => {
  // TODO: Mark notification as read in DB
  return true;
};

module.exports = { send, sendPush, sendSms, sendEmail, list, markRead };
