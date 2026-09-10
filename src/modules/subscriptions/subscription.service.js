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

/**
 * Start a PAID recurring subscription for the store's plan via Razorpay.
 * Creates the Razorpay subscription (demo id when unconfigured), stores
 * razorpaySubId, and returns the mandate URL for the client to complete.
 * Status stays TRIAL/GRACE until the first `subscription.charged` webhook flips
 * it to ACTIVE — so we never mark paid before money moves.
 */
const activatePaid = async (userId, { storeId, planId, billingCycle = 'monthly' }) => {
  const razorpayService = require('../payments/razorpay.service');
  if (!storeId || !planId) throw new BadRequestError('storeId and planId are required');

  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) throw new NotFoundError('Store not found');
  if (store.ownerId !== userId) throw new ForbiddenError('Not your store');

  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan) throw new NotFoundError('Plan not found');

  const amount = billingCycle === 'annual' ? Number(plan.annualPrice) : Number(plan.monthlyPrice);
  const rzpSub = await razorpayService.createSubscription({
    planId, amount, period: billingCycle, storeId,
  });

  const now = new Date();
  const periodEnd = new Date(now.getTime() + (billingCycle === 'annual' ? 365 : 30) * 24 * 60 * 60 * 1000);

  const subscription = await prisma.subscription.upsert({
    where: { storeId },
    update: { planId, billingCycle, razorpaySubId: rzpSub.id, currentPeriodStart: now, currentPeriodEnd: periodEnd },
    create: {
      storeId, planId, status: 'TRIAL', billingCycle, razorpaySubId: rzpSub.id,
      currentPeriodStart: now, currentPeriodEnd: periodEnd,
    },
  });

  return { subscription, razorpaySubId: rzpSub.id, mandateUrl: rzpSub.shortUrl || null, demo: rzpSub.demo || false };
};

/**
 * Apply a Razorpay subscription webhook event to the matching Subscription.
 *   subscription.activated / subscription.charged → ACTIVE (+ extend period)
 *   subscription.halted / subscription.pending    → GRACE
 *   subscription.cancelled / completed            → CANCELLED / EXPIRED
 */
const handleWebhookEvent = async (event, entity) => {
  const razorpaySubId = entity?.id;
  if (!razorpaySubId) return { handled: false };
  const sub = await prisma.subscription.findFirst({ where: { razorpaySubId } });
  if (!sub) return { handled: false };

  let data = null;
  switch (event) {
    case 'subscription.activated':
    case 'subscription.charged': {
      const now = new Date();
      const end = new Date(now.getTime() + (sub.billingCycle === 'annual' ? 365 : 30) * 24 * 60 * 60 * 1000);
      data = { status: 'ACTIVE', currentPeriodStart: now, currentPeriodEnd: end };
      break;
    }
    case 'subscription.halted':
    case 'subscription.pending':
      data = { status: 'GRACE' };
      break;
    case 'subscription.cancelled':
      data = { status: 'CANCELLED', cancelledAt: new Date() };
      break;
    case 'subscription.completed':
      data = { status: 'EXPIRED' };
      break;
    default:
      return { handled: false };
  }
  await prisma.subscription.update({ where: { id: sub.id }, data });
  return { handled: true, status: data.status };
};

module.exports = { getPlans, subscribe, getCurrent, activatePaid, handleWebhookEvent };
