const axios = require('axios');
const config = require('../../shared/config');

/**
 * Firebase Cloud Messaging (push) sender.
 *
 * Uses the FCM legacy HTTP API with a server key (FCM_SERVER_KEY). When the key
 * is absent we run in DEMO mode — logging the push instead of sending — so dev
 * and tests never require live Firebase credentials (mirrors msg91.service).
 *
 * NOTE: the FCM legacy endpoint is deprecated by Google in favour of HTTP v1
 * (OAuth + service account). This is intentionally the lightweight path; swap
 * `_send` for an HTTP v1 implementation when a service account is provisioned.
 */
const FCM_LEGACY_URL = 'https://fcm.googleapis.com/fcm/send';

const isDemoMode = !config.firebase.serverKey;

if (isDemoMode) {
  console.warn('[FCM] ⚠️  Running in DEMO mode — push logged, not sent (set FCM_SERVER_KEY)');
}

/**
 * Send a data+notification push to a single device token.
 * @returns {Promise<{success:boolean, demo?:boolean, message?:string}>}
 */
const sendToToken = async (token, title, body, data = {}) => {
  if (!token) return { success: false, message: 'No device token' };

  if (isDemoMode) {
    console.log(`[FCM DEMO] -> ${String(token).slice(0, 12)}… | ${title}: ${body}`);
    return { success: true, demo: true };
  }

  try {
    // FCM requires all data values to be strings.
    const stringData = Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)])
    );
    const res = await axios.post(
      FCM_LEGACY_URL,
      { to: token, notification: { title, body }, data: stringData },
      { headers: { Authorization: `key=${config.firebase.serverKey}`, 'Content-Type': 'application/json' }, timeout: 8000 }
    );
    const ok = (res.data?.success ?? 0) >= 1;
    return { success: ok, message: ok ? 'sent' : 'not delivered' };
  } catch (error) {
    console.error('[FCM] send error:', error.response?.data || error.message);
    return { success: false, message: 'FCM send failed' };
  }
};

module.exports = { sendToToken, isDemoMode };
