const { Op } = require('sequelize');
const {
  sequelize,
  SavedView,
  User,
  Module,
  AuditLog,
} = require('../models');
const { success, error } = require('../utils/responseHelper');
const { listModuleKeys } = require('../utils/modules');

// Only these roles may publish a view to everyone (is_shared = true). Everyone
// else's views stay private to the owner regardless of what they send.
const SHARE_ROLES = ['super_admin', 'admin', 'floor_manager'];
// Admin-tier roles may edit / delete ANY view (moderation); owners always may.
const ADMIN_ROLES = ['super_admin', 'admin'];

function canShare(user) {
  return SHARE_ROLES.includes(user.role);
}

function isAdmin(user) {
  return ADMIN_ROLES.includes(user.role);
}

// entity_type must be a known module key (built-ins + custom modules). Falls
// back to the built-in set if the module registry can't be read.
async function isValidEntity(entityType) {
  if (!entityType || typeof entityType !== 'string') return false;
  try {
    const keys = await listModuleKeys({ Module });
    return keys.includes(entityType);
  } catch {
    return false;
  }
}

// { match, rules:[...] } | null. Kept permissive — the list page tolerates
// junk rules — but rejects obviously wrong shapes.
function normalizeCriteria(criteria) {
  if (criteria === null || criteria === undefined) return { value: null };
  if (typeof criteria !== 'object' || Array.isArray(criteria)) {
    return { err: 'criteria must be an object { match, rules }' };
  }
  if (!Array.isArray(criteria.rules)) {
    return { err: 'criteria.rules must be an array' };
  }
  const match = String(criteria.match || 'and').toLowerCase() === 'or' ? 'or' : 'and';
  return { value: { match, rules: criteria.rules } };
}

// filters — flat object of key → value (incl. cf_* keys). null/undefined → {}.
function normalizeFilters(filters) {
  if (filters === null || filters === undefined) return { value: {} };
  if (typeof filters !== 'object' || Array.isArray(filters)) {
    return { err: 'filters must be a flat object' };
  }
  return { value: filters };
}

// columns — array of string column keys | null.
function normalizeColumns(columns) {
  if (columns === null || columns === undefined) return { value: null };
  if (!Array.isArray(columns)) return { err: 'columns must be an array of column keys' };
  return { value: columns.map((c) => String(c)) };
}

