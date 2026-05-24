const { error } = require('../utils/responseHelper');
const { getLevel } = require('../utils/permissions');

/**
 * Strict role check — gates by hard-coded role list.
 * Stays SYNC because it does not touch the DB. Used by every existing
 * route file as `allowRoles('super_admin', 'admin', ...)`.
 */
function allowRoles(...roles) {
  const allowed = new Set(roles.flat());
  return function (req, res, next) {
    if (!req.user) return error(res, 'Unauthenticated', 401);
    if (!allowed.has(req.user.role)) {
      return error(res, 'Forbidden: insufficient role', 403);
    }
    next();
  };
}

function denyRoles(...roles) {
  const denied = new Set(roles.flat());
  return function (req, res, next) {
    if (!req.user) return error(res, 'Unauthenticated', 401);
    if (denied.has(req.user.role)) {
      return error(res, 'Forbidden: role blocked', 403);
    }
    next();
  };
}

/**
 * Permission-based check — drives access from the dynamic
 * RolePermission table. On success sets req.permissionLevel =
 * 'all' | 'own' | 'group' | 'read'.
 *
 * Now ASYNC because the underlying getLevel() may hit the cache /
 * the DB. Wrapped in try/catch so a cache load failure surfaces as
 * 500 rather than an unhandled promise rejection.
 */
function requirePermission(permission) {
  return async function (req, res, next) {
    try {
      if (!req.user) return error(res, 'Unauthenticated', 401);
      const level = await getLevel(req.user.role, permission, req.user.id);
      if (!level || level === 'none') {
        return error(res, `Permission denied: ${permission}`, 403);
      }
      req.permissionLevel = level;
      next();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('requirePermission failed:', e);
      return error(res, 'Permission check failed', 500);
    }
  };
}

/** Attach permission level without blocking — for handlers that branch on scope. */
function attachPermission(permission) {
  return async function (req, res, next) {
    try {
      req.permissionLevel = req.user ? await getLevel(req.user.role, permission, req.user.id) : 'none';
    } catch (e) {
      req.permissionLevel = 'none';
    }
    next();
  };
}

const STAFF_ADMIN = ['super_admin', 'admin', 'floor_manager'];
const READ_ONLY = ['back_office', 'auditor'];

module.exports = {
  allowRoles,
  denyRoles,
  requirePermission,
  attachPermission,
  STAFF_ADMIN,
  READ_ONLY,
};
