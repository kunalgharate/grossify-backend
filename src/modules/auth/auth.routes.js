const express = require('express');
const router = express.Router();
const authController = require('./auth.controller');
const { asyncHandler } = require('../../shared/utils/asyncHandler');

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
 *       **Demo Mode:** When MSG91_AUTH_KEY is not configured (or set to 'xxx'/'demo'),
 *       the API runs in demo mode — no real SMS is sent and the OTP is always `123456`.
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
 */
router.post('/send-otp', asyncHandler(authController.sendOtp));

/**
 * @swagger
 * /api/v1/auth/verify-otp:
 *   post:
 *     summary: Verify OTP and get auth tokens
 *     description: |
 *       Verifies the OTP sent to the phone number. If the user doesn't exist, a new account is created automatically.
 *       Returns JWT access and refresh tokens on success.
 *       
 *       **Demo Mode:** Use OTP `123456` when MSG91_AUTH_KEY is not configured.
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
 *                 description: 6-digit OTP (use 123456 in demo mode)
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
 */
router.post('/verify-otp', asyncHandler(authController.verifyOtp));

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
 *       **Demo Mode:** When MSG91_AUTH_KEY is not configured, any token is accepted
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
router.post('/verify-widget-token', asyncHandler(authController.verifyWidgetToken));

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

module.exports = router;
