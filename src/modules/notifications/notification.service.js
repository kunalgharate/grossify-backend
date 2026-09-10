/**
 * Notification service — the internal API other modules call.
 *
 *   notificationService.notify(userId, { title, body, type, data, push })
 *       → persist an in-app Notification row (+ best-effort FCM push)
 *   notificationService.sendPush(userId, title, body, data)   → FCM only
 *   notificationService.sendSms(phone, message)               → MSG91
 *   notificationService.sendEmail(email, subject, template, data)
 *   notificationService.list(userId, { page, limit, unreadOnly })
 *   notificationService.markRead(userId, id) / markAllRead(userId)
 *
 * In-app is DB-backed (Notification model). Push uses fcm.service (demo mode
 * when unconfigured). SMS reuses the working msg91 transactional sender. Email
 * via Brevo is stubbed until credentials exist. Every dispatch is best-effort:
 * a failing channel never throws into the caller's business transaction.
 */
const { prisma } = require('../../shared/database');
const fcmService = require('./fcm.service');
const msg91Service = require('../auth/msg91.service');

/**
 * Create an in-app notification and (best-effort) push it to the user's device.
 * @param {string} userId
 * @param {{title:string, body:string, type?:string, data?:object, push?:boolean}} opts
 * @returns {Promise<object>} the created Notification row
 */
const notify = async (userId, { title, body, type = 'general', data = {}, push = true }) => {
  const notification = await prisma.notification.create({
    data: { userId, title, body, type, data },
  });

  if (push) {
    // Fire-and-forget push; never let a push failure break the caller.
    sendPush(userId, title, body, { ...data, notificationId: notification.id, type })
      .catch((e) => console.error('[notify] push failed:', e.message));
  }

  return notification;
};

/** Send an FCM push to a user's stored device token (no-op if none). */
const sendPush = async (userId, title, body, data = {}) => {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { fcmToken: true } });
  if (!user?.fcmToken) return { success: false, message: 'No device token' };
  return fcmService.sendToToken(user.fcmToken, title, body, data);
};

/** Transactional SMS via MSG91. */
const sendSms = async (phone, message) => {
  if (!phone) return { success: false, message: 'No phone' };
  return msg91Service.sendSms(phone, message);
};

/** Email via Brevo — stubbed until credentials are configured. */
const sendEmail = async (email, subject, template, data = {}) => {
  console.log(`[email STUB] -> ${email} | ${subject} (${template})`);
  return { success: true, stubbed: true };
};

/**
 * Generic channel router (kept for callers that pass a channel explicitly).
 * @param {string} channel 'in_app' | 'push' | 'sms' | 'email'
 */
const send = async (userId, channel, payload = {}) => {
  switch (channel) {
    case 'in_app':
      return notify(userId, { ...payload, push: false });
    case 'push':
      return sendPush(userId, payload.title, payload.body, payload.data || {});
    case 'sms':
      return sendSms(payload.phone, payload.message);
    case 'email':
      return sendEmail(payload.email, payload.subject, payload.template, payload.data);
    default:
      return { success: false, message: `Unknown channel: ${channel}` };
  }
};

/** List a user's in-app notifications (DB-backed) with unread count. */
const list = async (userId, { page = 1, limit = 20, unreadOnly = false } = {}) => {
  const pageNum = Number(page) || 1;
  const limitNum = Math.min(Number(limit) || 20, 50);
  const where = { userId };
  if (unreadOnly === true || unreadOnly === 'true') where.isRead = false;

  const [notifications, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where, skip: (pageNum - 1) * limitNum, take: limitNum,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId, isRead: false } }),
  ]);

  return { notifications, unreadCount, pagination: { page: pageNum, limit: limitNum, total } };
};

/** Mark one notification read (scoped to the owner). */
const markRead = async (userId, notificationId) => {
  const result = await prisma.notification.updateMany({
    where: { id: notificationId, userId },
    data: { isRead: true },
  });
  return { success: result.count > 0 };
};

/** Mark all of a user's notifications read. */
const markAllRead = async (userId) => {
  const result = await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true },
  });
  return { success: true, updated: result.count };
};

/** Persist/refresh a user's FCM device token (called on login / token refresh). */
const registerDeviceToken = async (userId, fcmToken) => {
  await prisma.user.update({ where: { id: userId }, data: { fcmToken } });
  return { success: true };
};

module.exports = {
  notify,
  send,
  sendPush,
  sendSms,
  sendEmail,
  list,
  markRead,
  markAllRead,
  registerDeviceToken,
};
