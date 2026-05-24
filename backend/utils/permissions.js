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
 * Cache strategy:
 *   - Role cache: `${role}:${permission_key}` → level. Refreshed every 60 s.
 *   - User cache (role='custom' only): `user:${user_id}:${permission_key}` →
 *     level. Same 60 s TTL. Mutations call invalidateCache() (full reset) or
 *     invalidateUser(user_id) (single-user reset) so changes propagate
 *     immediately within the same process.
 */

const { RolePermission, UserPermission } = require('../models');
const { PERMISSION_DEFINITIONS } = require('./permissionDefaults');

const SUPER_ADMIN_ROLE = 'super_admin';
const CUSTOM_ROLE = 'custom';
const CACHE_TTL_MS = 60 * 1000;

let roleCache = null;
let roleCacheLoadedAt = 0;

// Per-user permission cache. Only populated for users that come in with
// role='custom'. Map: user_id → { perms: {key: level}, loadedAt: ms }.
const userCache = new Map();

const buildRoleKey = (role, permissionKey) => `${role}:${permissionKey}`;

async function loadRoleCache() {
  const rows = await RolePermission.findAll({
    attributes: ['role', 'permission_key', 'level'],
    raw: true,
  });
  const map = Object.create(null);
  for (const r of rows) {
    map[buildRoleKey(r.role, r.permission_key)] = r.level;
  }
  roleCache = map;
  roleCacheLoadedAt = Date.now();
}

async function ensureRoleCache() {
  if (!roleCache || Date.now() - roleCacheLoadedAt > CACHE_TTL_MS) {
    await loadRoleCache();
  }
}

async function loadUserPerms(userId) {
  const rows = await UserPermission.findAll({
    where: { user_id: userId },
    attributes: ['permission_key', 'level'],
    raw: true,
  });
  const perms = Object.create(null);
  for (const r of rows) perms[r.permission_key] = r.level;
  userCache.set(userId, { perms, loadedAt: Date.now() });
  return perms;
}

async function ensureUserPerms(userId) {
  const entry = userCache.get(userId);
  if (!entry || Date.now() - entry.loadedAt > CACHE_TTL_MS) {
    return loadUserPerms(userId);
  }
  return entry.perms;
}

function invalidateCache() {
  roleCache = null;
  roleCacheLoadedAt = 0;
  userCache.clear();
}

function invalidateUser(userId) {
  if (userId) userCache.delete(userId);
}

/**
 * Get the access level for a (role, permission) pair.
 *   Returns one of: 'all' | 'own' | 'group' | 'read' | 'none'
 *   super_admin always returns 'all' without hitting the DB (Layer 2).
 *   custom role reads from UserPermission keyed by userId.
 */
async function getLevel(userRole, permissionKey, userId = null) {
  if (userRole === SUPER_ADMIN_ROLE) return 'all';
  if (userRole === CUSTOM_ROLE) {
    if (!userId) return 'none';
    const perms = await ensureUserPerms(userId);
    return perms[permissionKey] || 'none';
  }
  await ensureRoleCache();
  return roleCache[buildRoleKey(userRole, permissionKey)] || 'none';
}

/**
 * Boolean check: does the role have permission?
 *   - 'all' / 'read' / 'group' → true
 *   - 'own' → true ONLY if (ownerId, userId) match
 *   - 'none' or undefined → false
 */
async function can(userRole, permissionKey, ownerId = null, userId = null) {
  if (userRole === SUPER_ADMIN_ROLE) return true;
  const level = await getLevel(userRole, permissionKey, userId);
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
async function canRead(userRole, permissionKey, userId = null) {
  if (userRole === SUPER_ADMIN_ROLE) return true;
  const level = await getLevel(userRole, permissionKey, userId);
  return !!level && level !== 'none';
}

/**
 * Get a complete map of every permission → level for a given role / user.
 * super_admin gets a synthetic 'all' map for every key without hitting the DB.
 * custom role pulls the user's full override set from UserPermission.
 */
async function getAllForRole(userRole, userId = null) {
  if (userRole === SUPER_ADMIN_ROLE) {
    const result = Object.create(null);
    for (const [key] of PERMISSION_DEFINITIONS) result[key] = 'all';
    return result;
  }
  if (userRole === CUSTOM_ROLE) {
    const result = Object.create(null);
    const perms = userId ? await ensureUserPerms(userId) : {};
    for (const [key] of PERMISSION_DEFINITIONS) {
      result[key] = perms[key] || 'none';
    }
    return result;
  }
  await ensureRoleCache();
  const result = Object.create(null);
  for (const [key] of PERMISSION_DEFINITIONS) {
    result[key] = roleCache[buildRoleKey(userRole, key)] || 'none';
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
  return can(currentUser.role, 'users.change_role', null, currentUser.id);
}

module.exports = {
  getLevel,
  can,
  canRead,
  getAllForRole,
  canChangeRole,
  invalidateCache,
  invalidateUser,
};
