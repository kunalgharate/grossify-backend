const crypto = require('crypto');
const Razorpay = require('razorpay');
const config = require('../../shared/config');

/**
 * Lazy-initialized Razorpay instance.
 * Avoids crashing at startup if env vars are not yet configured.
 */
let _razorpay = null;

const getRazorpayInstance = () => {
  if (!_razorpay) {
    if (!config.razorpay.keyId || !config.razorpay.keySecret) {
      throw new Error(
        'Razorpay credentials not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET environment variables.'
      );
    }
    _razorpay = new Razorpay({
      key_id: config.razorpay.keyId,
      key_secret: config.razorpay.keySecret,
    });
  }
  return _razorpay;
};

/**
 * Create a Razorpay order (for customer checkout)
 * @param {number} amount - Amount in INR (rupees, not paise)
 * @param {string} receipt - Unique receipt ID (order number)
 * @param {object} transfers - Optional split payment config
 */
const createOrder = async (amount, receipt, transfers = null) => {
  const options = {
    amount: Math.round(amount * 100), // Convert to paise
    currency: 'INR',
    receipt,
  };

  if (transfers) {
    options.transfers = transfers;
  }

  const order = await getRazorpayInstance().orders.create(options);
  return order;
};

/**
 * Create a Razorpay linked account for vendor (Route)
 */
const createLinkedAccount = async (vendorData) => {
  // Note: Razorpay Route linked accounts require activation on your Razorpay dashboard
  // This is a placeholder for when Route is enabled
  return { id: 'acc_placeholder', status: 'created' };
};

/**
 * Fetch payment details
 */
const fetchPayment = async (paymentId) => {
  return getRazorpayInstance().payments.fetch(paymentId);
};

/**
 * Process refund
 */
const refund = async (paymentId, amount, notes = {}) => {
  return getRazorpayInstance().payments.refund(paymentId, {
    amount: Math.round(amount * 100), // paise
    notes,
  });
};

/**
 * Constant-time string comparison that won't throw on length mismatch.
 */
const timingSafeEqual = (a, b) => {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
};

/**
 * Whether Razorpay credentials (key id + secret) are configured.
 */
const isConfigured = () => Boolean(config.razorpay.keyId && config.razorpay.keySecret);

/**
 * Verify the checkout signature the client returns after payment.
 * signature = HMAC_SHA256(`${razorpay_order_id}|${razorpay_payment_id}`, key_secret)
 * @returns {boolean}
 */
const verifyPaymentSignature = ({ razorpay_order_id, razorpay_payment_id, razorpay_signature }) => {
  if (!config.razorpay.keySecret) return false;
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) return false;
  const expected = crypto
    .createHmac('sha256', config.razorpay.keySecret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');
  return timingSafeEqual(expected, razorpay_signature);
};

/**
 * Verify a Razorpay webhook signature over the RAW request body (not
 * re-serialized JSON — key order/spacing would change the HMAC).
 * @param {string|Buffer} rawBody - exact bytes received
 * @param {string} signature - X-Razorpay-Signature header value
 * @returns {boolean}
 */
const verifyWebhookSignature = (rawBody, signature) => {
  if (!config.razorpay.webhookSecret || !signature || rawBody == null) return false;
  const expected = crypto
    .createHmac('sha256', config.razorpay.webhookSecret)
    .update(typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8'))
    .digest('hex');
  return timingSafeEqual(expected, signature);
};

module.exports = {
  getRazorpayInstance,
  createOrder,
  createLinkedAccount,
  fetchPayment,
  refund,
  isConfigured,
  verifyPaymentSignature,
  verifyWebhookSignature,
};
