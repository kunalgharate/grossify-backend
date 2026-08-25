const jwt = require('jsonwebtoken');
const { prisma } = require('../database');
const { UnauthorizedError, ForbiddenError } = require('../errors');
const { mapDbRolesToLogical, STAFF_LOGICAL_ROLES } = require('../roles');
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

/**
 * Coarse RBAC gate — allow the request only if the authenticated user holds at
 * least one of the given logical roles (e.g. 'admin', 'manager', 'support').
 * Must run AFTER `authenticate`. Reads the user's DB UserRole rows and
 * reconciles the seeded Title-Case names to logical roles via the shared
 * mapping, so callers never deal with DB casing. On success it also attaches
 * `req.user.roles` (the resolved logical set) for downstream handlers.
 *
 * Prefer this for tier-level access ("any staff", "admin or manager"). For a
 * single fine-grained capability, use `authorize('<permission.code>')`.
 */
const requireRoles = (...allowed) => {
  return async (req, res, next) => {
    try {
      if (!req.user || !req.user.id) {
        throw new UnauthorizedError('Authentication required');
      }
      const userRoles = await prisma.userRole.findMany({
        where: { userId: req.user.id },
        include: { role: { select: { name: true } } },
      });
      const logical = mapDbRolesToLogical(userRoles.map((ur) => ur.role && ur.role.name));
      const permitted = allowed.some((role) => logical.has(role));
      if (!permitted) {
        throw new ForbiddenError('You do not have access to this resource');
      }
      req.user.roles = Array.from(logical);
      next();
    } catch (err) {
      next(err);
    }
  };
};

/** Convenience gate: allow any back-office staff role (admin/manager/support). */
const requireStaff = requireRoles(...STAFF_LOGICAL_ROLES);

/**
 * Delivery-agent gate — allow the request only if the authenticated user owns a
 * `DeliveryAgent` profile. The logical `'delivery'` role is DERIVED from owning
 * that profile (see `auth.service.resolveUserContext`), NOT from a seeded RBAC
 * role, so `requireRoles('delivery')` can never match. This is therefore the
 * correct gate for the agent-facing delivery endpoints. On success it attaches
 * the loaded profile as `req.deliveryAgent` so handlers skip a re-fetch. Must
 * run AFTER `authenticate`.
 */
const requireDeliveryAgent = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      throw new UnauthorizedError('Authentication required');
    }
    const agent = await prisma.deliveryAgent.findUnique({
      where: { userId: req.user.id },
    });
    if (!agent) {
      throw new ForbiddenError('Not registered as a delivery agent');
    }
    req.deliveryAgent = agent;
    next();
  } catch (err) {
    next(err);
  }
};

module.exports = {
  authenticate,
  authorize,
  requireRoles,
  requireStaff,
  requireDeliveryAgent,
};
