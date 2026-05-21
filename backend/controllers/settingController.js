const { Setting, AuditLog } = require('../models');
const { success, error } = require('../utils/responseHelper');

// Default values used by the reset endpoint (kept in sync with seedSettings.js).
const DEFAULTS = {
  'assignment.mode': { mode: 'round_robin' },
  'assignment.language_strict': { enabled: true },
  'assignment.fallback_group': { enabled: true, group_id: null },
  'assignment.skip_inactive': { enabled: true },
  'assignment.daily_limit': { enabled: false, limit: 50 },
  'assignment.duplicate_action': { action: 'skip' },
  'display.leads_per_page': { count: 25 },
  'display.dashboard_refresh': { seconds: 60 },
  'system.ark_webhook_active': { enabled: true },
  'system.ingest_active': { enabled: true },
  'system.trial_mode': { enabled: false },
};

// GET /api/v1/settings — grouped by category. Admin sees only editable ones; super_admin sees all.
async function getAll(req, res) {
  const where = req.user.role === 'super_admin' ? {} : { is_editable_by_admin: true };
  const settings = await Setting.findAll({
    where,
    order: [['category', 'ASC'], ['key', 'ASC']],
  });
  const grouped = settings.reduce((acc, s) => {
    if (!acc[s.category]) acc[s.category] = [];
    acc[s.category].push(s);
    return acc;
  }, {});
  return success(res, grouped);
}

// GET /api/v1/settings/:key
async function getOne(req, res) {
  const where = { key: req.params.key };
  if (req.user.role !== 'super_admin') where.is_editable_by_admin = true;
  const setting = await Setting.findOne({ where });
  if (!setting) return error(res, 'Setting not found', 404);
  return success(res, setting);
}

// PATCH /api/v1/settings/:key — body: { value: <jsonb> }
async function update(req, res) {
  if (req.body?.value === undefined) {
    return error(res, '`value` is required in body', 400);
  }
  const where = { key: req.params.key };
  if (req.user.role !== 'super_admin') where.is_editable_by_admin = true;
  const setting = await Setting.findOne({ where });
  if (!setting) return error(res, 'Setting not found or insufficient permissions', 404);

  const oldValue = setting.value;
  await setting.update({ value: req.body.value, updated_by: req.user.id });

  await AuditLog.create({
    user_id: req.user.id,
    action: 'UPDATE',
    resource: 'Setting',
    resource_id: setting.id,
    old_data: { key: setting.key, value: oldValue },
    new_data: { key: setting.key, value: req.body.value },
    ip_address: req.ip,
    user_agent: req.headers['user-agent'] || null,
  });

  return success(res, setting, 'Setting updated');
}

// POST /api/v1/settings/reset — super_admin only. Body: { key?: string }
//   With key → reset just that one. Without → reset all to defaults.
async function reset(req, res) {
  const { key } = req.body || {};

  if (key) {
    const setting = await Setting.findOne({ where: { key } });
    if (!setting) return error(res, 'Setting not found', 404);
    const def = DEFAULTS[key];
    if (def === undefined) return error(res, `No default defined for ${key}`, 400);
    const oldValue = setting.value;
    await setting.update({ value: def, updated_by: req.user.id });
    await AuditLog.create({
      user_id: req.user.id,
      action: 'RESET',
      resource: 'Setting',
      resource_id: setting.id,
      old_data: { key, value: oldValue },
      new_data: { key, value: def },
      ip_address: req.ip,
    });
    return success(res, setting, `Setting ${key} reset to default`);
  }

  // Reset all
  const all = await Setting.findAll();
  let resetCount = 0;
  for (const s of all) {
    const def = DEFAULTS[s.key];
    if (def === undefined) continue;
    if (JSON.stringify(s.value) !== JSON.stringify(def)) {
      const oldValue = s.value;
      await s.update({ value: def, updated_by: req.user.id });
      await AuditLog.create({
        user_id: req.user.id,
        action: 'RESET',
        resource: 'Setting',
        resource_id: s.id,
        old_data: { key: s.key, value: oldValue },
        new_data: { key: s.key, value: def },
        ip_address: req.ip,
      });
      resetCount++;
    }
  }
  return success(res, { reset: resetCount }, `${resetCount} settings reset to defaults`);
}

module.exports = { getAll, getOne, update, reset, DEFAULTS };
