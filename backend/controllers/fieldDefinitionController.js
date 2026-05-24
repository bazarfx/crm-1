const { FieldDefinition, sequelize, ...models } = require('../models');
const { success, error } = require('../utils/responseHelper');
const { invalidateCache } = require('../utils/customFieldValidator');

// Schema editing is a high-blast-radius capability — we gate it to a tiny
// allowlist of roles regardless of the permission matrix. (super_admin always
// has access via the universal hardcoded shortcut in utils/permissions.js.)
const SCHEMA_EDITOR_ROLES = ['super_admin', 'schema_editor'];

function requireSchemaRole(req, res) {
  if (!SCHEMA_EDITOR_ROLES.includes(req.user?.role)) {
    error(res, 'Only super admin or schema editor can manage field definitions', 403);
    return false;
  }
  return true;
}

// Map entity_type → Sequelize model name. Deals are a view of Leads, so
// `deal` rows share the leads table (same custom_fields blob).
const ENTITY_MODEL_MAP = {
  lead: 'Lead',
  user: 'User',
  deal: 'Lead',
  campaign: 'Campaign',
  group: 'Group',
  lead_activity: 'LeadActivity',
};

// Names we will not let an admin shadow with a custom field — would collide
// with native Sequelize columns and silently break list/sort queries.
const RESERVED_KEYS = new Set([
  'id', 'created_at', 'updated_at', 'createdAt', 'updatedAt',
  'is_deleted', 'deleted_at', 'deleted_by', 'deletedAt',
  'custom_fields',
]);

exports.list = async (req, res) => {
  try {
    const { entity_type, include_archived } = req.query;
    const where = {};
    if (entity_type) where.entity_type = entity_type;
    if (include_archived !== 'true') where.is_archived = false;

    const defs = await FieldDefinition.findAll({
      where,
      order: [['entity_type', 'ASC'], ['display_order', 'ASC'], ['createdAt', 'ASC']],
    });

    const grouped = {};
    for (const d of defs) {
      if (!grouped[d.entity_type]) grouped[d.entity_type] = [];
      grouped[d.entity_type].push(d);
    }

    return success(res, {
      items: defs,
      grouped,
      valid_entities: FieldDefinition.VALID_ENTITIES,
      valid_types: FieldDefinition.VALID_TYPES,
    });
  } catch (e) {
    return error(res, e.message, 500);
  }
};

exports.getOne = async (req, res) => {
  try {
    const def = await FieldDefinition.findByPk(req.params.id);
    if (!def) return error(res, 'Field not found', 404);
    return success(res, def);
  } catch (e) {
    return error(res, e.message, 500);
  }
};

exports.create = async (req, res) => {
  if (!requireSchemaRole(req, res)) return;
  try {
    const payload = { ...req.body, created_by: req.user.id };

    if (!FieldDefinition.VALID_ENTITIES.includes(payload.entity_type)) {
      return error(
        res,
        `Invalid entity_type. Must be: ${FieldDefinition.VALID_ENTITIES.join(', ')}`,
        400,
      );
    }
    if (!FieldDefinition.VALID_TYPES.includes(payload.field_type)) {
      return error(
        res,
        `Invalid field_type. Must be: ${FieldDefinition.VALID_TYPES.join(', ')}`,
        400,
      );
    }
    if (RESERVED_KEYS.has(payload.field_key)) {
      return error(res, `"${payload.field_key}" is a reserved field name`, 400);
    }

    if (['dropdown', 'multiselect'].includes(payload.field_type)) {
      if (!Array.isArray(payload.options) || payload.options.length === 0) {
        return error(res, 'dropdown and multiselect fields require options array', 400);
      }
      for (const opt of payload.options) {
        if (!opt.value || !opt.label) {
          return error(res, 'each option needs {value, label}', 400);
        }
      }
    }

    const def = await FieldDefinition.create(payload);
    invalidateCache();
    return success(res, def, 'Field created', 201);
  } catch (e) {
    if (e.name === 'SequelizeUniqueConstraintError') {
      return error(
        res,
        `A field with key "${req.body.field_key}" already exists for ${req.body.entity_type}`,
        409,
      );
    }
    if (e.name === 'SequelizeValidationError') {
      return error(res, e.errors.map((er) => er.message).join('; '), 400);
    }
    return error(res, e.message, 500);
  }
};

