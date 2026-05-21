/**
 * Dynamic permissions — DB-backed via the RolePermission model.
 *
 * Three layers of lockout protection for super_admin:
 *   Layer 1 — Sequelize beforeUpdate / beforeDestroy / beforeBulkUpdate hooks
 *             on the RolePermission model (utils-level safety net).
 *   Layer 2 — This file: every public helper short-circuits to 'all' / true
 *             for the super_admin role BEFORE reading the DB. The cache
 *             never contains a super_admin override.
 *   Layer 3 — The role-permissions controller rejects API requests that
 *             target the super_admin role with HTTP 403.
 *
 * Cache strategy: a single in-memory map of `${role}:${permission_key}` → level,
 * refreshed every 60 s. Mutations call invalidateCache() so changes propagate
 * immediately within the same process. For multi-process deploys the 60 s TTL
 * provides an upper-bound staleness guarantee.
 */

const { RolePermission } = require('../models');
const { PERMISSION_DEFINITIONS } = require('./permissionDefaults');

const SUPER_ADMIN_ROLE = 'super_admin';
const CACHE_TTL_MS = 60 * 1000;

let permissionsCache = null;
let cacheLoadedAt = 0;

const buildKey = (role, permissionKey) => `${role}:${permissionKey}`;

async function loadCache() {
  const rows = await RolePermission.findAll({
    attributes: ['role', 'permission_key', 'level'],
    raw: true,
  });
  const map = Object.create(null);
  for (const r of rows) {
    map[buildKey(r.role, r.permission_key)] = r.level;
  }
  permissionsCache = map;
  cacheLoadedAt = Date.now();
}

async function ensureCache() {
  if (!permissionsCache || Date.now() - cacheLoadedAt > CACHE_TTL_MS) {
    await loadCache();
  }
}

function invalidateCache() {
  permissionsCache = null;
  cacheLoadedAt = 0;
}

/**
 * Get the access level for a (role, permission) pair.
 *   Returns one of: 'all' | 'own' | 'group' | 'read' | 'none'
 *   super_admin always returns 'all' without hitting the DB (Layer 2).
 */
async function getLevel(userRole, permissionKey) {
  if (userRole === SUPER_ADMIN_ROLE) return 'all';
  await ensureCache();
  return permissionsCache[buildKey(userRole, permissionKey)] || 'none';
}

/**
 * Boolean check: does the role have permission?
 *   - 'all' / 'read' / 'group' → true
 *   - 'own' → true ONLY if (ownerId, userId) match
 *   - 'none' or undefined → false
 */
async function can(userRole, permissionKey, ownerId = null, userId = null) {
  if (userRole === SUPER_ADMIN_ROLE) return true;
  const level = await getLevel(userRole, permissionKey);
  if (!level || level === 'none') return false;
  if (level === 'all') return true;
  if (level === 'read') return true;
  if (level === 'group') return true; // group-scoped filtering must be applied in the query layer
  if (level === 'own') {
    return Boolean(ownerId) && Boolean(userId) && ownerId.toString() === userId.toString();
  }
  return false;
}

/** Read-only check: any non-'none' level counts as readable. */
async function canRead(userRole, permissionKey) {
  if (userRole === SUPER_ADMIN_ROLE) return true;
  const level = await getLevel(userRole, permissionKey);
  return !!level && level !== 'none';
}

/**
 * Get a complete map of every permission → level for a given role.
 * super_admin gets a synthetic 'all' map for every key without hitting the DB.
 */
async function getAllForRole(userRole) {
  if (userRole === SUPER_ADMIN_ROLE) {
    const result = Object.create(null);
    for (const [key] of PERMISSION_DEFINITIONS) result[key] = 'all';
    return result;
  }
  await ensureCache();
  const result = Object.create(null);
  for (const [key] of PERMISSION_DEFINITIONS) {
    result[key] = permissionsCache[buildKey(userRole, key)] || 'none';
  }
  return result;
}

/**
 * Specific guard for role changes:
 *   - You cannot promote anyone to super_admin
 *   - You cannot demote the existing super_admin
 *   - You cannot change your own role
 *   - Otherwise, must hold the users.change_role permission
 */
async function canChangeRole(currentUser, targetUser, newRole) {
  if (newRole === SUPER_ADMIN_ROLE) return false;
  if (targetUser.role === SUPER_ADMIN_ROLE) return false;
  if (currentUser.id === targetUser.id) return false;
  return can(currentUser.role, 'users.change_role');
}

module.exports = {
  getLevel,
  can,
  canRead,
  getAllForRole,
  canChangeRole,
  invalidateCache,
};
