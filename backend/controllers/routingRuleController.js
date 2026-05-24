const { Op } = require('sequelize');
const {
  sequelize,
  RoutingRule,
  Group,
  User,
  AuditLog,
} = require('../models');
const { success, error } = require('../utils/responseHelper');

const VALID_TARGET_TYPES = ['group', 'user'];

// Hydrate target_id → group/user object for display so the admin UI doesn't
// need to make N extra lookups per row.
async function hydrate(rules) {
  if (!rules?.length) return [];
  const groupIds = rules.filter((r) => r.target_type === 'group').map((r) => r.target_id);
  const userIds = rules.filter((r) => r.target_type === 'user').map((r) => r.target_id);

  const [groups, users] = await Promise.all([
    groupIds.length
      ? Group.findAll({
          where: { id: { [Op.in]: groupIds } },
          attributes: ['id', 'name', 'language', 'is_active', 'type'],
          paranoid: false,
        })
      : [],
    userIds.length
      ? User.findAll({
          where: { id: { [Op.in]: userIds } },
          attributes: ['id', 'first_name', 'last_name', 'role', 'languages', 'is_active'],
          paranoid: false,
        })
      : [],
  ]);
  const groupMap = Object.fromEntries(groups.map((g) => [g.id, g.toJSON()]));
  const userMap = Object.fromEntries(users.map((u) => [u.id, u.toJSON()]));

  return rules.map((r) => {
    const json = r.toJSON ? r.toJSON() : r;
    if (json.target_type === 'group') json.target = groupMap[json.target_id] || null;
    if (json.target_type === 'user') json.target = userMap[json.target_id] || null;
    return json;
  });
}

// ─── List ────────────────────────────────────────────────────────────────
async function list(req, res) {
  const where = {};
  if (req.query.lead_source) where.lead_source = req.query.lead_source;
  if (req.query.language === 'null' || req.query.language === '_') where.language = null;
  else if (req.query.language) where.language = req.query.language;
  if (req.query.is_active !== undefined) where.is_active = req.query.is_active === 'true';

  const rules = await RoutingRule.findAll({
    where,
    order: [['lead_source', 'ASC'], ['language', 'ASC'], ['position', 'ASC']],
  });
  const items = await hydrate(rules);
  return success(res, { items });
}

// ─── Validate target exists and is usable ────────────────────────────────
async function validateTarget(target_type, target_id) {
  if (target_type === 'group') {
    const g = await Group.findByPk(target_id);
    if (!g) return 'Target group not found';
    if (!g.is_active) return 'Target group is inactive';
    return null;
  }
  if (target_type === 'user') {
    const u = await User.findByPk(target_id);
    if (!u) return 'Target user not found';
    if (!u.is_active) return 'Target user is inactive';
    if (!['tele_sales', 'senior'].includes(u.role)) {
      return 'Target user must be a teleseller or senior';
    }
    return null;
  }
  return 'Invalid target_type';
}

// ─── Create ──────────────────────────────────────────────────────────────
async function create(req, res) {
  const { lead_source, language, target_type, target_id, notes } = req.body || {};

  if (!lead_source) return error(res, 'lead_source is required', 400);
  if (!VALID_TARGET_TYPES.includes(target_type)) {
    return error(res, 'target_type must be "group" or "user"', 400);
  }
  if (!target_id) return error(res, 'target_id is required', 400);

  const targetErr = await validateTarget(target_type, target_id);
  if (targetErr) return error(res, targetErr, 400);

  // Position defaults to "append at the end" within the same bucket — the
  // admin can reorder afterwards.
  const lastPos = await RoutingRule.max('position', {
    where: { lead_source, language: language || null },
  });
  const position = Number.isFinite(lastPos) ? lastPos + 1 : 0;

  const rule = await RoutingRule.create({
    lead_source,
    language: language || null,
    target_type,
    target_id,
    position,
    is_active: true,
    notes: notes || null,
    created_by: req.user.id,
  });

  await AuditLog.create({
    user_id: req.user.id,
    action: 'CREATE_ROUTING_RULE',
    resource: 'RoutingRule',
    resource_id: rule.id,
    new_data: rule.toJSON(),
    ip_address: req.ip,
  });

  const [hydrated] = await hydrate([rule]);
  return success(res, hydrated, 'Routing rule created', 201);
}

