/**
 * Dynamic role + hierarchy management.
 *
 * Roles are stored in the `roles` table; their `key` is what User.role and
 * RolePermission.role hold, so creating a role here makes it immediately usable
 * by the existing permission engine. Creating a custom role also seeds a full
 * set of RolePermission rows (copied from a source role or all-"none") so it
 * shows up in the permission matrix and resolves cleanly.
 */

const { fn, col } = require('sequelize');
const { Role, User, RolePermission, AuditLog, sequelize } = require('../models');
const { success, error } = require('../utils/responseHelper');
const { PERMISSION_DEFINITIONS } = require('../utils/permissionDefaults');
const { invalidateCache } = require('../utils/permissions');
const { slugify } = require('../utils/roles');

/** Map of role key → live user count. */
async function userCounts() {
  const rows = await User.findAll({
    attributes: ['role', [fn('COUNT', col('id')), 'count']],
    group: ['role'],
    raw: true,
  });
  const map = {};
  for (const r of rows) map[r.role] = Number(r.count) || 0;
  return map;
}

function serialize(role, counts) {
  return {
    id: role.id,
    key: role.key,
    name: role.name,
    description: role.description,
    color: role.color,
    parent_role_id: role.parent_role_id,
    is_system: role.is_system,
    is_assignable: role.is_assignable,
    show_in_tree: role.show_in_tree,
    share_data_with_peers: role.share_data_with_peers,
    display_order: role.display_order,
    user_count: counts ? counts[role.key] || 0 : undefined,
  };
}

/* GET /roles — flat list with user counts. */
exports.list = async (req, res) => {
  const [roles, counts] = await Promise.all([
    Role.findAll({ order: [['display_order', 'ASC'], ['name', 'ASC']] }),
    userCounts(),
  ]);
  return success(res, roles.map((r) => serialize(r, counts)));
};

/* GET /roles/tree — nested hierarchy (show_in_tree roles only). */
exports.tree = async (req, res) => {
  const [roles, counts] = await Promise.all([
    Role.findAll({ order: [['display_order', 'ASC'], ['name', 'ASC']] }),
    userCounts(),
  ]);
  const nodes = roles
    .filter((r) => r.show_in_tree)
    .map((r) => ({ ...serialize(r, counts), children: [] }));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const roots = [];
  for (const n of nodes) {
    if (n.parent_role_id && byId.has(n.parent_role_id)) {
      byId.get(n.parent_role_id).children.push(n);
    } else {
      roots.push(n);
    }
  }
  return success(res, roots);
};

/* GET /roles/:id */
exports.getOne = async (req, res) => {
  const role = await Role.findByPk(req.params.id);
  if (!role) return error(res, 'Role not found', 404);
  const counts = await userCounts();
  return success(res, serialize(role, counts));
};

/* POST /roles — create a custom role + seed its permissions. */
exports.create = async (req, res) => {
  const {
    name, description, color, parent_role_id,
    share_data_with_peers = false, copy_permissions_from,
  } = req.body || {};

  if (!name || !name.trim()) return error(res, 'Role name is required', 400);

  // Resolve parent + a unique key.
  let parent = null;
  if (parent_role_id) {
    parent = await Role.findByPk(parent_role_id);
    if (!parent) return error(res, 'Parent role not found', 400);
  }

  let baseKey = slugify(name) || 'role';
  let key = baseKey;
  let n = 2;
  // eslint-disable-next-line no-await-in-loop
  while (await Role.findOne({ where: { key }, paranoid: false })) {
    key = `${baseKey}_${n}`;
    n += 1;
  }

  const maxOrder = (await Role.max('display_order')) || 0;

  const t = await sequelize.transaction();
  try {
    const role = await Role.create({
      key,
      name: name.trim(),
      description: description || null,
      color: color || parent?.color || '#64748B',
      parent_role_id: parent?.id || null,
      is_system: false,
      is_assignable: true,
      show_in_tree: true,
      share_data_with_peers: !!share_data_with_peers,
      display_order: maxOrder + 10,
      created_by: req.user.id,
    }, { transaction: t });

    // Seed permission rows. Source levels come from `copy_permissions_from`
    // (or the parent role), looked up from the live RolePermission table.
    const sourceKey = copy_permissions_from || parent?.key || null;
    let sourceLevels = {};
    if (sourceKey) {
      const sourceRows = await RolePermission.findAll({
        where: { role: sourceKey },
        attributes: ['permission_key', 'level'],
        transaction: t,
      });
      sourceLevels = Object.fromEntries(sourceRows.map((r) => [r.permission_key, r.level]));
    }

    const rows = PERMISSION_DEFINITIONS.map(([permission_key, category, descr]) => ({
      role: key,
      permission_key,
      level: sourceLevels[permission_key] || 'none',
      category,
      description: descr,
      updated_by: req.user.id,
    }));
    await RolePermission.bulkCreate(rows, { transaction: t });

    await AuditLog.create({
      user_id: req.user.id,
      action: 'CREATE_ROLE',
      resource: 'Role',
      resource_id: role.id,
      new_data: { key, name: role.name, parent: parent?.key || null, copied_from: sourceKey },
      ip_address: req.ip,
    }, { transaction: t });

    await t.commit();
    invalidateCache();
    const counts = await userCounts();
    return success(res, serialize(role, counts), `Role "${role.name}" created`, 201);
  } catch (e) {
    await t.rollback();
    return error(res, e.message || 'Failed to create role', 500);
  }
};

