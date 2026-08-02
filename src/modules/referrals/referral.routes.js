const express = require('express');
const router = express.Router();
const { prisma } = require('../../shared/database');
const { asyncHandler } = require('../../shared/utils/asyncHandler');
const { authenticate } = require('../../shared/middleware/auth');
const { BadRequestError, NotFoundError } = require('../../shared/errors');
const crypto = require('crypto');

/**
 * @swagger
 * tags:
 *   name: Referrals
 *   description: Referral program and wallet
 */

/**
 * @swagger
 * /api/v1/referrals/my-code:
 *   get:
 *     summary: Get user's referral code (generate if not exists)
 *     tags: [Referrals]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Referral code
 */
router.get('/my-code', authenticate, asyncHandler(async (req, res) => {
  let user = await prisma.user.findUnique({ where: { id: req.user.id }, select: { referralCode: true } });

  if (!user.referralCode) {
    const code = crypto.randomBytes(3).toString('hex').toUpperCase();
    user = await prisma.user.update({
      where: { id: req.user.id },
      data: { referralCode: code },
      select: { referralCode: true },
    });
  }

  res.json({ referralCode: user.referralCode });
}));

/**
 * @swagger
 * /api/v1/referrals/apply:
 *   post:
 *     summary: Apply a referral code (during/after registration)
 *     tags: [Referrals]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [referralCode]
 *             properties:
 *               referralCode:
 *                 type: string
 *                 example: "A1B2C3"
 *     responses:
 *       200:
 *         description: Referral applied
 *       400:
 *         description: Invalid or already used
 */
router.post('/apply', authenticate, asyncHandler(async (req, res) => {
  const { referralCode } = req.body;
  if (!referralCode) throw new BadRequestError('Referral code is required');

  const currentUser = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (currentUser.referredBy) throw new BadRequestError('You have already used a referral code');

  // Find referrer
  const referrer = await prisma.user.findFirst({ where: { referralCode: referralCode.toUpperCase() } });
  if (!referrer) throw new BadRequestError('Invalid referral code');
  if (referrer.id === req.user.id) throw new BadRequestError('Cannot refer yourself');

  // Link referral
  await prisma.user.update({ where: { id: req.user.id }, data: { referredBy: referrer.id } });

  // Credit ₹100 to referee wallet (first order discount)
  await creditWallet(req.user.id, 100, 'Referral signup bonus', `ref_${referrer.id}`);

  // Track reward for referrer (credited when referee places first order)
  await prisma.referralReward.create({
    data: {
      referrerId: referrer.id,
      refereeId: req.user.id,
      type: 'customer_referral',
      status: 'pending',
      rewardAmount: 50,
    },
  });

  res.json({ message: 'Referral applied! ₹100 added to your wallet.' });
}));

/**
 * @swagger
 * /api/v1/referrals/wallet:
 *   get:
 *     summary: Get wallet balance and transactions
 *     tags: [Referrals]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Wallet details
 */
router.get('/wallet', authenticate, asyncHandler(async (req, res) => {
  const { page = 1 } = req.query;
  const pageNum = parseInt(page);

  let wallet = await prisma.wallet.findUnique({ where: { userId: req.user.id } });
  if (!wallet) {
    wallet = await prisma.wallet.create({ data: { userId: req.user.id, balance: 0 } });
  }

  const transactions = await prisma.walletTransaction.findMany({
    where: { walletId: wallet.id },
    skip: (pageNum - 1) * 20, take: 20,
    orderBy: { createdAt: 'desc' },
  });

  res.json({ balance: wallet.balance, transactions });
}));

/**
 * @swagger
 * /api/v1/referrals/stats:
 *   get:
 *     summary: Get referral stats (how many referred, earned)
 *     tags: [Referrals]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Referral statistics
 */
router.get('/stats', authenticate, asyncHandler(async (req, res) => {
  const [totalReferrals, credited, pending] = await Promise.all([
    prisma.referralReward.count({ where: { referrerId: req.user.id } }),
    prisma.referralReward.count({ where: { referrerId: req.user.id, status: 'credited' } }),
    prisma.referralReward.count({ where: { referrerId: req.user.id, status: 'pending' } }),
  ]);

  const earned = await prisma.referralReward.aggregate({
    where: { referrerId: req.user.id, status: 'credited' },
    _sum: { rewardAmount: true },
  });

  res.json({
    stats: {
      totalReferrals,
      credited,
      pending,
      totalEarned: earned._sum.rewardAmount || 0,
    },
  });
}));

// ─── Helper ───────────────────────────────────────────────

async function creditWallet(userId, amount, description, referenceId = null) {
  let wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (!wallet) {
    wallet = await prisma.wallet.create({ data: { userId, balance: 0 } });
  }

  await prisma.wallet.update({ where: { id: wallet.id }, data: { balance: { increment: amount } } });
  await prisma.walletTransaction.create({
    data: { walletId: wallet.id, amount, type: 'credit', description, referenceId },
  });
}

module.exports = router;
