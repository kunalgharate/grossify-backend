const { prisma } = require('../../shared/database');

/**
 * Abandoned Cart Recovery Cron Job
 * Run every hour: sends reminders for abandoned carts
 *
 * Strategy (from PRD 7.11.4):
 *   After 2 hours: Push "Items waiting in your cart!"
 *   After 24 hours: Push + "Complete order, get 10% off"
 *   After 7 days: Cart items expire (deleted)
 */

const runAbandonedCartRecovery = async () => {
  const now = new Date();
  console.log(`[Cron] Abandoned cart check started at ${now.toISOString()}`);

  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  let reminders2h = 0;
  let reminders24h = 0;
  let expired = 0;

  // 1. 2-hour reminder (cart updated > 2 hours ago, < 24 hours)
  const carts2h = await prisma.cart.findMany({
    where: {
      updatedAt: { gt: twentyFourHoursAgo, lte: twoHoursAgo },
      items: { some: {} },
    },
    include: { user: { select: { id: true } }, store: { select: { name: true } }, items: true },
  });

  for (const cart of carts2h) {
    const existing = await prisma.notification.findFirst({
      where: {
        userId: cart.userId,
        type: 'cart_reminder',
        createdAt: { gte: twoHoursAgo },
      },
    });

    if (!existing) {
      await prisma.notification.create({
        data: {
          userId: cart.userId,
          title: 'Items waiting in your cart!',
          body: `You have ${cart.items.length} item(s) from ${cart.store.name}. Complete your order!`,
          type: 'cart_reminder',
          data: { storeId: cart.storeId, cartId: cart.id },
        },
      });
      reminders2h++;
    }
  }

  // 2. 24-hour reminder with discount nudge
  const carts24h = await prisma.cart.findMany({
    where: {
      updatedAt: { gt: sevenDaysAgo, lte: twentyFourHoursAgo },
      items: { some: {} },
    },
    include: { user: { select: { id: true } }, store: { select: { name: true } } },
  });

  for (const cart of carts24h) {
    const existing = await prisma.notification.findFirst({
      where: {
        userId: cart.userId,
        type: 'cart_reminder',
        title: { contains: '10% off' },
        createdAt: { gte: twentyFourHoursAgo },
      },
    });

    if (!existing) {
      await prisma.notification.create({
        data: {
          userId: cart.userId,
          title: 'Complete your order & get 10% off!',
          body: `Your cart from ${cart.store.name} is waiting. Use code COMEBACK10.`,
          type: 'cart_reminder',
          data: { storeId: cart.storeId, cartId: cart.id },
        },
      });
      reminders24h++;
    }
  }

  // 3. Delete carts older than 7 days
  const oldCarts = await prisma.cart.findMany({
    where: { updatedAt: { lte: sevenDaysAgo } },
  });

  for (const cart of oldCarts) {
    await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    await prisma.cart.delete({ where: { id: cart.id } });
    expired++;
  }

  console.log(`[Cron] Cart recovery: ${reminders2h} 2h reminders, ${reminders24h} 24h reminders, ${expired} carts expired`);
  return { reminders2h, reminders24h, expired };
};

module.exports = { runAbandonedCartRecovery };
