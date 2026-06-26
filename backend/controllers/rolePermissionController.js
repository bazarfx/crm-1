/**
 * Role-permission management API — super admin only.
 *
 * Layer 3 of the lockout protection: every mutating endpoint rejects requests
 * targeting `super_admin` with HTTP 403 BEFORE doing any DB work. This sits
 * on top of Layer 2 (utils/permissions short-circuit) and Layer 1 (Sequelize
 * model hooks).
 */

const models = require('../models');
const { RolePermission, Role, AuditLog, sequelize } = models;
const { success, error } = require('../utils/responseHelper');
const { invalidateCache } = require('../utils/permissions');
const { listRoleKeys } = require('../utils/roles');
const {
  PERMISSION_CATEGORIES,
  PERMISSION_DEFINITIONS,
  NON_EDITABLE_ROLES,
  ALL_ROLES,
  VALID_LEVELS,
} = require('../utils/permissionDefaults');

// Live role-key list (built-ins + custom roles), used for the matrix columns
// and to validate mutations. Falls back to the static ALL_ROLES.
async function roleKeys() {
  try {
    return await listRoleKeys(models);
  } catch {
    return ALL_ROLES;
  }
}

/* ──────────────────────────────────────────────────────────────────
 * GET /api/v1/role-permissions
 * Returns the full matrix grouped by category, plus metadata for UI.
 * ────────────────────────────────────────────────────────────────── */
exports.getMatrix = async (req, res) => {
  const rows = await RolePermission.findAll({
    attributes: [
      'role',
      'permission_key',
      'level',
      'category',
      'description',
      'updated_by',
      'updatedAt',
    ],
    order: [
      ['category', 'ASC'],
      ['permission_key', 'ASC'],
    ],
  });

  // { category: { meta, permissions: { permission_key: { key, description, roles: { role: level } } } } }
  const matrix = {};
  for (const r of rows) {
    if (!matrix[r.category]) {
      matrix[r.category] = {
        meta: PERMISSION_CATEGORIES[r.category] || { label: r.category, order: 99 },
        permissions: {},
      };
    }
    if (!matrix[r.category].permissions[r.permission_key]) {
      matrix[r.category].permissions[r.permission_key] = {
        key: r.permission_key,
        description: r.description,
        roles: {},
      };
    }
    matrix[r.category].permissions[r.permission_key].roles[r.role] = r.level;
  }

  const keys = await roleKeys();

  // Per-role display metadata (name + colour) so the UI can render columns for
  // custom roles it has never heard of.
  let role_meta = {};
  try {
    const roles = await Role.findAll({ attributes: ['key', 'name', 'color', 'is_system'] });
    role_meta = Object.fromEntries(
      roles.map((r) => [r.key, { name: r.name, color: r.color, is_system: r.is_system }]),
    );
  } catch { /* roles table not ready — UI falls back to its static labels */ }

  return success(res, {
    matrix,
    roles: keys,
    role_meta,
    editable_roles: keys.filter((r) => !NON_EDITABLE_ROLES.includes(r)),
    non_editable_roles: NON_EDITABLE_ROLES,
    valid_levels: VALID_LEVELS,
  });
};

/* ──────────────────────────────────────────────────────────────────
 * PATCH /api/v1/role-permissions/:role/:permission_key
 * Body: { level: 'none' | 'all' | 'own' | 'group' | 'read' }
 * ────────────────────────────────────────────────────────────────── */
exports.updateOne = async (req, res) => {
  const { role, permission_key } = req.params;
  const { level } = req.body || {};

  // Layer 3 — reject super_admin edits BEFORE any DB work
  if (NON_EDITABLE_ROLES.includes(role)) {
    return error(
      res,
      `Cannot modify permissions for role "${role}" — this role is locked.`,
      403
    );
  }
  if (!(await roleKeys()).includes(role)) {
    return error(res, `Invalid role: ${role}`, 400);
  }
  if (!VALID_LEVELS.includes(level)) {
    return error(
      res,
      `Invalid level: ${level}. Must be one of: ${VALID_LEVELS.join(', ')}`,
      400
    );
  }

  const rp = await RolePermission.findOne({ where: { role, permission_key } });
  if (!rp) return error(res, 'Permission row not found', 404);

  const oldLevel = rp.level;
  await rp.update({ level, updated_by: req.user.id });

  await AuditLog.create({
    user_id: req.user.id,
    action: 'UPDATE_PERMISSION',
    resource: 'RolePermission',
    resource_id: rp.id,
    old_data: { role, permission_key, level: oldLevel },
    new_data: { role, permission_key, level },
    ip_address: req.ip,
  });

  invalidateCache();
  return success(res, rp, `Permission updated: ${role}.${permission_key} = ${level}`);
};

/* ──────────────────────────────────────────────────────────────────
 * POST /api/v1/role-permissions/bulk
 * Body: { changes: [{ role, permission_key, level }, ...] }
 * ────────────────────────────────────────────────────────────────── */
exports.bulkUpdate = async (req, res) => {
  const { changes } = req.body || {};
  if (!Array.isArray(changes) || changes.length === 0) {
    return error(res, 'changes must be a non-empty array', 400);
  }

  // Pre-flight: reject the whole batch if any row targets super_admin
  const keys = await roleKeys();
  for (const c of changes) {
    if (NON_EDITABLE_ROLES.includes(c.role)) {
      return error(res, `Cannot modify ${c.role}`, 403);
    }
    if (!keys.includes(c.role)) {
      return error(res, `Invalid role: ${c.role}`, 400);
    }
    if (!VALID_LEVELS.includes(c.level)) {
      return error(res, `Invalid level: ${c.level}`, 400);
    }
  }

  const t = await sequelize.transaction();
  try {
    const results = [];
    for (const c of changes) {
      const rp = await RolePermission.findOne({
        where: { role: c.role, permission_key: c.permission_key },
        transaction: t,
      });
      if (rp) {
        await rp.update({ level: c.level, updated_by: req.user.id }, { transaction: t });
        results.push(rp);
      }
    }

    await AuditLog.create(
      {
        user_id: req.user.id,
        action: 'BULK_UPDATE_PERMISSIONS',
        resource: 'RolePermission',
        new_data: { count: changes.length, changes },
        ip_address: req.ip,
      },
      { transaction: t }
    );

    await t.commit();
    invalidateCache();
    return success(res, { updated: results.length }, `${results.length} permissions updated`);
  } catch (e) {
    await t.rollback();
    return error(res, e.message, 500);
  }
};

