const deliveryService = require('./delivery.service');

const getAvailable = async (req, res) => {
  const { lat, lng } = req.query;
  const orders = await deliveryService.getAvailableOrders(req.user.id, { lat, lng });
  res.status(200).json({ orders });
};

const accept = async (req, res) => {
  const result = await deliveryService.acceptOrder(req.user.id, req.params.orderId);
  res.status(200).json(result);
};

const updateLocation = async (req, res) => {
  const { lat, lng } = req.body;
  await deliveryService.updateLocation(req.user.id, req.params.orderId, { lat, lng });
  res.status(200).json({ message: 'Location updated' });
};

module.exports = { getAvailable, accept, updateLocation };
