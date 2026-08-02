const productService = require('./product.service');

const list = async (req, res) => {
  const { storeId, category, search, page, limit, sort } = req.query;
  const result = await productService.list({ storeId, category, search, page, limit, sort });
  res.status(200).json(result);
};

const getById = async (req, res) => {
  const product = await productService.getById(req.params.id);
  res.status(200).json({ product });
};

const create = async (req, res) => {
  const product = await productService.create(req.user.id, req.body);
  res.status(201).json({ product, message: 'Product created' });
};

const update = async (req, res) => {
  const product = await productService.update(req.params.id, req.user.id, req.body);
  res.status(200).json({ product, message: 'Product updated' });
};

const remove = async (req, res) => {
  await productService.remove(req.params.id, req.user.id);
  res.status(200).json({ message: 'Product deleted' });
};

module.exports = { list, getById, create, update, remove };