exports.update = async (req, res) => {
  if (!requireSchemaRole(req, res)) return;
  try {
    const def = await FieldDefinition.findByPk(req.params.id);
    if (!def) return error(res, 'Field not found', 404);

    const { field_key, entity_type, field_type, ...rest } = req.body;
    if (field_key && field_key !== def.field_key) {
      return error(
        res,
        'field_key cannot be changed after creation (rename would orphan data)',
        400,
      );
    }
    if (entity_type && entity_type !== def.entity_type) {
      return error(res, 'entity_type cannot be changed after creation', 400);
    }
    if (field_type && field_type !== def.field_type) {
      return error(
        res,
        'field_type cannot be changed after creation (would corrupt existing data)',
        400,
      );
    }

    await def.update(rest);
    invalidateCache();
    return success(res, def, 'Field updated');
  } catch (e) {
    if (e.name === 'SequelizeValidationError') {
      return error(res, e.errors.map((er) => er.message).join('; '), 400);
    }
    return error(res, e.message, 500);
  }
};

exports.archive = async (req, res) => {
  if (!requireSchemaRole(req, res)) return;
  try {
    const def = await FieldDefinition.findByPk(req.params.id);
    if (!def) return error(res, 'Field not found', 404);
    if (def.is_archived) return error(res, 'Already archived', 400);

    await def.update({
      is_archived: true,
      archived_at: new Date(),
      archived_by: req.user.id,
    });
    invalidateCache();
    return success(res, def, 'Field archived. Existing data is preserved.');
  } catch (e) {
    return error(res, e.message, 500);
  }
};

exports.restore = async (req, res) => {
  if (!requireSchemaRole(req, res)) return;
  try {
    const def = await FieldDefinition.findByPk(req.params.id);
    if (!def) return error(res, 'Field not found', 404);
    if (!def.is_archived) return error(res, 'Not archived', 400);

    await def.update({ is_archived: false, archived_at: null, archived_by: null });
    invalidateCache();
    return success(res, def, 'Field restored');
  } catch (e) {
    return error(res, e.message, 500);
  }
};

exports.reorder = async (req, res) => {
  if (!requireSchemaRole(req, res)) return;
  try {
    const { entity_type, ordered_ids } = req.body;
    if (!Array.isArray(ordered_ids)) {
      return error(res, 'ordered_ids must be an array', 400);
    }

    await sequelize.transaction(async (t) => {
      for (let i = 0; i < ordered_ids.length; i++) {
        await FieldDefinition.update(
          { display_order: (i + 1) * 10 },
          { where: { id: ordered_ids[i], entity_type }, transaction: t },
        );
      }
    });
    invalidateCache();
    return success(res, null, 'Reordered');
  } catch (e) {
    return error(res, e.message, 500);
  }
};

