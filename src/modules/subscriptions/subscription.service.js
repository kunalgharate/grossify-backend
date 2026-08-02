const { prisma } = require('../../shared/database');
const { BadRequestError, NotFoundError, ForbiddenError } = require('../../shared/errors');

/**
 * Get plans, optionally filtered by category type
 */
const getPlans = async (categoryType) => {
  const where = { isActive: true };
  if (categoryType) where.categoryType = categoryType;

  return prisma.plan.findMany({ where, orderBy: [{ categoryType: 'asc' }, { sortOrder: 'asc' }] });
};

/**
 * Subscribe store to a plan (starts with 14-day trial)
 */
const subscribe = async (userId, { planId, storeId, billingCycle = 'monthly' }) => {
  if (!planId || !storeId) throw new BadRequestError('planId and storeId are required');

  // Verify store ownership
  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) throw new NotFoundError('Store not found');
  if (store.ownerId !== userId) throw new ForbiddenError('Not your store');

  // Check no existing active subscription
  const existing = await prisma.subscription.findUnique({ where: { storeId } });
  if (existing && ['TRIAL', 'ACTIVE'].includes(existing.status)) {
    throw new BadRequestError('Store already has an active subscription');
  }

  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan) throw new NotFoundError('Plan not found');

  const now = new Date();
  const trialEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000); // 14 days

  const subscription = await prisma.subscription.upsert({
    where: { storeId },
    update: {
      planId,
      status: 'TRIAL',
      billingCycle,
      currentPeriodStart: now,
      currentPeriodEnd: trialEnd,
      trialEndsAt: trialEnd,
    },
    create: {
      storeId,
      planId,
      status: 'TRIAL',
      billingCycle,
      currentPeriodStart: now,
      currentPeriodEnd: trialEnd,
      trialEndsAt: trialEnd,
    },
  });

  return subscription;
};

/**
 * Get current subscription for a user's store
 */
const getCurrent = async (userId) => {
  const store = await prisma.store.findFirst({ where: { ownerId: userId } });
  if (!store) return null;

  const subscription = await prisma.subscription.findUnique({
    where: { storeId: store.id },
    include: { plan: true },
  });

  return subscription;
};

module.exports = { getPlans, subscribe, getCurrent };
