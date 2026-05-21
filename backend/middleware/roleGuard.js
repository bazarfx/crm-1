const { error } = require('../utils/responseHelper');
const { getLevel } = require('../utils/permissions');

// Strict role check — kept for routes that gate by hard-coded role list.
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

// Permission-based check — drives access from PERMISSIONS matrix.
// On success sets req.permissionLevel = 'all' | 'own' | 'group' | 'read'.
function requirePermission(permission) {
  return function (req, res, next) {
    if (!req.user) return error(res, 'Unauthenticated', 401);
    const level = getLevel(req.user.role, permission);
    if (!level) return error(res, `Permission denied: ${permission}`, 403);
    req.permissionLevel = level;
    next();
  };
}

// Attach permission level without blocking — for handlers that branch on scope.
function attachPermission(permission) {
  return function (req, res, next) {
    req.permissionLevel = req.user ? getLevel(req.user.role, permission) : false;
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
