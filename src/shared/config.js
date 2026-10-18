require('dotenv').config();

const trustProxyHops = process.env.TRUST_PROXY_HOPS === undefined
  ? 0
  : Number(process.env.TRUST_PROXY_HOPS);

if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0) {
  throw new Error('TRUST_PROXY_HOPS must be a non-negative integer');
}

const normalizeDemoOtpPhone = (phone) => {
  let digits = phone.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) {
    throw new Error(`Invalid phone number in DEMO_OTP_ALLOWED_PHONES: ${phone}`);
  }
  if (digits.length === 10) digits = `91${digits}`;
  return `+${digits}`;
};

const demoOtpAllowedPhones = (process.env.DEMO_OTP_ALLOWED_PHONES || '')
  .split(',')
  .map((phone) => phone.trim())
  .filter(Boolean)
  .map(normalizeDemoOtpPhone);
const demoOtpEnabled = process.env.DEMO_OTP_ENABLED === 'true';

if (demoOtpEnabled && demoOtpAllowedPhones.length === 0) {
  throw new Error('DEMO_OTP_ALLOWED_PHONES must contain at least one phone when DEMO_OTP_ENABLED=true');
}

const config = {
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  trustProxyHops,
  demoOtpEnabled,
  demoOtpAllowedPhones,
  // Platform economics: no commission on merchant sales (subscription model);
  // Grossify's only order-level cut is on GROSSIFY-fulfilled delivery.
  delivery: {
    commissionPct: parseFloat(process.env.DELIVERY_COMMISSION_PCT) || 5,
    minFeePerSide: parseFloat(process.env.DELIVERY_MIN_FEE_PER_SIDE) || 20,
  },
  database: {
    url: process.env.DATABASE_URL,
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID,
    keySecret: process.env.RAZORPAY_KEY_SECRET,
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
    // RazorpayX (payouts) — the source account money is paid out FROM.
    xAccountNumber: process.env.RAZORPAYX_ACCOUNT_NUMBER,
    // Razorpay Route (linked accounts + transfers) toggle.
    routeEnabled: process.env.RAZORPAY_ROUTE_ENABLED === 'true',
  },
  msg91: {
    authKey: process.env.MSG91_AUTH_KEY,
    senderId: process.env.MSG91_SENDER_ID || 'GROSFY',
    otpTemplateId: process.env.MSG91_OTP_TEMPLATE_ID || '',
  },
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID,
    // Legacy FCM server key (simplest). If absent, push runs in demo mode.
    serverKey: process.env.FCM_SERVER_KEY,
  },
  meilisearch: {
    host: process.env.MEILISEARCH_HOST || 'http://localhost:7700',
    apiKey: process.env.MEILISEARCH_API_KEY,
  },
  // E-invoice / e-way bill via a GSP/IRP provider (e.g. Masters India, ClearTax,
  // GSTZen). Only active when a base URL + key are configured.
  einvoice: {
    baseUrl: process.env.EINVOICE_BASE_URL,
    apiKey: process.env.EINVOICE_API_KEY,
    gstin: process.env.EINVOICE_GSTIN,
    // Turnover threshold (₹) above which e-invoice is mandatory.
    thresholdInr: Number(process.env.EINVOICE_THRESHOLD_INR || 50000000),
  },
  // Shipping/courier aggregator (Shiprocket / Delhivery / DTDC / India Post).
  courier: {
    provider: process.env.COURIER_PROVIDER || 'shiprocket',
    baseUrl: process.env.COURIER_BASE_URL,
    apiKey: process.env.COURIER_API_KEY,
    email: process.env.COURIER_EMAIL,
    password: process.env.COURIER_PASSWORD,
    webhookSecret: process.env.COURIER_WEBHOOK_SECRET,
  },
  // Google Maps Platform (routing/ETA for delivery assignment).
  maps: {
    apiKey: process.env.GOOGLE_MAPS_API_KEY,
  },
  app: {
    name: process.env.APP_NAME || 'Grossify',
    url: process.env.APP_URL || 'http://localhost:3000',
  },
};

module.exports = config;