// POST /field-definitions/:id/backfill-default
// Writes the field's current `default_value` into every existing record of
// the entity where the field is currently missing or null. Returns the
// affected count. IRREVERSIBLE — the caller is expected to have confirmed
// the action in the UI before triggering this.
//
// Privileged-only: super_admin + schema_editor. Logs an AuditLog row.
exports.backfillDefault = async (req, res) => {
  try {
    if (!SCHEMA_EDITOR_ROLES.includes(req.user?.role)) {
      return error(res, 'Only super admin or schema editor can backfill defaults', 403);
    }

    const def = await FieldDefinition.findByPk(req.params.id);
    if (!def) return error(res, 'Field not found', 404);
    if (def.is_archived) return error(res, 'Cannot backfill an archived field', 400);
    if (def.default_value === null || def.default_value === undefined) {
      return error(res, 'Field has no default_value set — nothing to backfill', 400);
    }

    const modelName = ENTITY_MODEL_MAP[def.entity_type];
    const Model = models[modelName];
    if (!Model) return error(res, `Entity ${def.entity_type} not available`, 400);

    const tableName = Model.getTableName();

    // Only touch rows where the field is currently absent or null — never
    // overwrite a value an operator has already entered. The default_value
    // is stored as JSONB on FieldDefinition, so to_jsonb it back out and
    // jsonb_set it into custom_fields under the field_key path.
    //
    // count() check up front so we can return an accurate affected_count
    // even if the UPDATE returns 0 rowCount on some drivers.
    const [{ count: affected }] = await sequelize.query(
      `SELECT COUNT(*)::int AS count FROM "${tableName}"
       WHERE NOT (custom_fields ? :key)
          OR custom_fields->>:key IS NULL
          OR custom_fields->>:key = ''`,
      {
        replacements: { key: def.field_key },
        type: sequelize.QueryTypes.SELECT,
      },
    );

    await sequelize.query(
      `UPDATE "${tableName}"
       SET custom_fields = jsonb_set(
         COALESCE(custom_fields, '{}'::jsonb),
         ARRAY[:key]::text[],
         to_jsonb(:val::text)::jsonb,
         true
       )
       WHERE NOT (custom_fields ? :key)
          OR custom_fields->>:key IS NULL
          OR custom_fields->>:key = ''`,
      {
        replacements: {
          key: def.field_key,
          // JSON-stringify so booleans/numbers/arrays survive the round trip
          // through the text bind parameter. to_jsonb(:val::text)::jsonb
          // re-parses it on the postgres side.
          val: JSON.stringify(def.default_value),
        },
      },
    );

    const { AuditLog } = models;
    if (AuditLog) {
      await AuditLog.create({
        user_id: req.user.id,
        action: 'BACKFILL_FIELD_DEFAULT',
        resource: 'FieldDefinition',
        resource_id: def.id,
        new_data: {
          field_key: def.field_key,
          entity_type: def.entity_type,
          default_value: def.default_value,
          affected_count: affected,
        },
        ip_address: req.ip,
      }).catch(() => {});
    }

    return success(res, {
      affected_count: affected,
      field_key: def.field_key,
      entity_type: def.entity_type,
      default_value: def.default_value,
    }, `Backfilled ${affected} record${affected === 1 ? '' : 's'}`);
  } catch (e) {
    return error(res, e.message, 500);
  }
};

// GET /field-definitions/:id/option-usage?value=<v>
// Returns how many existing records hold this option value for this field.
// Dropdown stores it as a scalar; multiselect as an element inside the
// JSON array — the query branches on field_type to handle both.
exports.getOptionUsage = async (req, res) => {
  try {
    const def = await FieldDefinition.findByPk(req.params.id);
    if (!def) return error(res, 'Field not found', 404);
    if (!['dropdown', 'multiselect'].includes(def.field_type)) {
      return error(res, 'Option usage is only meaningful for dropdown / multiselect fields', 400);
    }
    const value = req.query.value;
    if (value === undefined) return error(res, 'value query param is required', 400);

    const modelName = ENTITY_MODEL_MAP[def.entity_type];
    const Model = models[modelName];
    if (!Model) return success(res, { count: 0 });

    const tableName = Model.getTableName();

    let countSql;
    if (def.field_type === 'dropdown') {
      countSql = `SELECT COUNT(*)::int AS count FROM "${tableName}"
                  WHERE custom_fields->>:key = :val`;
    } else {
      // multiselect: value lives inside a JSON array under custom_fields[key].
      // jsonb '?' tests array element membership.
      countSql = `SELECT COUNT(*)::int AS count FROM "${tableName}"
                  WHERE (custom_fields->:key) ? :val`;
    }

    const [{ count }] = await sequelize.query(countSql, {
      replacements: { key: def.field_key, val: String(value) },
      type: sequelize.QueryTypes.SELECT,
    });

    return success(res, {
      count,
      field_key: def.field_key,
      entity_type: def.entity_type,
      field_type: def.field_type,
      value,
    });
  } catch (e) {
    return error(res, e.message, 500);
  }
};

