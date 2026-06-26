/**
 * Generic record CRUD for CUSTOM modules. Records live in the shared
 * module_records table; their values are a `custom_fields` JSONB blob validated
 * against the module's FieldDefinitions — so this controller reuses the exact
 * dynamic stack (processIncomingCustomFields, applyCustomFieldFilters) the
 * leads/users/etc. controllers use, just keyed by module_key.
 */

const { Op } = require('sequelize');
const {
  Module, ModuleRecord, User, sequelize,
} = require('../models');
const { success, error, paginated } = require('../utils/responseHelper');
const {
  processIncomingCustomFields,
  applyCustomFieldFilters,
  attachDefinitionsToResponse,
} = require('../utils/customFieldIntegration');

const CREATED_BY_INCLUDE = {
  model: User, as: 'createdBy', attributes: ['id', 'first_name', 'last_name'],
};

// Resolve a custom module by its slug. Built-ins have their own controllers.
async function resolveModule(req, res) {
  const mod = await Module.findOne({ where: { key: req.params.moduleKey } });
  if (!mod) { error(res, 'Module not found', 404); return null; }
  if (mod.is_system) { error(res, 'Built-in modules are managed by their own endpoints', 400); return null; }
  return mod;
}

/* GET /modules/:moduleKey/records */
exports.list = async (req, res) => {
  const mod = await resolveModule(req, res);
  if (!mod) return undefined;

  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 25));
  const offset = (page - 1) * limit;
  const sortBy = req.query.sort_by || 'created_at';
  const sortOrder = (req.query.sort_order || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  const where = { module_key: mod.key };
  if (req.query.search) {
    // Generic "search anything" across the record's values (no native name col).
    where[Op.and] = [
      sequelize.where(
        sequelize.literal('"ModuleRecord".custom_fields::text'),
        { [Op.iLike]: `%${req.query.search}%` },
      ),
    ];
  }

  // cf_* filters resolve against this module's field types (qualified by the
  // ModuleRecord alias since the createdBy include also has custom_fields-less
  // users — alias keeps the column unambiguous).
  const finalWhere = await applyCustomFieldFilters(where, req.query, 'ModuleRecord', mod.key);

  const { rows, count } = await ModuleRecord.findAndCountAll({
    where: finalWhere,
    include: [CREATED_BY_INCLUDE],
    order: [[sortBy, sortOrder]],
    limit,
    offset,
    distinct: true,
  });

  return paginated(res, rows, { total: count, page, limit });
};

/* GET /modules/:moduleKey/records/:id */
exports.getOne = async (req, res) => {
  const mod = await resolveModule(req, res);
  if (!mod) return undefined;
  const record = await ModuleRecord.findOne({
    where: { id: req.params.id, module_key: mod.key },
    include: [CREATED_BY_INCLUDE],
  });
  if (!record) return error(res, 'Record not found', 404);
  const withMeta = await attachDefinitionsToResponse(mod.key, record);
  return success(res, withMeta);
};

/* POST /modules/:moduleKey/records */
exports.create = async (req, res) => {
  const mod = await resolveModule(req, res);
  if (!mod) return undefined;

  const { custom_fields, errors } = await processIncomingCustomFields(mod.key, req.body, null);
  if (errors && errors.length) return error(res, errors.join('; '), 400, errors);

  const record = await ModuleRecord.create({
    module_key: mod.key,
    custom_fields: custom_fields || {},
    created_by: req.user.id,
  });
  return success(res, record, `${mod.label_singular} created`, 201);
};

/* PATCH /modules/:moduleKey/records/:id */
exports.update = async (req, res) => {
  const mod = await resolveModule(req, res);
  if (!mod) return undefined;
  const record = await ModuleRecord.findOne({ where: { id: req.params.id, module_key: mod.key } });
  if (!record) return error(res, 'Record not found', 404);

  const { custom_fields, errors } = await processIncomingCustomFields(mod.key, req.body, record);
  if (errors && errors.length) return error(res, errors.join('; '), 400, errors);

  await record.update({ custom_fields: custom_fields || {} });
  return success(res, record, `${mod.label_singular} updated`);
};

/* DELETE /modules/:moduleKey/records/:id */
exports.softDelete = async (req, res) => {
  const mod = await resolveModule(req, res);
  if (!mod) return undefined;
  const record = await ModuleRecord.findOne({ where: { id: req.params.id, module_key: mod.key } });
  if (!record) return error(res, 'Record not found', 404);
  await record.destroy();
  return success(res, { id: record.id }, `${mod.label_singular} deleted`);
};
