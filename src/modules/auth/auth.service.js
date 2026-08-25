const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { prisma } = require('../../shared/database');
const { BadRequestError, UnauthorizedError, ConflictError, NotFoundError } = require('../../shared/errors');
const { mapDbRolesToLogical, pickPrimaryRole } = require('../../shared/roles');
const config = require('../../shared/config');
const msg91 = require('./msg91.service');

/**
 * Normalize phone number to consistent format: +<countrycode><number>
 * Handles: "+91 9876543210", "919876543210", "+919876543210", "9876543210"
 */
function normalizePhone(phone) {
  // Remove spaces, dashes, parentheses
  let cleaned = phone.replace(/[\s\-()]/g, '');

  // If starts with +, keep as is
  if (cleaned.startsWith('+')) return cleaned;

  // If starts with country code (91) and is 12 digits, add +
  if (cleaned.length === 12 && cleaned.startsWith('91')) {
    return '+' + cleaned;
  }

  // If 10 digits (Indian local number), prepend +91
  if (cleaned.length === 10) {
    return '+91' + cleaned;
  }

  // Default: prepend + if not present
  return '+' + cleaned;
}

/**
 * Resolve a user's effective roles for client routing and RBAC hints.
 * - "customer" is always included (anyone can shop).
 * - "vendor" is implied by owning at least one store.
 * - "delivery" is implied by having a delivery-agent profile.
 * - staff roles (admin/manager/support/…) come from the RBAC UserRole table.
 * `primaryRole` (highest privilege) drives default post-login routing; `store`
 * gives the vendor app its store context without an extra round-trip.
 */
