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
 * Create a Razorpay Route linked (sub) account for a vendor so their sales can
 * be settled directly into their account. Demo mode (no Route creds) returns a
 * synthetic account id so onboarding + split flows are testable.
 *
 * @param {object} v { email, phone, legalName, businessName, storeId }
 * @returns {Promise<{id:string, status:string, demo?:boolean}>}
 */
const createLinkedAccount = async (v = {}) => {
  if (!config.razorpay.routeEnabled || !isConfigured()) {
    return { id: `acc_demo_${v.storeId || Date.now()}`, status: 'created', demo: true };
  }
  try {
    const axios = require('axios');
    const res = await axios.post(
      'https://api.razorpay.com/v2/accounts',
      {
        email: v.email,
        phone: v.phone,
        type: 'route',
        legal_business_name: v.businessName || v.legalName,
        business_type: 'proprietorship',
        contact_name: v.legalName || v.businessName,
        reference_id: v.storeId,
      },
      {
        auth: { username: config.razorpay.keyId, password: config.razorpay.keySecret },
        headers: { 'Content-Type': 'application/json' },
        timeout: 12000,
      }
    );
    return { id: res.data?.id, status: res.data?.status || 'created' };
  } catch (error) {
    console.error('[Razorpay Route] linked account error:', error.response?.data || error.message);
    throw new Error(error.response?.data?.error?.description || 'Linked account creation failed');
  }
};

/**
 * Fetch payment details
 */
const fetchPayment = async (paymentId) => {
  return getRazorpayInstance().payments.fetch(paymentId);
};

/**
 * Process a refund. For Route (split) payments, pass `reverseAll: true` so
 * Razorpay also reverses the linked-account transfer(s) — otherwise the store
 * would keep its share of a refunded order.
 */
const refund = async (paymentId, amount, notes = {}, { reverseAll = false } = {}) => {
  const body = {
    amount: Math.round(amount * 100), // paise
    notes,
  };
  if (reverseAll) body.reverse_all = 1;
  return getRazorpayInstance().payments.refund(paymentId, body);
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
 * Build the Razorpay Route transfers[] for a store sale: the store's goods
 * amount routes to its linked account; platform keeps the rest (fees/delivery).
 * Returns null when Route isn't applicable (no account / zero goods).
 * Pure — safe to unit test.
 *
 * @param {object} p { storeAccountId, goodsAmount } goodsAmount in rupees
 */
const computeRouteTransfers = ({ storeAccountId, goodsAmount, orderNumber, storeId }) => {
  const amt = Math.round(Number(goodsAmount) * 100);
  if (!storeAccountId || !(amt > 0)) return null;
  return [{
    account: storeAccountId,
    amount: amt,
    currency: 'INR',
    notes: { orderNumber: orderNumber || '', storeId: storeId || '' },
    on_hold: false,
  }];
};

/**
 * Create a recurring Razorpay Subscription for a vendor plan. Demo mode (no
 * creds) returns a synthetic subscription id so the flow is testable. In
 * production this creates a Razorpay Plan (if needed) + Subscription; the client
 * completes the mandate via checkout, then webhooks drive activation/charges.
 *
 * @param {object} p { planId, amount, period, storeId, totalCount }
 * @returns {Promise<{id:string, status:string, shortUrl?:string, demo?:boolean}>}
 */
const createSubscription = async ({ planId, amount, period = 'monthly', storeId, totalCount = 120 }) => {
  if (!isConfigured()) {
    return { id: `sub_demo_${storeId || Date.now()}`, status: 'created', demo: true };
  }
  try {
    const instance = getRazorpayInstance();
    // A Razorpay Plan is required to attach a Subscription; create one per call
    // (idempotency via your own plan cache is a production optimization).
    const rzpPlan = await instance.plans.create({
      period: period === 'annual' ? 'yearly' : 'monthly',
      interval: 1,
      item: { name: `Grossify ${period} plan`, amount: Math.round(amount * 100), currency: 'INR' },
    });
    const sub = await instance.subscriptions.create({
      plan_id: rzpPlan.id,
      total_count: totalCount,
      customer_notify: 1,
      notes: { storeId: storeId || '', grossifyPlanId: planId || '' },
    });
    return { id: sub.id, status: sub.status, shortUrl: sub.short_url };
  } catch (error) {
    console.error('[Razorpay] subscription error:', error.error?.description || error.message);
    // In non-production, a failing/invalid test key should not block the flow —
    // fall back to a demo subscription so local E2E works (mirrors dev tolerance
    // elsewhere). Production still surfaces the error.
    if (config.nodeEnv !== 'production') {
      return { id: `sub_demo_${storeId || Date.now()}`, status: 'created', demo: true };
    }
    throw new Error(error.error?.description || 'Subscription creation failed');
  }
};

/**
 * Whether Razorpay credentials (key id + secret) are configured.
 */
const isConfigured = () => Boolean(config.razorpay.keyId && config.razorpay.keySecret);

/**
 * Whether RazorpayX payouts are configured (needs credentials + source account).
 */
const isPayoutConfigured = () =>
  isConfigured() && Boolean(config.razorpay.xAccountNumber);

/**
 * Disburse a payout via the RazorpayX Payouts API (to a fund account / UPI /
 * bank). Runs in DEMO mode when RazorpayX isn't configured — returns a synthetic
 * reference so settlement flows are testable without live payout credentials
 * (mirrors the msg91/fcm demo pattern). Never throws into the settlement loop;
 * returns a status object.
 *
 * @param {object} p
 * @param {number} p.amount      INR (rupees)
 * @param {string} p.referenceId internal reference (e.g. agent/settlement id)
 * @param {string} [p.mode='UPI'] payout mode
 * @param {object} [p.fundAccount] RazorpayX fund_account_id or details
 * @returns {Promise<{success:boolean, payoutId:string|null, status:string, demo?:boolean, message?:string}>}
 */
const payout = async ({ amount, referenceId, mode = 'UPI', fundAccountId = null, narration = 'Grossify payout' }) => {
  if (!(amount > 0)) return { success: false, payoutId: null, status: 'failed', message: 'Amount must be > 0' };

  if (!isPayoutConfigured()) {
    // DEMO: no RazorpayX creds — synthesize a reference so settlement can proceed.
    const demoId = `pout_demo_${referenceId || Date.now()}`;
    return { success: true, payoutId: demoId, status: 'demo', demo: true };
  }

  try {
    const axios = require('axios');
    const res = await axios.post(
      'https://api.razorpay.com/v1/payouts',
      {
        account_number: config.razorpay.xAccountNumber,
        amount: Math.round(amount * 100), // paise
        currency: 'INR',
        mode,
        purpose: 'payout',
        fund_account_id: fundAccountId,
        reference_id: referenceId,
        narration,
        queue_if_low_balance: true,
      },
      {
        auth: { username: config.razorpay.keyId, password: config.razorpay.keySecret },
        headers: { 'Content-Type': 'application/json' },
        timeout: 12000,
      }
    );
    return { success: true, payoutId: res.data?.id || null, status: res.data?.status || 'queued' };
  } catch (error) {
    console.error('[RazorpayX] payout error:', error.response?.data || error.message);
    return { success: false, payoutId: null, status: 'failed', message: error.response?.data?.error?.description || 'payout failed' };
  }
};

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
  isPayoutConfigured,
  payout,
  computeRouteTransfers,
  createSubscription,
  verifyPaymentSignature,
  verifyWebhookSignature,
};
