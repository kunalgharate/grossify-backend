const storeService = require('./store.service');

const getNearby = async (req, res) => {
  const { lat, lng, radius, category, page, limit } = req.query;
  const result = await storeService.findNearby({ lat, lng, radius, category, page, limit });
  res.status(200).json(result);
};

const getById = async (req, res) => {
  const store = await storeService.getById(req.params.id);
  res.status(200).json({ store });
};

const create = async (req, res) => {
  const store = await storeService.create(req.user.id, req.body);
  res.status(201).json({ store, message: 'Store registration submitted for approval' });
};

const update = async (req, res) => {
  const store = await storeService.update(req.params.id, req.user.id, req.body);
  res.status(200).json({ store, message: 'Store updated' });
};

module.exports = { getNearby, getById, create, update };