// POST /field-definitions/:id/migrate-options
// body: { migrations: [{ removed_value, strategy, replacement_value? }] }
//   strategy ∈ 'keep' | 'empty' | 'replace'
//
// Applies the migration to existing records inside a single transaction.
// Does NOT touch the field definition itself — the caller PATCHes the new
// `options` array separately afterwards. This split keeps each endpoint
// idempotent and lets the frontend show a granular per-option result.
exports.migrateOptions = async (req, res) => {
  try {
    if (!SCHEMA_EDITOR_ROLES.includes(req.user?.role)) {
      return error(res, 'Only super admin or schema editor can migrate options', 403);
    }
    const def = await FieldDefinition.findByPk(req.params.id);
    if (!def) return error(res, 'Field not found', 404);
    if (!['dropdown', 'multiselect'].includes(def.field_type)) {
      return error(res, 'Option migration is only valid for dropdown / multiselect', 400);
    }
    const { migrations } = req.body || {};
    if (!Array.isArray(migrations) || migrations.length === 0) {
      return error(res, 'migrations must be a non-empty array', 400);
    }

    const modelName = ENTITY_MODEL_MAP[def.entity_type];
    const Model = models[modelName];
    if (!Model) return error(res, `Entity ${def.entity_type} not available`, 400);
    const tableName = Model.getTableName();

    const results = [];

    await sequelize.transaction(async (t) => {
      for (const m of migrations) {
        const { removed_value, strategy, replacement_value } = m;
        if (!removed_value) {
          results.push({ removed_value, strategy, status: 'skipped', reason: 'no removed_value' });
          continue;
        }
        if (!['keep', 'empty', 'replace'].includes(strategy)) {
          results.push({ removed_value, strategy, status: 'skipped', reason: 'unknown strategy' });
          continue;
        }
        if (strategy === 'replace' && (replacement_value === undefined || replacement_value === null || replacement_value === '')) {
          results.push({ removed_value, strategy, status: 'skipped', reason: 'replacement_value required' });
          continue;
        }
        if (strategy === 'keep') {
          results.push({ removed_value, strategy, affected: 0, status: 'ok', note: 'records kept as-is' });
          continue;
        }

        // SQL per strategy × field_type. The four combinations are spelled
        // out explicitly so the reader can match them against the docstring.
        let sql;
        const repl = { key: def.field_key, old: String(removed_value) };

        if (def.field_type === 'dropdown' && strategy === 'empty') {
          // scalar match → null it
          sql = `UPDATE "${tableName}"
                 SET custom_fields = jsonb_set(custom_fields, ARRAY[:key]::text[], 'null'::jsonb, true)
                 WHERE custom_fields->>:key = :old`;
        } else if (def.field_type === 'dropdown' && strategy === 'replace') {
          sql = `UPDATE "${tableName}"
                 SET custom_fields = jsonb_set(custom_fields, ARRAY[:key]::text[], to_jsonb(:new::text)::jsonb, true)
                 WHERE custom_fields->>:key = :old`;
          repl.new = String(replacement_value);
        } else if (def.field_type === 'multiselect' && strategy === 'empty') {
          // array element removal: rebuild the array sans the removed value
          sql = `UPDATE "${tableName}"
                 SET custom_fields = jsonb_set(
                   custom_fields,
                   ARRAY[:key]::text[],
                   COALESCE(
                     (SELECT jsonb_agg(elem) FROM jsonb_array_elements_text(custom_fields->:key) elem WHERE elem <> :old),
                     '[]'::jsonb
                   ),
                   true
                 )
                 WHERE (custom_fields->:key) ? :old`;
        } else if (def.field_type === 'multiselect' && strategy === 'replace') {
          // swap old → new inside the array, then dedupe so we don't end up
          // with the replacement appearing twice when the record already had it.
          sql = `UPDATE "${tableName}"
                 SET custom_fields = jsonb_set(
                   custom_fields,
                   ARRAY[:key]::text[],
                   (SELECT jsonb_agg(DISTINCT v)
                    FROM (
                      SELECT CASE WHEN elem = :old THEN :new ELSE elem END AS v
                      FROM jsonb_array_elements_text(custom_fields->:key) elem
                    ) sub),
                   true
                 )
                 WHERE (custom_fields->:key) ? :old`;
          repl.new = String(replacement_value);
        }

        if (sql) {
          const [, info] = await sequelize.query(sql, {
            replacements: repl,
            transaction: t,
          });
          // pg returns rowCount on info; node-postgres sometimes wraps it.
          const affected = info?.rowCount ?? info?.affectedRows ?? 0;
          results.push({
            removed_value,
            strategy,
            replacement_value: strategy === 'replace' ? replacement_value : undefined,
            affected,
            status: 'ok',
          });
        }
      }

      // Audit the whole batch in one row — easier to grep "this migration"
      // than to correlate N separate audit rows by timestamp.
      const { AuditLog } = models;
      if (AuditLog) {
        await AuditLog.create({
          user_id: req.user.id,
          action: 'MIGRATE_FIELD_OPTIONS',
          resource: 'FieldDefinition',
          resource_id: def.id,
          new_data: {
            field_key: def.field_key,
            entity_type: def.entity_type,
            migrations,
            results,
          },
          ip_address: req.ip,
        }, { transaction: t }).catch(() => {});
      }
    });

    return success(res, { results, field_key: def.field_key });
  } catch (e) {
    return error(res, e.message, 500);
  }
};