// ─── Update ──────────────────────────────────────────────────────────────
async function update(req, res) {
  const rule = await RoutingRule.findByPk(req.params.id);
  if (!rule) return error(res, 'Routing rule not found', 404);

  const updates = {};
  for (const k of ['lead_source', 'language', 'target_type', 'target_id', 'position', 'is_active', 'notes']) {
    if (k in (req.body || {})) updates[k] = req.body[k];
  }
  if (updates.language === '' || updates.language === '_') updates.language = null;

  if (updates.target_type || updates.target_id) {
    const t = updates.target_type || rule.target_type;
    const id = updates.target_id || rule.target_id;
    if (!VALID_TARGET_TYPES.includes(t)) {
      return error(res, 'target_type must be "group" or "user"', 400);
    }
    const targetErr = await validateTarget(t, id);
    if (targetErr) return error(res, targetErr, 400);
  }

  const oldData = rule.toJSON();
  await rule.update(updates);

  await AuditLog.create({
    user_id: req.user.id,
    action: 'UPDATE_ROUTING_RULE',
    resource: 'RoutingRule',
    resource_id: rule.id,
    old_data: oldData,
    new_data: rule.toJSON(),
    ip_address: req.ip,
  });

  const [hydrated] = await hydrate([rule]);
  return success(res, hydrated, 'Routing rule updated');
}

// ─── Reorder ─────────────────────────────────────────────────────────────
// POST /:id/move { direction: 'up' | 'down' }  OR  { position: N }
// Swaps positions atomically with the neighbour. Keeps positions in a clean
// 0..N-1 sequence within the same (lead_source, language) bucket.
async function move(req, res) {
  const rule = await RoutingRule.findByPk(req.params.id);
  if (!rule) return error(res, 'Routing rule not found', 404);

  const { direction, position } = req.body || {};

  const siblings = await RoutingRule.findAll({
    where: { lead_source: rule.lead_source, language: rule.language },
    order: [['position', 'ASC']],
  });

  let targetIdx = siblings.findIndex((s) => s.id === rule.id);
  if (targetIdx < 0) return error(res, 'Rule missing from bucket', 500);

  if (direction === 'up') targetIdx = Math.max(0, targetIdx - 1);
  else if (direction === 'down') targetIdx = Math.min(siblings.length - 1, targetIdx + 1);
  else if (Number.isFinite(position)) targetIdx = Math.max(0, Math.min(siblings.length - 1, position));
  else return error(res, 'Provide direction ("up"/"down") or numeric position', 400);

  // Remove from current slot and reinsert at target.
  const reordered = siblings.filter((s) => s.id !== rule.id);
  reordered.splice(targetIdx, 0, rule);

  const tx = await sequelize.transaction();
  try {
    for (let i = 0; i < reordered.length; i += 1) {
      if (reordered[i].position !== i) {
        await reordered[i].update({ position: i }, { transaction: tx });
      }
    }
    await tx.commit();
  } catch (e) {
    await tx.rollback();
    return error(res, `Reorder failed: ${e.message}`, 500);
  }

  await AuditLog.create({
    user_id: req.user.id,
    action: 'MOVE_ROUTING_RULE',
    resource: 'RoutingRule',
    resource_id: rule.id,
    new_data: { lead_source: rule.lead_source, language: rule.language, new_position: targetIdx },
    ip_address: req.ip,
  });

  const refreshed = await RoutingRule.findAll({
    where: { lead_source: rule.lead_source, language: rule.language },
    order: [['position', 'ASC']],
  });
  const hydrated = await hydrate(refreshed);
  return success(res, { items: hydrated }, 'Reordered');
}

// ─── Delete ──────────────────────────────────────────────────────────────
async function remove(req, res) {
  const rule = await RoutingRule.findByPk(req.params.id);
  if (!rule) return error(res, 'Routing rule not found', 404);

  const snapshot = rule.toJSON();
  await rule.destroy(); // paranoid — soft delete

  await AuditLog.create({
    user_id: req.user.id,
    action: 'DELETE_ROUTING_RULE',
    resource: 'RoutingRule',
    resource_id: rule.id,
    old_data: snapshot,
    ip_address: req.ip,
  });

  return success(res, null, 'Routing rule deleted');
}

// ─── Helper: list available target options for the admin UI ──────────────
async function targetOptions(req, res) {
  const [groups, users] = await Promise.all([
    Group.findAll({
      where: { is_active: true, type: 'telesales' },
      attributes: ['id', 'name', 'language'],
      order: [['language', 'ASC'], ['name', 'ASC']],
    }),
    User.findAll({
      where: { is_active: true, role: { [Op.in]: ['tele_sales', 'senior'] } },
      attributes: ['id', 'first_name', 'last_name', 'role', 'languages'],
      order: [['first_name', 'ASC']],
    }),
  ]);

  return success(res, {
    groups: groups.map((g) => g.toJSON()),
    users: users.map((u) => u.toJSON()),
  });
}

module.exports = { list, create, update, move, remove, targetOptions };
