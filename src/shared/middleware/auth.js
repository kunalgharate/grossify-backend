const jwt = require('jsonwebtoken');
const { prisma } = require('../database');
const { UnauthorizedError, ForbiddenError } = require('../errors');
const config = require('../config');

/**
 * Authentication middleware - verifies JWT access token
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('No token provided');
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, config.jwt.secret);

    // Fetch user from DB
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, name: true, phone: true, email: true, status: true },
    });

    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedError('Account is suspended or deactivated');
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return next(new UnauthorizedError('Invalid or expired token'));
    }
    next(err);
  }
};

/**
 * Authorization middleware - checks user permissions (RBAC)
 * @param {string} permissionCode - e.g., 'stores.edit'
 */
const authorize = (permissionCode) => {
  return async (req, res, next) => {
    try {
      const userId = req.user.id;

      // Get user's roles and their permissions
      const userRoles = await prisma.userRole.findMany({
        where: { userId },
        include: {
          role: {
            include: {
              rolePerms: {
                include: { permission: true },
              },
            },
          },
        },
      });

      // Collect all permission codes from roles
      const rolePermissions = new Set();
      for (const ur of userRoles) {
        for (const rp of ur.role.rolePerms) {
          rolePermissions.add(rp.permission.code);
        }
      }

      // Check individual overrides
      const overrides = await prisma.userPermissionOverride.findMany({
        where: { userId },
        include: { permission: true },
      });

      for (const override of overrides) {
        if (override.granted) {
          rolePermissions.add(override.permission.code);
        } else {
          rolePermissions.delete(override.permission.code);
        }
      }

      if (!rolePermissions.has(permissionCode)) {
        throw new ForbiddenError('Insufficient permissions');
      }

      next();
    } catch (err) {
      next(err);
    }
  };
};

module.exports = { authenticate, authorize };
