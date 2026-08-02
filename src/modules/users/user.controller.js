const userService = require('./user.service');

const getProfile = async (req, res) => {
  const user = await userService.getById(req.user.id);
  res.status(200).json({ user });
};

const updateProfile = async (req, res) => {
  const user = await userService.update(req.user.id, req.body);
  res.status(200).json({ user, message: 'Profile updated' });
};

const getAddresses = async (req, res) => {
  const addresses = await userService.getAddresses(req.user.id);
  res.status(200).json({ addresses });
};

const addAddress = async (req, res) => {
  const address = await userService.addAddress(req.user.id, req.body);
  res.status(201).json({ address, message: 'Address added' });
};

const deleteAddress = async (req, res) => {
  await userService.deleteAddress(req.user.id, req.params.id);
  res.status(200).json({ message: 'Address deleted' });
};

module.exports = { getProfile, updateProfile, getAddresses, addAddress, deleteAddress };
