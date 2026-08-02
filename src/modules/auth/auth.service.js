const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { prisma } = require('../../shared/database');
const { BadRequestError, UnauthorizedError, ConflictError } = require('../../shared/errors');
const config = require('../../shared/config');
const msg91 = require('./msg91.service');

/**
 * Register a new user with name, email, phone, password
 */
const register = async ({ name, email, phone, password, role = 'CUSTOMER' }) => {
  if (!phone || !password || !name) {
    throw new BadRequestError('Name, phone, and password are required');
  }

  const existing = await prisma.user.findUnique({ where: { phone } });
  if (existing) throw new ConflictError('Phone number already registered');

  if (email) {
    const emailExists = await prisma.user.findFirst({ where: { email } });
    if (emailExists) throw new ConflictError('Email already registered');
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: { name, email: email || null, phone, passwordHash, status: 'ACTIVE' },
    select: { id: true, name: true, email: true, phone: true, status: true, createdAt: true },
  });

  const tokens = generateTokens(user.id);
  return { user, ...tokens };
};

/**
 * Login with phone/email + password
 */
const login = async ({ identifier, password }) => {
  if (!identifier || !password) throw new BadRequestError('Phone/email and password are required');

  const user = await prisma.user.findFirst({
    where: { OR: [{ phone: identifier }, { email: identifier }] },
  });

  if (!user) throw new UnauthorizedError('Invalid credentials');
  if (user.status !== 'ACTIVE') throw new UnauthorizedError('Account is suspended or deactivated');
  if (!user.passwordHash) throw new UnauthorizedError('Invalid credentials');

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) throw new UnauthorizedError('Invalid credentials');

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  const tokens = generateTokens(user.id);
  return {
    user: { id: user.id, name: user.name, email: user.email, phone: user.phone, status: user.status },
    ...tokens,
  };
};

/**
 * Send OTP via MSG91
 */
const sendOtp = async (phone) => {
  if (!phone) throw new BadRequestError('Phone number is required');

  const result = await msg91.sendOtp(phone);

  if (!result.success) {
    throw new BadRequestError(result.message || 'Failed to send OTP');
  }

  return { message: 'OTP sent successfully', phone };
};

/**
 * Verify OTP and return tokens (creates user if not exists)
 */
const verifyOtp = async (phone, otp) => {
  if (!phone || !otp) throw new BadRequestError('Phone and OTP are required');

  const result = await msg91.verifyOtp(phone, otp);

  if (!result.success) {
    throw new UnauthorizedError('Invalid or expired OTP');
  }

  // Find or create user
  let user = await prisma.user.findUnique({ where: { phone } });
  let isNewUser = false;

  if (!user) {
    user = await prisma.user.create({
      data: { phone, status: 'ACTIVE' },
    });
    isNewUser = true;
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  const tokens = generateTokens(user.id);
  return {
    user: { id: user.id, name: user.name, phone: user.phone, isNewUser },
    ...tokens,
  };
};

/**
 * Refresh access token
 */
const refreshToken = async (token) => {
  if (!token) throw new BadRequestError('Refresh token is required');

  try {
    const decoded = jwt.verify(token, config.jwt.secret + '_refresh');
    return generateTokens(decoded.userId);
  } catch (err) {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }
};

/**
 * Logout
 */
const logout = async () => {
  return true;
};

function generateTokens(userId) {
  const accessToken = jwt.sign({ userId }, config.jwt.secret, { expiresIn: config.jwt.expiresIn });
  const refreshToken = jwt.sign({ userId }, config.jwt.secret + '_refresh', { expiresIn: config.jwt.refreshExpiresIn });
  return { accessToken, refreshToken };
}

module.exports = { register, login, sendOtp, verifyOtp, refreshToken, logout };
