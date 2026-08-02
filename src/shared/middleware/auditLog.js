const { prisma } = require('../database');

/**
 * Audit log middleware - logs permission-sensitive actions
 * Usage: router.post('/path', authenticate, auditLog('action.code'), controller)
 */
const auditLog = (action) => {
  return async (req, res, next) => {
    // Store original json method to intercept response
    const originalJson = res.json.bind(res);

    res.json = (body) => {
      // Log only successful mutations (2xx)
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const logEntry = {
          userId: req.user?.id,
          action,
          resourceType: action.split('.')[0],
          resourceId: req.params.id || body?.store?.id || body?.order?.id || body?.product?.id || null,
          details: {
            method: req.method,
            path: req.path,
            body: sanitizeBody(req.body),
          },
          ipAddress: req.ip || req.headers['x-forwarded-for'] || null,
          userAgent: req.headers['user-agent'] || null,
        };

        // Fire and forget - don't block response
        prisma.auditLog.create({ data: logEntry }).catch(() => {});
      }

      return originalJson(body);
    };

    next();
  };
};

/**
 * Remove sensitive fields from request body before logging
 */
function sanitizeBody(body) {
  if (!body) return {};
  const sanitized = { ...body };
  delete sanitized.password;
  delete sanitized.passwordHash;
  delete sanitized.refreshToken;
  delete sanitized.razorpay_signature;
  return sanitized;
}

module.exports = { auditLog };
