const orderService = require('./order.service');

const place = async (req, res) => {
  const order = await orderService.place(req.user.id, req.body);
  res.status(201).json(order);
};

const list = async (req, res) => {
  const { page, limit, status } = req.query;
  const result = await orderService.list(req.user.id, { page, limit, status });
  res.status(200).json(result);
};

const getById = async (req, res) => {
  const order = await orderService.getById(req.params.id);
  res.status(200).json({ order });
};

const updateStatus = async (req, res) => {
  const { status } = req.body;
  const order = await orderService.updateStatus(req.params.id, status, req.user.id);
  res.status(200).json({ order, message: 'Order status updated' });
};

const cancel = async (req, res) => {
  const { reason } = req.body;
  const order = await orderService.cancel(req.params.id, req.user.id, reason);
  res.status(200).json({ order, message: 'Order cancelled' });
};

module.exports = { place, list, getById, updateStatus, cancel };