/* ──────────────────────────────────────────────────────────────────
 * POST /api/v1/role-permissions/copy
 * Body: { from_role, to_role, categories? }
 * ────────────────────────────────────────────────────────────────── */
exports.copyRole = async (req, res) => {
  const { from_role, to_role, categories } = req.body || {};

  if (NON_EDITABLE_ROLES.includes(to_role)) {
    return error(res, `Cannot modify ${to_role}`, 403);
  }
  const keys = await roleKeys();
  if (!keys.includes(from_role) || !keys.includes(to_role)) {
    return error(res, 'Invalid role', 400);
  }
  if (from_role === to_role) {
    return error(res, 'from_role and to_role must differ', 400);
  }

  const sourceWhere = { role: from_role };
  if (Array.isArray(categories) && categories.length > 0) {
    sourceWhere.category = categories;
  }

  const sourceRows = await RolePermission.findAll({ where: sourceWhere });

  const t = await sequelize.transaction();
  try {
    for (const source of sourceRows) {
      const target = await RolePermission.findOne({
        where: { role: to_role, permission_key: source.permission_key },
        transaction: t,
      });
      if (target) {
        await target.update(
          { level: source.level, updated_by: req.user.id },
          { transaction: t }
        );
      }
    }

    await AuditLog.create(
      {
        user_id: req.user.id,
        action: 'COPY_ROLE_PERMISSIONS',
        resource: 'RolePermission',
        new_data: { from_role, to_role, categories, count: sourceRows.length },
        ip_address: req.ip,
      },
      { transaction: t }
    );

    await t.commit();
    invalidateCache();
    return success(res, { copied: sourceRows.length }, `Copied ${from_role} → ${to_role}`);
  } catch (e) {
    await t.rollback();
    return error(res, e.message, 500);
  }
};

/* ──────────────────────────────────────────────────────────────────
 * POST /api/v1/role-permissions/reset
 * Body: { role? } — if omitted, resets ALL editable roles
 * ────────────────────────────────────────────────────────────────── */
exports.resetDefaults = async (req, res) => {
  const { role } = req.body || {};
  if (role && NON_EDITABLE_ROLES.includes(role)) {
    return error(res, `Cannot reset ${role}`, 403);
  }
  if (role && !(await roleKeys()).includes(role)) {
    return error(res, 'Invalid role', 400);
  }

  const rolesToReset = role
    ? [role]
    : ALL_ROLES.filter((r) => !NON_EDITABLE_ROLES.includes(r));

  const t = await sequelize.transaction();
  try {
    let resetCount = 0;
    for (const [key, , , defaults] of PERMISSION_DEFINITIONS) {
      for (const r of rolesToReset) {
        const defaultLevel = defaults[r] || 'none';
        const rp = await RolePermission.findOne({
          where: { role: r, permission_key: key },
          transaction: t,
        });
        if (rp && rp.level !== defaultLevel) {
          await rp.update(
            { level: defaultLevel, updated_by: req.user.id },
            { transaction: t }
          );
          resetCount++;
        }
      }
    }

    await AuditLog.create(
      {
        user_id: req.user.id,
        action: 'RESET_PERMISSIONS',
        resource: 'RolePermission',
        new_data: { role: role || 'all_editable', resetCount },
        ip_address: req.ip,
      },
      { transaction: t }
    );

    await t.commit();
    invalidateCache();
    return success(res, { reset: resetCount }, `Reset ${resetCount} permissions to defaults`);
  } catch (e) {
    await t.rollback();
    return error(res, e.message, 500);
  }
};

/* ──────────────────────────────────────────────────────────────────
 * POST /api/v1/role-permissions/disable-category
 * Body: { role, category }
 * Sets every permission in `category` to 'none' for `role`.
 * ────────────────────────────────────────────────────────────────── */
exports.disableCategory = async (req, res) => {
  const { role, category } = req.body || {};
  if (NON_EDITABLE_ROLES.includes(role)) {
    return error(res, `Cannot modify ${role}`, 403);
  }
  if (!(await roleKeys()).includes(role)) {
    return error(res, 'Invalid role', 400);
  }
  if (!category || !PERMISSION_CATEGORIES[category]) {
    return error(res, `Invalid category: ${category}`, 400);
  }

  const t = await sequelize.transaction();
  try {
    const rows = await RolePermission.findAll({
      where: { role, category },
      transaction: t,
    });
    for (const rp of rows) {
      await rp.update({ level: 'none', updated_by: req.user.id }, { transaction: t });
    }
    await AuditLog.create(
      {
        user_id: req.user.id,
        action: 'DISABLE_CATEGORY',
        resource: 'RolePermission',
        new_data: { role, category, count: rows.length },
        ip_address: req.ip,
      },
      { transaction: t }
    );

    await t.commit();
    invalidateCache();
    return success(res, { disabled: rows.length }, `Disabled ${category} for ${role}`);
  } catch (e) {
    await t.rollback();
    return error(res, e.message, 500);
  }
};
