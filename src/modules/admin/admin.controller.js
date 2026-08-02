const { prisma } = require('../../shared/database');
const { NotFoundError } = require('../../shared/errors');

const getDashboard = async (req, res) => {
  const [totalUsers, totalStores, activeStores, pendingStores, totalOrders, totalProducts] = await Promise.all([
    prisma.user.count(),
    prisma.store.count(),
    prisma.store.count({ where: { status: 'ACTIVE' } }),
    prisma.store.count({ where: { status: 'PENDING' } }),
    prisma.order.count(),
    prisma.product.count({ where: { status: 'ACTIVE' } }),
  ]);

  res.json({
    metrics: { totalUsers, totalStores, activeStores, pendingStores, totalOrders, totalProducts },
  });
};

const listStores = async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
  const pageNum = parseInt(page);
  const limitNum = Math.min(parseInt(limit) || 20, 50);
  const where = {};
  if (status) where.status = status;

  const [stores, total] = await Promise.all([
    prisma.store.findMany({
      where, skip: (pageNum - 1) * limitNum, take: limitNum,
      orderBy: { createdAt: 'desc' },
      include: { owner: { select: { id: true, name: true, phone: true } }, category: { select: { name: true } } },
    }),
    prisma.store.count({ where }),
  ]);

  res.json({ stores, pagination: { page: pageNum, limit: limitNum, total, hasNext: pageNum * limitNum < total } });
};

const approveStore = async (req, res) => {
  const store = await prisma.store.findUnique({ where: { id: req.params.id } });
  if (!store) throw new NotFoundError('Store not found');

  const updated = await prisma.store.update({ where: { id: req.params.id }, data: { status: 'ACTIVE' } });
  res.json({ store: updated, message: 'Store approved' });
};

const suspendStore = async (req, res) => {
  const store = await prisma.store.findUnique({ where: { id: req.params.id } });
  if (!store) throw new NotFoundError('Store not found');

  const updated = await prisma.store.update({ where: { id: req.params.id }, data: { status: 'SUSPENDED' } });
  res.json({ store: updated, message: 'Store suspended' });
};

const listUsers = async (req, res) => {
  const { status, search, page = 1, limit = 20 } = req.query;
  const pageNum = parseInt(page);
  const limitNum = Math.min(parseInt(limit) || 20, 50);
  const where = {};
  if (status) where.status = status;
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search } },
      { email: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where, skip: (pageNum - 1) * limitNum, take: limitNum,
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, phone: true, email: true, status: true, createdAt: true },
    }),
    prisma.user.count({ where }),
  ]);

  res.json({ users, pagination: { page: pageNum, limit: limitNum, total, hasNext: pageNum * limitNum < total } });
};

const suspendUser = async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) throw new NotFoundError('User not found');

  const updated = await prisma.user.update({
    where: { id: req.params.id }, data: { status: 'SUSPENDED' },
    select: { id: true, name: true, phone: true, status: true },
  });
  res.json({ user: updated, message: 'User suspended' });
};

const assignRole = async (req, res) => {
  const { roleId } = req.body;
  const userId = req.params.id;

  const role = await prisma.role.findUnique({ where: { id: roleId } });
  if (!role) throw new NotFoundError('Role not found');

  const assignment = await prisma.userRole.upsert({
    where: { userId_roleId: { userId, roleId } },
    update: {},
    create: { userId, roleId, assignedBy: req.user.id },
  });

  res.json({ assignment, message: `Role '${role.name}' assigned` });
};

const listOrders = async (req, res) => {
  const { status, storeId, page = 1, limit = 20 } = req.query;
  const pageNum = parseInt(page);
  const limitNum = Math.min(parseInt(limit) || 20, 50);
  const where = {};
  if (status) where.status = status;
  if (storeId) where.storeId = storeId;

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where, skip: (pageNum - 1) * limitNum, take: limitNum,
      orderBy: { placedAt: 'desc' },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        store: { select: { id: true, name: true } },
      },
    }),
    prisma.order.count({ where }),
  ]);

  res.json({ orders, pagination: { page: pageNum, limit: limitNum, total, hasNext: pageNum * limitNum < total } });
};

const listRoles = async (req, res) => {
  const roles = await prisma.role.findMany({
    include: { rolePerms: { include: { permission: { select: { code: true, name: true } } } } },
  });
  res.json({ roles });
};

const listPermissions = async (req, res) => {
  const permissions = await prisma.permission.findMany({ orderBy: [{ resource: 'asc' }, { action: 'asc' }] });
  res.json({ permissions });
};

const getAuditLogs = async (req, res) => {
  const { userId, action, page = 1, limit = 50 } = req.query;
  const pageNum = parseInt(page);
  const limitNum = Math.min(parseInt(limit) || 50, 100);
  const where = {};
  if (userId) where.userId = userId;
  if (action) where.action = { contains: action };

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where, skip: (pageNum - 1) * limitNum, take: limitNum,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, name: true, phone: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);

  res.json({ logs, pagination: { page: pageNum, limit: limitNum, total } });
};

module.exports = {
  getDashboard, listStores, approveStore, suspendStore,
  listUsers, suspendUser, assignRole, listOrders, listRoles, listPermissions,
  getAuditLogs,
};