/* PATCH /roles/:id — rename / recolor / re-parent / reorder. */
exports.update = async (req, res) => {
  const role = await Role.findByPk(req.params.id);
  if (!role) return error(res, 'Role not found', 404);

  const {
    name, description, color, parent_role_id,
    share_data_with_peers, display_order, is_assignable,
  } = req.body || {};

  const patch = {};
  if (name != null && name.trim()) patch.name = name.trim();
  if (description !== undefined) patch.description = description || null;
  if (color) patch.color = color;
  if (share_data_with_peers !== undefined) patch.share_data_with_peers = !!share_data_with_peers;
  if (display_order !== undefined) patch.display_order = Number(display_order) || 0;
  // System roles must stay assignable; only custom roles can toggle it.
  if (is_assignable !== undefined && !role.is_system) patch.is_assignable = !!is_assignable;

  // Re-parenting — guard against self/descendant cycles and keep super_admin
  // pinned at the root.
  if (parent_role_id !== undefined) {
    if (role.key === 'super_admin' && parent_role_id) {
      return error(res, 'Super Admin must remain at the top of the hierarchy', 400);
    }
    if (parent_role_id === null || parent_role_id === '') {
      patch.parent_role_id = null;
    } else {
      if (parent_role_id === role.id) return error(res, 'A role cannot be its own parent', 400);
      const parent = await Role.findByPk(parent_role_id);
      if (!parent) return error(res, 'Parent role not found', 400);
      // Walk up from the proposed parent; a hit on this role = cycle.
      const all = await Role.findAll({ attributes: ['id', 'parent_role_id'] });
      const byId = new Map(all.map((r) => [r.id, r]));
      let cursor = parent;
      while (cursor) {
        if (cursor.id === role.id) {
          return error(res, 'That would create a loop in the hierarchy', 400);
        }
        cursor = cursor.parent_role_id ? byId.get(cursor.parent_role_id) : null;
      }
      patch.parent_role_id = parent_role_id;
    }
  }

  const before = serialize(role);
  await role.update(patch);

  await AuditLog.create({
    user_id: req.user.id,
    action: 'UPDATE_ROLE',
    resource: 'Role',
    resource_id: role.id,
    old_data: before,
    new_data: serialize(role),
    ip_address: req.ip,
  });

  invalidateCache();
  const counts = await userCounts();
  return success(res, serialize(role, counts), 'Role updated');
};

/* DELETE /roles/:id — custom roles only, no users assigned. */
exports.remove = async (req, res) => {
  const role = await Role.findByPk(req.params.id);
  if (!role) return error(res, 'Role not found', 404);
  if (role.is_system) return error(res, 'System roles cannot be deleted', 403);

  const assigned = await User.count({ where: { role: role.key } });
  if (assigned > 0) {
    return error(res, `${assigned} user${assigned === 1 ? '' : 's'} still use this role. Reassign them first.`, 409);
  }

  const t = await sequelize.transaction();
  try {
    // Re-home any child roles to this role's parent so the tree stays whole.
    await Role.update(
      { parent_role_id: role.parent_role_id || null },
      { where: { parent_role_id: role.id }, transaction: t },
    );
    // Drop its permission rows (keyed by the role string).
    await RolePermission.destroy({ where: { role: role.key }, transaction: t });
    await role.destroy({ transaction: t });

    await AuditLog.create({
      user_id: req.user.id,
      action: 'DELETE_ROLE',
      resource: 'Role',
      resource_id: role.id,
      old_data: serialize(role),
      ip_address: req.ip,
    }, { transaction: t });

    await t.commit();
    invalidateCache();
    return success(res, { id: role.id }, `Role "${role.name}" deleted`);
  } catch (e) {
    await t.rollback();
    return error(res, e.message || 'Failed to delete role', 500);
  }
};
