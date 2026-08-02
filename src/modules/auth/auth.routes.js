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
 *                 example: "+919876543210"
 *     responses:
 *       200:
 *         description: OTP sent
 *       429:
 *         description: Rate limited
 */
router.post('/send-otp', asyncHandler(authController.sendOtp));

/**
 * @swagger
 * /api/v1/auth/verify-otp:
 *   post:
 *     summary: Verify OTP and get auth tokens
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
 *                 example: "+919876543210"
 *               otp:
 *                 type: string
 *                 example: "123456"
 *     responses:
 *       200:
 *         description: OTP verified, tokens returned
 *       401:
 *         description: Invalid OTP
 */
router.post('/verify-otp', asyncHandler(authController.verifyOtp));

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
