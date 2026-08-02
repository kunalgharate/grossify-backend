const { prisma } = require('../../shared/database');
const { NotFoundError } = require('../../shared/errors');

const getById = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, phone: true, status: true, createdAt: true },
  });
  if (!user) throw new NotFoundError('User not found');
  return user;
};

const update = async (userId, data) => {
  const allowedFields = ['name', 'email'];
  const updateData = {};
  for (const field of allowedFields) {
    if (data[field] !== undefined) updateData[field] = data[field];
  }

  return prisma.user.update({
    where: { id: userId },
    data: updateData,
    select: { id: true, name: true, email: true, phone: true, status: true },
  });
};

const getAddresses = async (userId) => {
  return prisma.address.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
};

const addAddress = async (userId, data) => {
  const { label, fullAddress, landmark, city, pincode, latitude, longitude, isDefault } = data;

  // If isDefault, unset previous default
  if (isDefault) {
    await prisma.address.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
  }

  return prisma.address.create({
    data: { userId, label: label || 'Home', fullAddress, landmark, city, pincode, latitude, longitude, isDefault: isDefault || false },
  });
};

const deleteAddress = async (userId, addressId) => {
  const address = await prisma.address.findFirst({ where: { id: addressId, userId } });
  if (!address) throw new NotFoundError('Address not found');
  await prisma.address.delete({ where: { id: addressId } });
  return true;
};

module.exports = { getById, update, getAddresses, addAddress, deleteAddress };
