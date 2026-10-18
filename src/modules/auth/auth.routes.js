const express = require('express');
const { createHash } = require('crypto');
const router = express.Router();
const { rateLimit } = require('express-rate-limit');
const authController = require('./auth.controller');
const msg91 = require('./msg91.service');
const config = require('../../shared/config');
const { asyncHandler } = require('../../shared/utils/asyncHandler');
const { authenticate } = require('../../shared/middleware/auth');

const OTP_WINDOW_MS = 10 * 60 * 1000;
const otpLimitMessage = (req, res) => {
  const resetTime = req.rateLimit?.resetTime;
  const retryAfterSeconds = resetTime
    ? Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000))
    : Math.ceil(OTP_WINDOW_MS / 1000);
  const retryAfterMinutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  res.setHeader('Retry-After', String(retryAfterSeconds));
  res.status(429).json({
    error: 'TOO_MANY_REQUESTS',
    message: `Too many OTP requests. Try again in about ${retryAfterMinutes} minute${retryAfterMinutes === 1 ? '' : 's'}.`,
    retryAfterSeconds,
  });
};

const phoneKeyGenerator = (req) => {
  let digits = String(req.body?.phone ?? '').replace(/\D/g, '');
  if (digits.length === 10) digits = `91${digits}`;
  return createHash('sha256').update(digits || 'missing-phone').digest('hex');
};

const createOtpLimiter = ({ max, keyGenerator }) => rateLimit({
  windowMs: OTP_WINDOW_MS,
  max,
  ...(keyGenerator ? { keyGenerator } : {}),
  skip: () => config.nodeEnv !== 'production' && msg91.isDemoMode,
  handler: otpLimitMessage,
  standardHeaders: true,
  legacyHeaders: false,
});

// Keep an IP-wide abuse ceiling while avoiding a shared SMS/verification budget
// for every customer behind the same office, carrier, or hosting NAT.
const sendOtpIpLimiter = createOtpLimiter({ max: 20 });
const sendOtpPhoneLimiter = createOtpLimiter({ max: 5, keyGenerator: phoneKeyGenerator });
const verifyOtpIpLimiter = createOtpLimiter({ max: 30 });
const verifyOtpPhoneLimiter = createOtpLimiter({ max: 10, keyGenerator: phoneKeyGenerator });
const widgetOtpIpLimiter = createOtpLimiter({ max: 20 });

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Authentication - Register, Login, OTP, Token management
 */

/**
 * @swagger
 * /api/v1/auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, phone, password]
 *             properties:
 *               name:
 *                 type: string
 *                 example: Kunal Gharate
 *               email:
 *                 type: string
 *                 example: kunal@grossify.in
 *               phone:
 *                 type: string
 *                 example: "+919876543210"
 *               password:
 *                 type: string
 *                 example: Test@1234
 *     responses:
 *       201:
 *         description: User registered successfully
 *       409:
 *         description: Phone or email already registered
 */
router.post('/register', asyncHandler(authController.register));

/**
 * @swagger
 * /api/v1/auth/login:
 *   post:
 *     summary: Login with phone/email and password
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [identifier, password]
 *             properties:
 *               identifier:
 *                 type: string
 *                 description: Phone number or email
 *                 example: "+919876543210"
 *               password:
 *                 type: string
 *                 example: Test@1234
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid credentials
 */
router.post('/login', asyncHandler(authController.login));

/**
 * @swagger
 * /api/v1/auth/send-otp:
 *   post:
 *     summary: Send OTP to phone number (MSG91)
 *     description: |
 *       Sends a 6-digit OTP to the provided phone number via MSG91.
 *       
 *       **Demo Mode:** The API can use OTP `123456` for phones listed in `DEMO_OTP_ALLOWED_PHONES`;
 *       no real SMS is sent. In production this requires the explicit `DEMO_OTP_ENABLED=true` opt-in.
 *       Production limits OTP sends to 5 per phone and 20 per client IP in 10 minutes.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [phone]
 *             properties:
 *               phone:
 *                 type: string
 *                 description: Phone number with country code
 *                 example: "+919876543210"
 *     responses:
 *       200:
 *         description: OTP sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: OTP sent successfully
 *                 phone:
 *                   type: string
 *                   example: "+919876543210"
 *       400:
 *         description: Phone number is required
 *       429:
 *         description: OTP limit reached; retry after the returned Retry-After cooldown
 */
