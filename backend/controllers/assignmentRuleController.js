const { Op } = require('sequelize');
const {
  sequelize,
  AssignmentRule,
  Lead,
  Group,
  User,
  AuditLog,
} = require('../models');
const { success, error } = require('../utils/responseHelper');
const { recordMatchesCriteria } = require('../utils/assignmentEngine');

const VALID_MATCH_TYPES = ['all', 'criteria'];
const VALID_STRATEGIES = ['user', 'round_robin'];
const VALID_TARGET_TYPES = ['user', 'group'];

// ── Shared validation ────────────────────────────────────────────────────────

// targets must be a non-empty array of { type:'user'|'group', id:<uuid> }.
// For 'user' strategy exactly one target is meaningful; for 'round_robin' many.
// Returns an error string, or null when valid. Also returns the cleaned array.
function validateTargets(targets) {
  if (!Array.isArray(targets) || targets.length === 0) {
    return { err: 'targets must be a non-empty array of { type, id }' };
  }
  const clean = [];
  for (const t of targets) {
    if (!t || typeof t !== 'object') return { err: 'each target must be an object { type, id }' };
    if (!VALID_TARGET_TYPES.includes(t.type)) {
      return { err: "target.type must be 'user' or 'group'" };
    }
    if (!t.id || typeof t.id !== 'string') return { err: 'target.id is required' };
    clean.push({ type: t.type, id: t.id });
  }
  return { clean };
}

// criteria must be { match, rules:[...] } when present. Kept permissive (the
// engine tolerates junk rules) but rejects obviously wrong shapes.
function validateCriteria(criteria) {
  if (criteria === null || criteria === undefined) return { clean: null };
  if (typeof criteria !== 'object' || Array.isArray(criteria)) {
    return { err: 'criteria must be an object { match, rules }' };
  }
  if (!Array.isArray(criteria.rules)) {
    return { err: 'criteria.rules must be an array' };
  }
  const match = String(criteria.match || 'and').toLowerCase() === 'or' ? 'or' : 'and';
  return { clean: { match, rules: criteria.rules } };
}

// Verify every referenced target actually exists + is usable, so a rule can't
// silently point at a deleted user/group.
async function verifyTargetsExist(targets) {
  const userIds = targets.filter((t) => t.type === 'user').map((t) => t.id);
  const groupIds = targets.filter((t) => t.type === 'group').map((t) => t.id);

  if (userIds.length) {
    const users = await User.findAll({ where: { id: { [Op.in]: userIds } }, attributes: ['id', 'is_active', 'role'] });
    const map = new Map(users.map((u) => [u.id, u]));
    for (const id of userIds) {
      const u = map.get(id);
      if (!u) return `Target user ${id} not found`;
      if (!u.is_active) return `Target user ${id} is inactive`;
      if (!['tele_sales', 'senior'].includes(u.role)) {
        return `Target user ${id} must be a teleseller or senior`;
      }
    }
  }
  if (groupIds.length) {
    const groups = await Group.findAll({ where: { id: { [Op.in]: groupIds } }, attributes: ['id', 'is_active'] });
    const map = new Map(groups.map((g) => [g.id, g]));
    for (const id of groupIds) {
      const g = map.get(id);
      if (!g) return `Target group ${id} not found`;
      if (!g.is_active) return `Target group ${id} is inactive`;
    }
  }
  return null;
}

