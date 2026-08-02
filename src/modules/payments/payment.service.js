const { BadRequestError } = require('../../shared/errors');

/**
 * Payment service - Razorpay integration wrapper
 * Public interface for other modules:
 *   paymentService.createOrder(amount, transfers)
 *   paymentService.refund(paymentId, amount)
 */

/**
 * Create Razorpay order with Route (split payments)
 */
const createOrder = async (amount, vendorAccountId) => {
  // TODO: razorpay.orders.create({
  //   amount: amount * 100, // paise
  //   currency: 'INR',
  //   transfers: [{ account: vendorAccountId, amount: vendorAmount }]
  // })
  return { razorpay_order_id: 'order_placeholder', amount };
};

/**
 * Verify payment signature after checkout
 */
const verifyPayment = async ({ razorpay_order_id, razorpay_payment_id, razorpay_signature }) => {
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    throw new BadRequestError('Payment verification data incomplete');
  }

  // TODO: Verify HMAC signature using Razorpay key secret
  // const generated = crypto.createHmac('sha256', config.razorpay.keySecret)
  //   .update(razorpay_order_id + '|' + razorpay_payment_id)
  //   .digest('hex');
  // if (generated !== razorpay_signature) throw new BadRequestError('Payment verification failed');

  // TODO: Update order payment_status to 'paid'

  return { verified: true, payment_id: razorpay_payment_id };
};

/**
 * Handle Razorpay webhook events
 */
const handleWebhook = async (payload, signature) => {
  // TODO: Verify webhook signature
  // TODO: Handle events: payment.captured, payment.failed, refund.processed
  return true;
};

/**
 * Process refund
 */
const refund = async (paymentId, amount) => {
  // TODO: razorpay.payments.refund(paymentId, { amount: amount * 100 })
  return { refund_id: 'rfnd_placeholder', amount };
};

module.exports = { createOrder, verifyPayment, handleWebhook, refund };