router.post('/send-otp', sendOtpIpLimiter, sendOtpPhoneLimiter, asyncHandler(authController.sendOtp));

/**
 * @swagger
 * /api/v1/auth/verify-otp:
 *   post:
 *     summary: Verify OTP and get auth tokens
 *     description: |
 *       Verifies the OTP sent to the phone number. If the user doesn't exist, a new account is created automatically.
 *       Returns JWT access and refresh tokens on success.
 *       
 *       **Demo Mode:** Use OTP `123456` for allowlisted phones when demo OTP is enabled.
 *       Production limits verification to 10 attempts per phone and 30 per client IP in 10 minutes.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [phone, otp]
 *             properties:
 *               phone:
 *                 type: string
 *                 description: Phone number with country code
 *                 example: "+919876543210"
 *               otp:
 *                 type: string
 *                 description: 6-digit OTP (use 123456 only for allowlisted phones when demo OTP is enabled)
 *                 example: "123456"
 *     responses:
 *       200:
 *         description: OTP verified, tokens returned
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                       nullable: true
 *                     phone:
 *                       type: string
 *                     isNewUser:
 *                       type: boolean
 *                 accessToken:
 *                   type: string
 *                 refreshToken:
 *                   type: string
 *       401:
 *         description: Invalid or expired OTP
 *       429:
 *         description: OTP verification limit reached; retry after the returned Retry-After cooldown
 */
router.post('/verify-otp', verifyOtpIpLimiter, verifyOtpPhoneLimiter, asyncHandler(authController.verifyOtp));

/**
 * @swagger
 * /api/v1/auth/verify-widget-token:
 *   post:
 *     summary: Verify MSG91 OTP Widget access token
 *     description: |
 *       For frontends using the MSG91 OTP Widget (https://msg91.com/otp-widget).
 *       After the user completes OTP verification on the widget, it returns a JWT access token.
 *       Send that token here to authenticate the user and receive app-level JWT tokens.
 *       
 *       **Development Demo Mode:** When MSG91_AUTH_KEY is not configured outside production, any token is accepted
 *       and returns a dummy phone number (919876543210).
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [accessToken]
 *             properties:
 *               accessToken:
 *                 type: string
 *                 description: JWT access token received from MSG91 OTP Widget after successful verification
 *                 example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *     responses:
 *       200:
 *         description: Token verified, user authenticated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                       nullable: true
 *                     phone:
 *                       type: string
 *                     isNewUser:
 *                       type: boolean
 *                 accessToken:
 *                   type: string
 *                   description: Grossify JWT access token
 *                 refreshToken:
 *                   type: string
 *                   description: Grossify JWT refresh token
 *       400:
 *         description: Access token is required or phone could not be extracted
 *       401:
 *         description: Invalid or expired widget token
 */
router.post('/verify-widget-token', widgetOtpIpLimiter, asyncHandler(authController.verifyWidgetToken));

/**
 * @swagger
 * /api/v1/auth/refresh-token:
 *   post:
 *     summary: Refresh access token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: New tokens generated
 *       401:
 *         description: Invalid refresh token
 */
router.post('/refresh-token', asyncHandler(authController.refreshToken));

/**
 * @swagger
 * /api/v1/auth/logout:
 *   post:
 *     summary: Logout (invalidate session)
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Logged out successfully
 */
router.post('/logout', asyncHandler(authController.logout));

/**
 * @swagger
 * /api/v1/auth/me:
 *   get:
 *     summary: Get the authenticated user's profile and resolved roles
 *     description: |
 *       Returns the current user plus their effective roles for client routing.
 *       `primaryRole` is the highest-privilege role (admin > manager > support >
 *       delivery > vendor > customer) and drives default post-login navigation.
 *       `store` is the user's owned store (if any), so the vendor app has its
 *       store context. Call this on app start when a token is already stored.
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user with roles
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   type: object
 *                 roles:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ["customer", "vendor"]
 *                 primaryRole:
 *                   type: string
 *                   example: vendor
 *                 store:
 *                   type: object
 *                   nullable: true
 *       401:
 *         description: Not authenticated
 */
router.get('/me', authenticate, asyncHandler(authController.me));

module.exports = router;