// ── Hydrate targets → labels for the admin UI (avoids N lookups per row) ─────
async function hydrate(rules) {
  const list = Array.isArray(rules) ? rules : [rules];
  if (!list.length) return [];

  const userIds = new Set();
  const groupIds = new Set();
  for (const r of list) {
    for (const t of (Array.isArray(r.targets) ? r.targets : [])) {
      if (t.type === 'user') userIds.add(t.id);
      else if (t.type === 'group') groupIds.add(t.id);
    }
  }

  const [users, groups] = await Promise.all([
    userIds.size
      ? User.findAll({
          where: { id: { [Op.in]: [...userIds] } },
          attributes: ['id', 'first_name', 'last_name', 'role', 'is_active'],
          paranoid: false,
        })
      : [],
    groupIds.size
      ? Group.findAll({
          where: { id: { [Op.in]: [...groupIds] } },
          attributes: ['id', 'name', 'language', 'is_active'],
          paranoid: false,
        })
      : [],
  ]);
  const userMap = Object.fromEntries(users.map((u) => [u.id, u.toJSON()]));
  const groupMap = Object.fromEntries(groups.map((g) => [g.id, g.toJSON()]));

  return list.map((r) => {
    const json = r.toJSON ? r.toJSON() : r;
    json.targets = (Array.isArray(json.targets) ? json.targets : []).map((t) => ({
      ...t,
      label: t.type === 'user'
        ? (() => {
            const u = userMap[t.id];
            return u ? `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.id : null;
          })()
        : (groupMap[t.id]?.name || null),
      resolved: t.type === 'user' ? userMap[t.id] || null : groupMap[t.id] || null,
    }));
    return json;
  });
}

// ── List (ordered by position) ───────────────────────────────────────────────
async function list(req, res) {
  const where = { module: req.query.module || 'lead' };
  if (req.query.is_active !== undefined) where.is_active = req.query.is_active === 'true';

  const rules = await AssignmentRule.findAll({
    where,
    order: [['position', 'ASC'], ['created_at', 'ASC']],
  });
  const items = await hydrate(rules);
  return success(res, { items });
}

// ── Get one ──────────────────────────────────────────────────────────────────
async function getOne(req, res) {
  const rule = await AssignmentRule.findByPk(req.params.id);
  if (!rule) return error(res, 'Assignment rule not found', 404);
  const [hydrated] = await hydrate([rule]);
  return success(res, hydrated);
}

// ── Create ───────────────────────────────────────────────────────────────────
async function create(req, res) {
  const {
    name, description, module = 'lead',
    match_type = 'criteria', criteria,
    assign_strategy = 'user', targets, is_active,
  } = req.body || {};

  if (!name || !name.trim()) return error(res, 'name is required', 400);
  if (!VALID_MATCH_TYPES.includes(match_type)) {
    return error(res, "match_type must be 'all' or 'criteria'", 400);
  }
  if (!VALID_STRATEGIES.includes(assign_strategy)) {
    return error(res, "assign_strategy must be 'user' or 'round_robin'", 400);
  }

  const { clean: cleanTargets, err: tErr } = validateTargets(targets);
  if (tErr) return error(res, tErr, 400);

  // criteria required only when match_type = 'criteria'.
  let cleanCriteria = null;
  if (match_type === 'criteria') {
    const { clean, err: cErr } = validateCriteria(criteria);
    if (cErr) return error(res, cErr, 400);
    if (!clean || clean.rules.length === 0) {
      return error(res, "criteria with at least one rule is required when match_type = 'criteria'", 400);
    }
    cleanCriteria = clean;
  }

  const existErr = await verifyTargetsExist(cleanTargets);
  if (existErr) return error(res, existErr, 400);

  // Append at the end of the ordered list for this module.
  const lastPos = await AssignmentRule.max('position', { where: { module } });
  const position = Number.isFinite(lastPos) ? lastPos + 1 : 0;

  const rule = await AssignmentRule.create({
    name: name.trim(),
    description: description || null,
    module,
    match_type,
    criteria: cleanCriteria,
    assign_strategy,
    targets: cleanTargets,
    rr_index: 0,
    position,
    is_active: is_active === undefined ? true : !!is_active,
    created_by: req.user.id,
  });

  await AuditLog.create({
    user_id: req.user.id,
    action: 'CREATE_ASSIGNMENT_RULE',
    resource: 'AssignmentRule',
    resource_id: rule.id,
    new_data: rule.toJSON(),
    ip_address: req.ip,
  });

  const [hydrated] = await hydrate([rule]);
  return success(res, hydrated, 'Assignment rule created', 201);
}

// ── Update ───────────────────────────────────────────────────────────────────
async function update(req, res) {
  const rule = await AssignmentRule.findByPk(req.params.id);
  if (!rule) return error(res, 'Assignment rule not found', 404);

  const body = req.body || {};
  const updates = {};

  if ('name' in body) {
    if (!body.name || !body.name.trim()) return error(res, 'name cannot be empty', 400);
    updates.name = body.name.trim();
  }
  if ('description' in body) updates.description = body.description || null;
  if ('module' in body) updates.module = body.module || 'lead';
  if ('is_active' in body) updates.is_active = !!body.is_active;

  if ('match_type' in body) {
    if (!VALID_MATCH_TYPES.includes(body.match_type)) {
      return error(res, "match_type must be 'all' or 'criteria'", 400);
    }
    updates.match_type = body.match_type;
  }
  if ('assign_strategy' in body) {
    if (!VALID_STRATEGIES.includes(body.assign_strategy)) {
      return error(res, "assign_strategy must be 'user' or 'round_robin'", 400);
    }
    updates.assign_strategy = body.assign_strategy;
    // Changing the rotation shape resets the cursor to stay in-bounds.
    updates.rr_index = 0;
  }

  if ('targets' in body) {
    const { clean, err: tErr } = validateTargets(body.targets);
    if (tErr) return error(res, tErr, 400);
    const existErr = await verifyTargetsExist(clean);
    if (existErr) return error(res, existErr, 400);
    updates.targets = clean;
    updates.rr_index = 0; // target list changed — restart rotation
  }

  // criteria handling respects the effective match_type (post-update).
  const effectiveMatchType = updates.match_type || rule.match_type;
  if ('criteria' in body) {
    const { clean, err: cErr } = validateCriteria(body.criteria);
    if (cErr) return error(res, cErr, 400);
    updates.criteria = clean;
  }
  if (effectiveMatchType === 'criteria') {
    const eff = 'criteria' in updates ? updates.criteria : rule.criteria;
    if (!eff || !Array.isArray(eff.rules) || eff.rules.length === 0) {
      return error(res, "criteria with at least one rule is required when match_type = 'criteria'", 400);
    }
  } else if (effectiveMatchType === 'all' && !('criteria' in updates)) {
    // 'all' rules carry no criteria.
    updates.criteria = null;
  }

  const oldData = rule.toJSON();
  await rule.update(updates);

  await AuditLog.create({
    user_id: req.user.id,
    action: 'UPDATE_ASSIGNMENT_RULE',
    resource: 'AssignmentRule',
    resource_id: rule.id,
    old_data: oldData,
    new_data: rule.toJSON(),
    ip_address: req.ip,
  });

  const [hydrated] = await hydrate([rule]);
  return success(res, hydrated, 'Assignment rule updated');
}

// ── Delete (paranoid soft delete) ────────────────────────────────────────────
async function remove(req, res) {
  const rule = await AssignmentRule.findByPk(req.params.id);
  if (!rule) return error(res, 'Assignment rule not found', 404);

  const snapshot = rule.toJSON();
  await rule.destroy(); // paranoid — soft delete

  await AuditLog.create({
    user_id: req.user.id,
    action: 'DELETE_ASSIGNMENT_RULE',
    resource: 'AssignmentRule',
    resource_id: rule.id,
    old_data: snapshot,
    ip_address: req.ip,
  });

  return success(res, null, 'Assignment rule deleted');
}

// ── Reorder — accepts [{ id, position }] ─────────────────────────────────────
async function reorder(req, res) {
  const order = req.body?.order || req.body;
  if (!Array.isArray(order) || order.length === 0) {
    return error(res, 'Body must be an array of { id, position }', 400);
  }

  const ids = order.map((o) => o && o.id).filter(Boolean);
  const rules = await AssignmentRule.findAll({ where: { id: { [Op.in]: ids } } });
  const byId = new Map(rules.map((r) => [r.id, r]));

  const t = await sequelize.transaction();
  try {
    for (const item of order) {
      const rule = item && byId.get(item.id);
      if (!rule) continue;
      const pos = Number(item.position);
      if (!Number.isFinite(pos)) continue;
      if (rule.position !== pos) {
        // eslint-disable-next-line no-await-in-loop
        await rule.update({ position: pos }, { transaction: t });
      }
    }
    await t.commit();
  } catch (e) {
    await t.rollback();
    return error(res, `Reorder failed: ${e.message}`, 500);
  }

  await AuditLog.create({
    user_id: req.user.id,
    action: 'REORDER_ASSIGNMENT_RULES',
    resource: 'AssignmentRule',
    resource_id: null,
    new_data: { order },
    ip_address: req.ip,
  });

  const refreshed = await AssignmentRule.findAll({
    where: { module: 'lead' },
    order: [['position', 'ASC'], ['created_at', 'ASC']],
  });
  const items = await hydrate(refreshed);
  return success(res, { items }, 'Reordered');
}

// ── Preview — "N of the last ~200 leads match this criteria" (Zoho hint) ─────
async function preview(req, res) {
  const { criteria, match_type = 'criteria' } = req.body || {};

  // A match-all rule trivially matches every sampled lead.
  let effectiveCriteria = null;
  if (match_type !== 'all') {
    const { clean, err: cErr } = validateCriteria(criteria);
    if (cErr) return error(res, cErr, 400);
    if (!clean || clean.rules.length === 0) {
      return error(res, 'Provide criteria with at least one rule, or match_type "all"', 400);
    }
    effectiveCriteria = clean;
  }

  const SAMPLE = 200;
  const leads = await Lead.findAll({
    order: [['created_at', 'DESC']],
    limit: SAMPLE,
  });

  let matched = 0;
  for (const lead of leads) {
    const record = lead.toJSON();
    if (match_type === 'all' || recordMatchesCriteria(record, effectiveCriteria)) matched += 1;
  }

  return success(res, {
    matched,
    sampled: leads.length,
    sample_size: SAMPLE,
  }, `${matched} of the last ${leads.length} lead${leads.length === 1 ? '' : 's'} match`);
}

module.exports = {
  list,
  getOne,
  create,
  update,
  remove,
  reorder,
  preview,
};
