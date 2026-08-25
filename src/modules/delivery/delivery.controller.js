const deliveryService = require('./delivery.service');

/** GET /delivery/available — orders ready for pickup, unclaimed. */
const getAvailable = async (req, res) => {
  const orders = await deliveryService.getAvailable();
  res.json({ orders, count: orders.length });
};

/** POST /delivery/:orderId/accept — claim + move READY→PICKED. */
const accept = async (req, res) => {
  const order = await deliveryService.accept(req.params.orderId, req.user);
  res.json({ order, message: 'Delivery accepted, navigate to store for pickup' });
};

/** POST /delivery/:orderId/delivered — complete PICKED→DELIVERED. */
const markDelivered = async (req, res) => {
  const order = await deliveryService.markDelivered(req.params.orderId, req.user);
  res.json({ order, message: 'Order delivered successfully' });
};

/** GET /delivery/my-deliveries — the agent's deliveries (optional status). */
const myDeliveries = async (req, res) => {
  const { deliveries, pagination } = await deliveryService.listMyDeliveries(req.user, {
    status: req.query.status,
    page: req.query.page,
  });
  res.json({ deliveries, pagination });
};

/** GET /delivery/earnings — flat-fee earnings summary. */
const earnings = async (req, res) => {
  const earnings = await deliveryService.getEarnings(req.user);
  res.json({ earnings });
};

module.exports = { getAvailable, accept, markDelivered, myDeliveries, earnings };
