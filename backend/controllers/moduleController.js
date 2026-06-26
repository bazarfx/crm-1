/**
 * Module registry CRUD. Built-in modules are read-only descriptors of the 6
 * native entities; custom modules are user-created and store their records in
 * the shared module_records table.
 */

const { fn, col } = require('sequelize');
const {
  Module, ModuleRecord, FieldDefinition, AuditLog, sequelize,
} = require('../models');
const { success, error } = require('../utils/responseHelper');
const { slugify, isBuiltInKey, invalidateModuleCache } = require('../utils/modules');

function serialize(m, counts) {
  return {
    id: m.id,
    key: m.key,
    label_singular: m.label_singular,
    label_plural: m.label_plural,
    icon: m.icon,
    color: m.color,
    description: m.description,
    is_system: m.is_system,
    is_active: m.is_active,
    display_order: m.display_order,
    field_count: counts?.fields?.[m.key] ?? 0,
    // record_count only meaningful for custom modules (built-ins use own tables)
    record_count: m.is_system ? null : (counts?.records?.[m.key] ?? 0),
  };
}

async function gatherCounts() {
  const [fieldRows, recordRows] = await Promise.all([
    FieldDefinition.findAll({
      attributes: ['entity_type', [fn('COUNT', col('id')), 'count']],
      where: { is_archived: false },
      group: ['entity_type'],
      raw: true,
    }),
    ModuleRecord.findAll({
      attributes: ['module_key', [fn('COUNT', col('id')), 'count']],
      group: ['module_key'],
      raw: true,
    }).catch(() => []),
  ]);
  const fields = {};
  for (const r of fieldRows) fields[r.entity_type] = Number(r.count) || 0;
  const records = {};
  for (const r of recordRows) records[r.module_key] = Number(r.count) || 0;
  return { fields, records };
}

/* GET /modules */
exports.list = async (req, res) => {
  const [modules, counts] = await Promise.all([
    Module.findAll({ order: [['display_order', 'ASC'], ['label_plural', 'ASC']] }),
    gatherCounts(),
  ]);
  return success(res, modules.map((m) => serialize(m, counts)));
};

/* GET /modules/:id */
exports.getOne = async (req, res) => {
  const m = await Module.findByPk(req.params.id);
  if (!m) return error(res, 'Module not found', 404);
  const counts = await gatherCounts();
  return success(res, serialize(m, counts));
};

/* POST /modules — create a custom module. */
exports.create = async (req, res) => {
  const {
    label_singular, label_plural, icon, color, description,
  } = req.body || {};
  if (!label_singular || !label_singular.trim()) return error(res, 'Singular label is required', 400);
  if (!label_plural || !label_plural.trim()) return error(res, 'Plural label is required', 400);

  let baseKey = slugify(label_singular) || 'module';
  if (isBuiltInKey(baseKey)) baseKey = `${baseKey}_custom`;
  let key = baseKey;
  let n = 2;
  // eslint-disable-next-line no-await-in-loop
  while (await Module.findOne({ where: { key }, paranoid: false })) {
    key = `${baseKey}_${n}`;
    n += 1;
  }

  const maxOrder = (await Module.max('display_order')) || 0;
  try {
    const m = await Module.create({
      key,
      label_singular: label_singular.trim(),
      label_plural: label_plural.trim(),
      icon: icon || 'Boxes',
      color: color || '#64748B',
      description: description || null,
      is_system: false,
      is_active: true,
      display_order: maxOrder + 10,
      created_by: req.user.id,
    });
    invalidateModuleCache();
    await AuditLog.create({
      user_id: req.user.id,
      action: 'CREATE_MODULE',
      resource: 'Module',
      resource_id: m.id,
      new_data: { key, label_singular: m.label_singular },
      ip_address: req.ip,
    }).catch(() => {});
    const counts = await gatherCounts();
    return success(res, serialize(m, counts), `Module "${m.label_plural}" created`, 201);
  } catch (e) {
    return error(res, e.message || 'Failed to create module', 500);
  }
};

/* PATCH /modules/:id */
exports.update = async (req, res) => {
  const m = await Module.findByPk(req.params.id);
  if (!m) return error(res, 'Module not found', 404);

  const {
    label_singular, label_plural, icon, color, description, display_order, is_active,
  } = req.body || {};
  const patch = {};
  if (label_singular != null && label_singular.trim()) patch.label_singular = label_singular.trim();
  if (label_plural != null && label_plural.trim()) patch.label_plural = label_plural.trim();
  if (icon !== undefined) patch.icon = icon || null;
  if (color) patch.color = color;
  if (description !== undefined) patch.description = description || null;
  if (display_order !== undefined) patch.display_order = Number(display_order) || 0;
  // System modules can be re-labelled/recoloured but never deactivated.
  if (is_active !== undefined && !m.is_system) patch.is_active = !!is_active;

  await m.update(patch);
  invalidateModuleCache();
  await AuditLog.create({
    user_id: req.user.id,
    action: 'UPDATE_MODULE',
    resource: 'Module',
    resource_id: m.id,
    new_data: patch,
    ip_address: req.ip,
  }).catch(() => {});
  const counts = await gatherCounts();
  return success(res, serialize(m, counts), 'Module updated');
};

/* DELETE /modules/:id — custom modules with no records only. */
exports.remove = async (req, res) => {
  const m = await Module.findByPk(req.params.id);
  if (!m) return error(res, 'Module not found', 404);
  if (m.is_system) return error(res, 'Built-in modules cannot be deleted', 403);

  const records = await ModuleRecord.count({ where: { module_key: m.key } });
  if (records > 0) {
    return error(res, `${records} record${records === 1 ? '' : 's'} still exist. Deactivate the module instead, or delete its records first.`, 409);
  }

  await m.destroy(); // paranoid soft-delete
  invalidateModuleCache();
  await AuditLog.create({
    user_id: req.user.id,
    action: 'DELETE_MODULE',
    resource: 'Module',
    resource_id: m.id,
    old_data: { key: m.key, label_plural: m.label_plural },
    ip_address: req.ip,
  }).catch(() => {});
  return success(res, { id: m.id }, `Module "${m.label_plural}" deleted`);
};
