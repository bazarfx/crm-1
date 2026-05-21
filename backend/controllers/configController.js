const { Config } = require('../models');
const { success, error } = require('../utils/responseHelper');

async function list(req, res) {
  const where = {};
  if (req.query.category) where.category = req.query.category;
  if (req.query.active === 'true') where.is_active = true;

  const rows = await Config.findAll({
    where,
    order: [['category', 'ASC'], ['sort_order', 'ASC'], ['key', 'ASC']],
  });

  if (req.query.group === 'true') {
    const grouped = {};
    for (const r of rows) {
      grouped[r.category] = grouped[r.category] || [];
      grouped[r.category].push(r);
    }
    return success(res, grouped, 'OK');
  }
  return success(res, rows, 'OK');
}

async function create(req, res) {
  const { category, key, label, color, sort_order, is_active, metadata } = req.body || {};
  if (!category || !key || !label) {
    return error(res, 'category, key, and label are required', 400);
  }
  const row = await Config.create({
    category,
    key,
    label,
    color: color ?? null,
    sort_order: sort_order ?? 0,
    is_active: is_active ?? true,
    metadata: metadata ?? null,
  });
  return success(res, row, 'Created', 201);
}

async function update(req, res) {
  const row = await Config.findByPk(req.params.id);
  if (!row) return error(res, 'Not found', 404);
  const allowed = ['label', 'color', 'sort_order', 'is_active', 'metadata'];
  for (const k of allowed) {
    if (req.body[k] !== undefined) row[k] = req.body[k];
  }
  await row.save();
  return success(res, row, 'Updated');
}

async function remove(req, res) {
  const row = await Config.findByPk(req.params.id);
  if (!row) return error(res, 'Not found', 404);
  await row.destroy(); // soft delete (paranoid)
  return success(res, null, 'Deleted');
}

module.exports = { list, create, update, remove };
