const { prisma } = require('../../shared/database');
const { BadRequestError, NotFoundError, ForbiddenError } = require('../../shared/errors');

/**
 * Store staff — lets a store have MULTIPLE users (owner + managers/cashiers),
 * so a company with many units/employees can give staff login access scoped to
 * a store. Access to a store = you OWN it (Store.ownerId) OR you are an ACTIVE
 * StoreStaff member. Owner-level actions (invite/remove staff, settings) require
 * OWNER or MANAGER.
 *
 * Roles: OWNER | MANAGER | STAFF | CASHIER.
 */

const ROLES = ['OWNER', 'MANAGER', 'STAFF', 'CASHIER'];
const MANAGE_ROLES = ['OWNER', 'MANAGER'];

/** All store ids a user may act on (owned + active staff memberships). */
async function accessibleStoreIds(userId) {
  const [owned, memberships] = await Promise.all([
    prisma.store.findMany({ where: { ownerId: userId }, select: { id: true } }),
    prisma.storeStaff.findMany({ where: { userId, status: 'ACTIVE' }, select: { storeId: true } }),
  ]);
  return [...new Set([...owned.map((s) => s.id), ...memberships.map((m) => m.storeId)])];
}

/** The user's effective role on a store, or null if no access. */
async function roleOnStore(userId, storeId) {
  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { ownerId: true } });
  if (!store) return null;
  if (store.ownerId === userId) return 'OWNER';
  const member = await prisma.storeStaff.findUnique({
    where: { storeId_userId: { storeId, userId } },
    select: { role: true, status: true },
  });
  return member && member.status === 'ACTIVE' ? member.role : null;
}

/** Resolve the store the current user operates (owned first, else first staffed). */
async function resolveActiveStore(userId) {
  const owned = await prisma.store.findFirst({ where: { ownerId: userId } });
  if (owned) return owned;
  const member = await prisma.storeStaff.findFirst({
    where: { userId, status: 'ACTIVE' },
    include: { store: true },
    orderBy: { createdAt: 'asc' },
  });
  return member ? member.store : null;
}

async function requireManage(userId, storeId) {
  const role = await roleOnStore(userId, storeId);
  if (!role || !MANAGE_ROLES.includes(role)) {
    throw new ForbiddenError('Only the owner or a manager can manage staff');
  }
}

/** List staff of a store (manager+). */
async function list(userId, storeId) {
  await requireManage(userId, storeId);
  return prisma.storeStaff.findMany({
    where: { storeId },
    include: { user: { select: { id: true, name: true, phone: true, status: true } } },
    orderBy: { createdAt: 'asc' },
  });
}

/** Invite/add a staff member by phone (manager+). Creates the user if new. */
async function invite(userId, storeId, { phone, role = 'STAFF', name }) {
  await requireManage(userId, storeId);
  if (!phone) throw new BadRequestError('phone is required');
  if (!ROLES.includes(role)) throw new BadRequestError(`Invalid role: ${role}`);
  if (role === 'OWNER') throw new BadRequestError('Cannot assign OWNER via invite');

  let user = await prisma.user.findUnique({ where: { phone } });
  if (!user) user = await prisma.user.create({ data: { phone, name: name || null, status: 'ACTIVE' } });

  if (user.id === userId) throw new BadRequestError('You already have access to this store');

  return prisma.storeStaff.upsert({
    where: { storeId_userId: { storeId, userId: user.id } },
    create: { storeId, userId: user.id, role, status: 'ACTIVE', invitedBy: userId },
    update: { role, status: 'ACTIVE' },
  });
}

/** Remove a staff member (manager+). Owner cannot be removed. */
async function remove(userId, storeId, staffUserId) {
  await requireManage(userId, storeId);
  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { ownerId: true } });
  if (store && store.ownerId === staffUserId) throw new BadRequestError('Cannot remove the store owner');
  await prisma.storeStaff.updateMany({ where: { storeId, userId: staffUserId }, data: { status: 'REMOVED' } });
  return { removed: true };
}

module.exports = { ROLES, accessibleStoreIds, roleOnStore, resolveActiveStore, list, invite, remove };
