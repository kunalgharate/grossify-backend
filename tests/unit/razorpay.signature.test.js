// Configure credentials BEFORE requiring the service — config.js reads
// process.env once at module load, and dotenv.config() never overrides values
// already present in process.env, so these win.
process.env.RAZORPAY_KEY_ID = 'rzp_test_key';
process.env.RAZORPAY_KEY_SECRET = 'test_secret_123';
process.env.RAZORPAY_WEBHOOK_SECRET = 'whsec_test_456';

const crypto = require('crypto');
const razorpayService = require('../../src/modules/payments/razorpay.service');

const hmac = (data, secret) =>
  crypto.createHmac('sha256', secret).update(data).digest('hex');

/**
 * Pure, DB-free unit tests for Razorpay signature verification. These are the
 * security-critical checks that stop a client from forging a "paid" callback,
 * so we test both the accept and (especially) the reject paths.
 */
describe('razorpay.service signature verification', () => {
  describe('isConfigured', () => {
    it('is true when key id + secret are set', () => {
      expect(razorpayService.isConfigured()).toBe(true);
    });
  });

  describe('verifyPaymentSignature', () => {
    const razorpay_order_id = 'order_ABC123';
    const razorpay_payment_id = 'pay_XYZ789';

    it('accepts a correctly computed signature', () => {
      const razorpay_signature = hmac(
        `${razorpay_order_id}|${razorpay_payment_id}`,
        'test_secret_123'
      );
      expect(
        razorpayService.verifyPaymentSignature({
          razorpay_order_id,
          razorpay_payment_id,
          razorpay_signature,
        })
      ).toBe(true);
    });

    it('rejects a tampered signature', () => {
      expect(
        razorpayService.verifyPaymentSignature({
          razorpay_order_id,
          razorpay_payment_id,
          razorpay_signature: 'deadbeef',
        })
      ).toBe(false);
    });

    it('rejects when the payment id is swapped (order|payment binding matters)', () => {
      const razorpay_signature = hmac(
        `${razorpay_order_id}|${razorpay_payment_id}`,
        'test_secret_123'
      );
      expect(
        razorpayService.verifyPaymentSignature({
          razorpay_order_id,
          razorpay_payment_id: 'pay_DIFFERENT',
          razorpay_signature,
        })
      ).toBe(false);
    });

    it('rejects a signature computed with the wrong secret', () => {
      const razorpay_signature = hmac(
        `${razorpay_order_id}|${razorpay_payment_id}`,
        'attacker_secret'
      );
      expect(
        razorpayService.verifyPaymentSignature({
          razorpay_order_id,
          razorpay_payment_id,
          razorpay_signature,
        })
      ).toBe(false);
    });

    it('rejects when required fields are missing', () => {
      expect(razorpayService.verifyPaymentSignature({})).toBe(false);
    });
  });

  describe('verifyWebhookSignature', () => {
    const rawBody = JSON.stringify({ event: 'payment.captured', payload: { x: 1 } });

    it('accepts a signature over the exact raw bytes (string body)', () => {
      const sig = hmac(rawBody, 'whsec_test_456');
      expect(razorpayService.verifyWebhookSignature(rawBody, sig)).toBe(true);
    });

    it('accepts a Buffer raw body', () => {
      const sig = hmac(rawBody, 'whsec_test_456');
      expect(razorpayService.verifyWebhookSignature(Buffer.from(rawBody), sig)).toBe(true);
    });

    it('rejects when the body is altered by even one byte', () => {
      const sig = hmac(rawBody, 'whsec_test_456');
      expect(razorpayService.verifyWebhookSignature(rawBody + ' ', sig)).toBe(false);
    });

    it('rejects a missing signature or body', () => {
      expect(razorpayService.verifyWebhookSignature(rawBody, undefined)).toBe(false);
      expect(razorpayService.verifyWebhookSignature(null, 'sig')).toBe(false);
    });
  });
});
