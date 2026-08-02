const { prisma } = require('../shared/database');
const { queueSms } = require('./queue');

/**
 * Notification dispatcher - creates in-app notification + triggers push/SMS
 * Called from services when events happen (order placed, status change, etc.)
 */

/**
 * Send notification to a user (in-app + push + optional SMS)
 */
const notify = async (userId, { title, body, type = 'system', data = {}, sms = false, phone = null }) => {
  // 1. Always create in-app notification
  await prisma.notification.create({
    data: { userId, title, body, type, data },
  });

  // 2. Push notification via FCM (when configured)
  // TODO: When Firebase is configured, send push here
  // await sendFCMPush(userId, title, body, data);

  // 3. SMS for critical notifications
  if (sms && phone) {
    await queueSms(phone, `${title}: ${body}`);
  }
};

/**
 * Notify vendor of new order
 */
const notifyNewOrder = async (storeOwnerId, orderNumber, total) => {
  await notify(storeOwnerId, {
    title: '🔔 New Order!',
    body: `Order ${orderNumber} received — ₹${total}. Accept now!`,
    type: 'order',
    data: { orderNumber },
  });
};

/**
 * Notify customer of order status change
 */
const notifyOrderStatus = async (customerId, orderNumber, status) => {
  const messages = {
    ACCEPTED: 'Your order has been accepted by the store.',
    PREPARING: 'Your order is being prepared.',
    READY: 'Your order is ready for pickup/delivery!',
    PICKED: 'Your order has been picked up by delivery partner.',
    DELIVERED: 'Your order has been delivered. Enjoy!',
    CANCELLED: 'Your order has been cancelled.',
  };

  await notify(customerId, {
    title: `Order ${orderNumber}`,
    body: messages[status] || `Status updated to ${status}`,
    type: 'order',
    data: { orderNumber, status },
  });
};

/**
 * Notify about subscription events
 */
const notifySubscription = async (userId, event, details = {}) => {
  const messages = {
    trial_expiring: `Your free trial expires in ${details.daysLeft} day(s). Subscribe now!`,
    trial_expired: 'Your free trial has ended. Subscribe to keep your store visible.',
    payment_due: 'Your subscription payment is overdue. Renew within 7 days.',
    expired: 'Your subscription has expired. Your store is now hidden.',
    renewed: 'Subscription renewed successfully!',
  };

  await notify(userId, {
    title: 'Subscription Update',
    body: messages[event] || 'Subscription status changed.',
    type: 'subscription',
    data: details,
  });
};

module.exports = { notify, notifyNewOrder, notifyOrderStatus, notifySubscription };
