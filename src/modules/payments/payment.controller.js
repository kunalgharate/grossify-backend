const paymentService = require('./payment.service');

const verify = async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  const result = await paymentService.verifyPayment({
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
  });
  res.status(200).json(result);
};

const handleWebhook = async (req, res) => {
  const signature = req.headers['x-razorpay-signature'];
  await paymentService.handleWebhook(req.body, signature);
  // Always respond 200 to Razorpay webhooks
  res.status(200).json({ status: 'ok' });
};

module.exports = { verify, handleWebhook };