const resolveUserContext = async (userId) => {
  const [store, deliveryProfile, userRoles] = await Promise.all([
    prisma.store.findFirst({
      where: { ownerId: userId },
      select: { id: true, name: true, slug: true, status: true, logoUrl: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.deliveryAgent.findUnique({ where: { userId }, select: { id: true, status: true } }),
    prisma.userRole.findMany({ where: { userId }, include: { role: { select: { name: true } } } }),
  ]);

  const roles = new Set(['customer']);
  // Reconcile seeded Title-Case DB role names ("Super Admin", "Support Agent",
  // …) to the lowercase logical roles the client routes on. Comparing raw DB
  // names against lowercase strings here was the long-standing bug that left
  // staff without their admin/manager/support role after login.
  const staffLogical = mapDbRolesToLogical(userRoles.map((ur) => ur.role && ur.role.name));
  for (const role of staffLogical) roles.add(role);
  if (store) roles.add('vendor');
  if (deliveryProfile) roles.add('delivery');

  const primaryRole = pickPrimaryRole(roles);

  return { roles: Array.from(roles), primaryRole, store: store || null };
};

/**
 * Register a new user with name, email, phone, password
 */
const register = async ({ name, email, phone, password, role = 'CUSTOMER' }) => {
  if (!phone || !password || !name) {
    throw new BadRequestError('Name, phone, and password are required');
  }

  const normalizedPhone = normalizePhone(phone);

  const existing = await prisma.user.findUnique({ where: { phone: normalizedPhone } });
  if (existing) throw new ConflictError('Phone number already registered');

  if (email) {
    const emailExists = await prisma.user.findFirst({ where: { email } });
    if (emailExists) throw new ConflictError('Email already registered');
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: { name, email: email || null, phone: normalizedPhone, passwordHash, status: 'ACTIVE' },
    select: { id: true, name: true, email: true, phone: true, status: true, createdAt: true },
  });

  const tokens = generateTokens(user.id);
  const context = await resolveUserContext(user.id);
  return { user, ...context, ...tokens };
};

/**
 * Login with phone/email + password
 */
const login = async ({ identifier, password }) => {
  if (!identifier || !password) throw new BadRequestError('Phone/email and password are required');

  // If identifier looks like a phone number, normalize it
  const isPhone = /^[+\d\s\-()]+$/.test(identifier) && identifier.replace(/\D/g, '').length >= 10;
  const normalizedIdentifier = isPhone ? normalizePhone(identifier) : identifier;

  const user = await prisma.user.findFirst({
    where: { OR: [{ phone: normalizedIdentifier }, { email: normalizedIdentifier }] },
  });

  if (!user) throw new UnauthorizedError('Invalid credentials');
  if (user.status !== 'ACTIVE') throw new UnauthorizedError('Account is suspended or deactivated');
  if (!user.passwordHash) throw new UnauthorizedError('Invalid credentials');

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) throw new UnauthorizedError('Invalid credentials');

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  const tokens = generateTokens(user.id);
  const context = await resolveUserContext(user.id);
  return {
    user: { id: user.id, name: user.name, email: user.email, phone: user.phone, status: user.status },
    ...context,
    ...tokens,
  };
};

/**
 * Send OTP via MSG91
 */
const sendOtp = async (phone) => {
  if (!phone) throw new BadRequestError('Phone number is required');

  // Normalize phone: strip spaces, ensure + prefix for Indian numbers
  const normalizedPhone = normalizePhone(phone);
  const result = await msg91.sendOtp(normalizedPhone);

  if (!result.success) {
    throw new BadRequestError(result.message || 'Failed to send OTP');
  }

  return { message: 'OTP sent successfully', phone: normalizedPhone };
};

/**
 * Verify OTP and return tokens (creates user if not exists)
 */
const verifyOtp = async (phone, otp) => {
  if (!phone || !otp) throw new BadRequestError('Phone and OTP are required');

  // Normalize phone for consistent storage/lookup
  const normalizedPhone = normalizePhone(phone);
  const result = await msg91.verifyOtp(normalizedPhone, otp);

  if (!result.success) {
    throw new UnauthorizedError('Invalid or expired OTP');
  }

  // Find or create user
  let user = await prisma.user.findUnique({ where: { phone: normalizedPhone } });
  let isNewUser = false;

  if (!user) {
    user = await prisma.user.create({
      data: { phone: normalizedPhone, status: 'ACTIVE' },
    });
    isNewUser = true;
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  const tokens = generateTokens(user.id);
  const context = await resolveUserContext(user.id);
  return {
    user: { id: user.id, name: user.name, phone: user.phone, isNewUser },
    ...context,
    ...tokens,
  };
};

/**
 * Verify MSG91 Widget token and return auth tokens (creates user if not exists)
 * Used when frontend uses MSG91 OTP Widget instead of direct API
 */
const verifyWidgetToken = async (accessToken) => {
  if (!accessToken) throw new BadRequestError('Access token is required');

  const result = await msg91.verifyWidgetToken(accessToken);

  if (!result.success) {
    throw new UnauthorizedError(result.message || 'Widget token verification failed');
  }

  const phone = result.phone;
  if (!phone) throw new BadRequestError('Could not extract phone number from token');

  // Normalize phone for consistent storage/lookup
  const normalizedPhone = normalizePhone(phone);

  // Find or create user (same as OTP verify flow)
  let user = await prisma.user.findUnique({ where: { phone: normalizedPhone } });
  let isNewUser = false;

  if (!user) {
    user = await prisma.user.create({
      data: { phone: normalizedPhone, status: 'ACTIVE' },
    });
    isNewUser = true;
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  const tokens = generateTokens(user.id);
  const context = await resolveUserContext(user.id);
  return {
    user: { id: user.id, name: user.name, phone: user.phone, isNewUser },
    ...context,
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

/**
 * Return the authenticated user's profile plus resolved role context. Used by
 * the client on app start (token present) to decide customer vs vendor routing.
 */
const me = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, phone: true, status: true, createdAt: true },
  });
  if (!user) throw new NotFoundError('User not found');
  const context = await resolveUserContext(userId);
  return { user, ...context };
};

function generateTokens(userId) {
  const accessToken = jwt.sign({ userId }, config.jwt.secret, { expiresIn: config.jwt.expiresIn });
  const refreshToken = jwt.sign({ userId }, config.jwt.secret + '_refresh', { expiresIn: config.jwt.refreshExpiresIn });
  return { accessToken, refreshToken };
}

module.exports = { register, login, sendOtp, verifyOtp, verifyWidgetToken, refreshToken, logout, me };