// GET /field-definitions/:id/backfill-preview
// Returns how many rows WOULD be touched by a backfill, without writing
// anything. Used by the confirmation dialog so the user sees "Apply to
// 47 leads?" instead of a blind "Apply to all?".
exports.backfillPreview = async (req, res) => {
  try {
    if (!SCHEMA_EDITOR_ROLES.includes(req.user?.role)) {
      return error(res, 'Only super admin or schema editor can preview backfill', 403);
    }

    const def = await FieldDefinition.findByPk(req.params.id);
    if (!def) return error(res, 'Field not found', 404);

    const modelName = ENTITY_MODEL_MAP[def.entity_type];
    const Model = models[modelName];
    if (!Model) return success(res, { affected_count: 0, total_count: 0 });

    const tableName = Model.getTableName();
    const [{ count: affected }] = await sequelize.query(
      `SELECT COUNT(*)::int AS count FROM "${tableName}"
       WHERE NOT (custom_fields ? :key)
          OR custom_fields->>:key IS NULL
          OR custom_fields->>:key = ''`,
      { replacements: { key: def.field_key }, type: sequelize.QueryTypes.SELECT },
    );
    const [{ count: total }] = await sequelize.query(
      `SELECT COUNT(*)::int AS count FROM "${tableName}"`,
      { type: sequelize.QueryTypes.SELECT },
    );

    return success(res, {
      affected_count: affected,
      total_count: total,
      field_key: def.field_key,
      entity_type: def.entity_type,
      default_value: def.default_value,
    });
  } catch (e) {
    return error(res, e.message, 500);
  }
};