// sort — { field, dir } | null. dir coerced to ASC/DESC.
function normalizeSort(sort) {
  if (sort === null || sort === undefined) return { value: null };
  if (typeof sort !== 'object' || Array.isArray(sort)) {
    return { err: 'sort must be an object { field, dir }' };
  }
  if (!sort.field || typeof sort.field !== 'string') {
    return { err: 'sort.field is required' };
  }
  const dir = String(sort.dir || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  return { value: { field: sort.field, dir } };
}

function serialize(view) {
  const json = view.toJSON ? view.toJSON() : view;
  const owner = json.owner || null;
  return {
    id: json.id,
    entity_type: json.entity_type,
    name: json.name,
    owner_id: json.owner_id,
    owner_name: owner
      ? `${owner.first_name || ''} ${owner.last_name || ''}`.trim() || owner.email || null
      : null,
    is_shared: json.is_shared,
    filters: json.filters || {},
    criteria: json.criteria || null,
    columns: json.columns || null,
    sort: json.sort || null,
    is_default: json.is_default,
    position: json.position,
    created_at: json.created_at,
    updated_at: json.updated_at,
  };
}

const OWNER_INCLUDE = {
  model: User,
  as: 'owner',
  attributes: ['id', 'first_name', 'last_name', 'email'],
  paranoid: false,
};

// ── List — caller's own views for the entity + all shared views ─────────────
// GET /saved-views?entity_type=lead
async function list(req, res) {
  const entityType = req.query.entity_type;
  if (!entityType) return error(res, 'entity_type is required', 400);

  const views = await SavedView.findAll({
    where: {
      entity_type: entityType,
      [Op.or]: [
        { owner_id: req.user.id },
        { is_shared: true },
      ],
    },
    include: [OWNER_INCLUDE],
    order: [['position', 'ASC'], ['name', 'ASC']],
  });

  return success(res, { items: views.map(serialize) });
}

// ── Get one ──────────────────────────────────────────────────────────────────
async function getOne(req, res) {
  const view = await SavedView.findByPk(req.params.id, { include: [OWNER_INCLUDE] });
  if (!view) return error(res, 'Saved view not found', 404);
  // Visible only to the owner, admins, or anyone if it's shared.
  if (view.owner_id !== req.user.id && !view.is_shared && !isAdmin(req.user)) {
    return error(res, 'Saved view not found', 404);
  }
  return success(res, serialize(view));
}

// ── Create ───────────────────────────────────────────────────────────────────
async function create(req, res) {
  const {
    entity_type, name, filters, criteria, columns, sort,
    is_shared, is_default, position,
  } = req.body || {};

  if (!(await isValidEntity(entity_type))) {
    return error(res, 'entity_type is invalid or unknown', 400);
  }
  if (!name || !name.trim()) return error(res, 'name is required', 400);

  const nf = normalizeFilters(filters);
  if (nf.err) return error(res, nf.err, 400);
  const nc = normalizeCriteria(criteria);
  if (nc.err) return error(res, nc.err, 400);
  const ncol = normalizeColumns(columns);
  if (ncol.err) return error(res, ncol.err, 400);
  const ns = normalizeSort(sort);
  if (ns.err) return error(res, ns.err, 400);

  // Only admin-tier roles may share; everyone else is forced private.
  const shared = canShare(req.user) ? !!is_shared : false;
  const makeDefault = !!is_default;

  // Append to the end of the owner's rail for this entity.
  const lastPos = await SavedView.max('position', {
    where: { entity_type, owner_id: req.user.id },
  });
  const nextPos = position !== undefined && Number.isFinite(Number(position))
    ? Number(position)
    : (Number.isFinite(lastPos) ? lastPos + 1 : 0);

  const t = await sequelize.transaction();
  try {
    // Setting a new default clears the flag on the owner's other views.
    if (makeDefault) {
      await SavedView.update(
        { is_default: false },
        { where: { owner_id: req.user.id, entity_type, is_default: true }, transaction: t },
      );
    }

    const view = await SavedView.create({
      entity_type,
      name: name.trim(),
      owner_id: req.user.id,
      is_shared: shared,
      filters: nf.value,
      criteria: nc.value,
      columns: ncol.value,
      sort: ns.value,
      is_default: makeDefault,
      position: nextPos,
      created_by: req.user.id,
    }, { transaction: t });

    await AuditLog.create({
      user_id: req.user.id,
      action: 'CREATE_SAVED_VIEW',
      resource: 'SavedView',
      resource_id: view.id,
      new_data: view.toJSON(),
      ip_address: req.ip,
    }, { transaction: t });

    await t.commit();

    const full = await SavedView.findByPk(view.id, { include: [OWNER_INCLUDE] });
    return success(res, serialize(full), 'Saved view created', 201);
  } catch (e) {
    await t.rollback();
    return error(res, e.message || 'Failed to create saved view', 500);
  }
}

// ── Update — owner or admin only ─────────────────────────────────────────────
async function update(req, res) {
  const view = await SavedView.findByPk(req.params.id);
  if (!view) return error(res, 'Saved view not found', 404);

  const owns = view.owner_id === req.user.id;
  if (!owns && !isAdmin(req.user)) {
    return error(res, 'You can only edit your own saved views', 403);
  }

  const body = req.body || {};
  const updates = {};

  if ('name' in body) {
    if (!body.name || !body.name.trim()) return error(res, 'name cannot be empty', 400);
    updates.name = body.name.trim();
  }
  if ('entity_type' in body) {
    if (!(await isValidEntity(body.entity_type))) {
      return error(res, 'entity_type is invalid or unknown', 400);
    }
    updates.entity_type = body.entity_type;
  }
  if ('filters' in body) {
    const nf = normalizeFilters(body.filters);
    if (nf.err) return error(res, nf.err, 400);
    updates.filters = nf.value;
  }
  if ('criteria' in body) {
    const nc = normalizeCriteria(body.criteria);
    if (nc.err) return error(res, nc.err, 400);
    updates.criteria = nc.value;
  }
  if ('columns' in body) {
    const ncol = normalizeColumns(body.columns);
    if (ncol.err) return error(res, ncol.err, 400);
    updates.columns = ncol.value;
  }
  if ('sort' in body) {
    const ns = normalizeSort(body.sort);
    if (ns.err) return error(res, ns.err, 400);
    updates.sort = ns.value;
  }
  if ('position' in body && Number.isFinite(Number(body.position))) {
    updates.position = Number(body.position);
  }
  // Only admin-tier roles may (un)share; others can't change the flag.
  if ('is_shared' in body && canShare(req.user)) {
    updates.is_shared = !!body.is_shared;
  }

  // The effective entity for the default-clearing scope (post-update).
  const effectiveEntity = updates.entity_type || view.entity_type;
  const settingDefault = 'is_default' in body ? !!body.is_default : undefined;

  const oldData = view.toJSON();

  const t = await sequelize.transaction();
  try {
    if (settingDefault === true) {
      // Clear default on the OWNER's other views for this entity, then set it
      // here. Default is per owner+entity, so we scope by the view's owner.
      await SavedView.update(
        { is_default: false },
        {
          where: {
            owner_id: view.owner_id,
            entity_type: effectiveEntity,
            is_default: true,
            id: { [Op.ne]: view.id },
          },
          transaction: t,
        },
      );
      updates.is_default = true;
    } else if (settingDefault === false) {
      updates.is_default = false;
    }

    await view.update(updates, { transaction: t });

    await AuditLog.create({
      user_id: req.user.id,
      action: 'UPDATE_SAVED_VIEW',
      resource: 'SavedView',
      resource_id: view.id,
      old_data: oldData,
      new_data: view.toJSON(),
      ip_address: req.ip,
    }, { transaction: t });

    await t.commit();

    const full = await SavedView.findByPk(view.id, { include: [OWNER_INCLUDE] });
    return success(res, serialize(full), 'Saved view updated');
  } catch (e) {
    await t.rollback();
    return error(res, e.message || 'Failed to update saved view', 500);
  }
}

// ── Delete — owner or admin only (paranoid soft delete) ──────────────────────
async function remove(req, res) {
  const view = await SavedView.findByPk(req.params.id);
  if (!view) return error(res, 'Saved view not found', 404);

  const owns = view.owner_id === req.user.id;
  if (!owns && !isAdmin(req.user)) {
    return error(res, 'You can only delete your own saved views', 403);
  }

  const snapshot = view.toJSON();
  await view.destroy(); // paranoid — soft delete

  await AuditLog.create({
    user_id: req.user.id,
    action: 'DELETE_SAVED_VIEW',
    resource: 'SavedView',
    resource_id: view.id,
    old_data: snapshot,
    ip_address: req.ip,
  });

  return success(res, { id: view.id }, 'Saved view deleted');
}

module.exports = {
  list,
  getOne,
  create,
  update,
  remove,
};
