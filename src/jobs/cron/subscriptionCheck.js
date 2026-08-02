const { prisma } = require('../../shared/database');

/**
 * Subscription Lifecycle Cron Job
 * Run every hour: checks for expired trials, grace periods, and hides stores
 *
 * Lifecycle (from PRD 7.10.1):
 *   TRIAL (14 days) → ACTIVE (paid) → GRACE (7 days if payment fails) → EXPIRED (store hidden)
 */

const runSubscriptionCheck = async () => {
  const now = new Date();
  console.log(`[Cron] Subscription check started at ${now.toISOString()}`);

  let trialExpired = 0;
  let graceExpired = 0;
  let trialWarnings = 0;

  // 1. Expire trials that have passed trialEndsAt
  const expiredTrials = await prisma.subscription.findMany({
    where: { status: 'TRIAL', trialEndsAt: { lte: now } },
    include: { store: { select: { id: true, name: true, ownerId: true } } },
  });

  for (const sub of expiredTrials) {
    await prisma.subscription.update({ where: { id: sub.id }, data: { status: 'EXPIRED' } });
    // Hide store from customers
    await prisma.store.update({ where: { id: sub.storeId }, data: { status: 'DEACTIVATED' } });
    // Notify vendor
    await prisma.notification.create({
      data: {
        userId: sub.store.ownerId,
        title: 'Trial Expired',
        body: 'Your free trial has ended. Subscribe to keep your store visible.',
        type: 'subscription',
        data: { storeId: sub.storeId },
      },
    });
    trialExpired++;
  }

  // 2. Warn trials expiring in 3 days
  const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const expiringTrials = await prisma.subscription.findMany({
    where: {
      status: 'TRIAL',
      trialEndsAt: { gt: now, lte: threeDaysFromNow },
    },
    include: { store: { select: { ownerId: true } } },
  });

  for (const sub of expiringTrials) {
    // Only notify once (check if already notified today)
    const existingNotif = await prisma.notification.findFirst({
      where: {
        userId: sub.store.ownerId,
        type: 'subscription',
        title: 'Trial Expiring Soon',
        createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
      },
    });

    if (!existingNotif) {
      const daysLeft = Math.ceil((sub.trialEndsAt - now) / (24 * 60 * 60 * 1000));
      await prisma.notification.create({
        data: {
          userId: sub.store.ownerId,
          title: 'Trial Expiring Soon',
          body: `Your free trial expires in ${daysLeft} day(s). Subscribe now to continue.`,
          type: 'subscription',
          data: { storeId: sub.storeId, daysLeft },
        },
      });
      trialWarnings++;
    }
  }

  // 3. Move ACTIVE subscriptions past currentPeriodEnd to GRACE
  const expiredActive = await prisma.subscription.findMany({
    where: { status: 'ACTIVE', currentPeriodEnd: { lte: now } },
    include: { store: { select: { ownerId: true } } },
  });

  for (const sub of expiredActive) {
    await prisma.subscription.update({ where: { id: sub.id }, data: { status: 'GRACE' } });
    await prisma.notification.create({
      data: {
        userId: sub.store.ownerId,
        title: 'Payment Due',
        body: 'Your subscription payment is overdue. You have 7 days to renew.',
        type: 'subscription',
      },
    });
  }

  // 4. Expire GRACE subscriptions after 7 days past currentPeriodEnd
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const expiredGrace = await prisma.subscription.findMany({
    where: { status: 'GRACE', currentPeriodEnd: { lte: sevenDaysAgo } },
    include: { store: { select: { id: true, ownerId: true } } },
  });

  for (const sub of expiredGrace) {
    await prisma.subscription.update({ where: { id: sub.id }, data: { status: 'EXPIRED' } });
    await prisma.store.update({ where: { id: sub.storeId }, data: { status: 'DEACTIVATED' } });
    await prisma.notification.create({
      data: {
        userId: sub.store.ownerId,
        title: 'Subscription Expired',
        body: 'Your subscription has expired. Your store is now hidden. Renew to reactivate.',
        type: 'subscription',
      },
    });
    graceExpired++;
  }

  console.log(`[Cron] Subscription check complete: ${trialExpired} trials expired, ${graceExpired} grace expired, ${trialWarnings} warnings sent`);

  return { trialExpired, graceExpired, trialWarnings };
};

module.exports = { runSubscriptionCheck };