// POST /field-definitions/test-render
// Hypothetical-validation endpoint for the field editor UI. Takes a draft
// FieldDefinition payload (NOT persisted) plus a sample_value, returns
// whether the value would validate against that draft + render hints the
// preview pane can display while the editor is being configured.
exports.testRender = async (req, res) => {
  try {
    if (!SCHEMA_EDITOR_ROLES.includes(req.user?.role)) {
      return error(res, 'Only super admin or schema editor can use test-render', 403);
    }

    const { definition, sample_value } = req.body || {};
    if (!definition || !definition.field_type) {
      return error(res, 'definition with field_type required', 400);
    }
    if (!FieldDefinition.VALID_TYPES.includes(definition.field_type)) {
      return error(res, `Invalid field_type. Must be: ${FieldDefinition.VALID_TYPES.join(', ')}`, 400);
    }

    const fakeDef = {
      ...definition,
      options: Array.isArray(definition.options) ? definition.options : [],
      validation: definition.validation || {},
    };

    const validation = { valid: true, errors: [], coerced_value: sample_value };

    if (sample_value !== null && sample_value !== undefined && sample_value !== '') {
      try {
        switch (fakeDef.field_type) {
          case 'number':
          case 'currency':
          case 'percent': {
            const n = Number(sample_value);
            if (Number.isNaN(n)) {
              validation.valid = false;
              validation.errors.push('Sample value is not a number');
            } else {
              validation.coerced_value = n;
              const v = fakeDef.validation;
              if (v.min !== undefined && n < v.min) {
                validation.valid = false;
                validation.errors.push(`Sample value below min (${v.min})`);
              }
              if (v.max !== undefined && n > v.max) {
                validation.valid = false;
                validation.errors.push(`Sample value above max (${v.max})`);
              }
              if (fakeDef.field_type === 'percent' && (n < 0 || n > 100)) {
                validation.valid = false;
                validation.errors.push('Percent must be 0-100');
              }
            }
            break;
          }
          case 'boolean': {
            if (sample_value === true || sample_value === 'true') validation.coerced_value = true;
            else if (sample_value === false || sample_value === 'false') validation.coerced_value = false;
            else {
              validation.valid = false;
              validation.errors.push('Boolean must be true or false');
            }
            break;
          }
          case 'date':
          case 'datetime': {
            const d = new Date(sample_value);
            if (Number.isNaN(d.getTime())) {
              validation.valid = false;
              validation.errors.push('Invalid date');
            } else {
              validation.coerced_value = d.toISOString();
            }
            break;
          }
          case 'email': {
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sample_value)) {
              validation.valid = false;
              validation.errors.push('Sample value is not a valid email');
            }
            break;
          }
          case 'dropdown': {
            const validValues = fakeDef.options.map((o) => o.value);
            if (!validValues.includes(sample_value)) {
              validation.valid = false;
              validation.errors.push(`Sample value must be one of: ${validValues.join(', ')}`);
            }
            break;
          }
          case 'multiselect':
          case 'tags': {
            if (!Array.isArray(sample_value)) {
              validation.valid = false;
              validation.errors.push('Sample value must be an array');
            } else if (fakeDef.field_type === 'multiselect') {
              const validValues = fakeDef.options.map((o) => o.value);
              for (const v of sample_value) {
                if (!validValues.includes(v)) {
                  validation.valid = false;
                  validation.errors.push(`"${v}" not in options`);
                }
              }
            }
            break;
          }
          case 'text':
          case 'long_text':
          case 'phone':
          case 'url':
          case 'file_link': {
            const s = String(sample_value);
            const v = fakeDef.validation;
            if (v.min_length && s.length < v.min_length) {
              validation.valid = false;
              validation.errors.push(`min length ${v.min_length}`);
            }
            if (v.max_length && s.length > v.max_length) {
              validation.valid = false;
              validation.errors.push(`max length ${v.max_length}`);
            }
            if (v.regex) {
              try {
                if (!new RegExp(v.regex).test(s)) {
                  validation.valid = false;
                  validation.errors.push('does not match required format');
                }
              } catch (_) {
                validation.valid = false;
                validation.errors.push('invalid regex in validation config');
              }
            }
            validation.coerced_value = s;
            break;
          }
          default:
            break;
        }
      } catch (e) {
        validation.valid = false;
        validation.errors.push(e.message);
      }
    } else if (fakeDef.is_required) {
      validation.valid = false;
      validation.errors.push(`${fakeDef.label || 'Field'} is required`);
    }

    return success(res, {
      definition: fakeDef,
      sample_value,
      validation,
      render_hint: {
        component_type: fakeDef.field_type,
        label: fakeDef.label,
        helper_text: fakeDef.helper_text,
        is_required: !!fakeDef.is_required,
        options: fakeDef.options,
      },
    });
  } catch (e) {
    return error(res, e.message, 500);
  }
};

// How many rows of the target entity currently store a non-null value for
// this field. Used by the UI to warn before archive ("this will hide a
// field that 1,243 leads depend on").
exports.usageCount = async (req, res) => {
  try {
    const def = await FieldDefinition.findByPk(req.params.id);
    if (!def) return error(res, 'Field not found', 404);

    const modelName = ENTITY_MODEL_MAP[def.entity_type];
    const Model = models[modelName];
    if (!Model) {
      return success(res, { count: 0, note: 'entity model not available' });
    }

    const tableName = Model.getTableName();
    const result = await sequelize.query(
      `SELECT COUNT(*)::int AS count FROM "${tableName}"
       WHERE custom_fields ? :key
         AND custom_fields->>:key IS NOT NULL
         AND custom_fields->>:key <> ''`,
      {
        replacements: { key: def.field_key },
        type: sequelize.QueryTypes.SELECT,
      },
    );
    return success(res, {
      count: result[0].count,
      field_key: def.field_key,
      entity_type: def.entity_type,
    });
  } catch (e) {
    return error(res, e.message, 500);
  }
};
