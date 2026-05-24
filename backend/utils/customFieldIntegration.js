const { Op } = require('sequelize');
const { sequelize } = require('../models');
const {
  validateAndCoerce,
  getDefinitionsFor,
} = require('./customFieldValidator');

// snake_case keys only — matches the FieldDefinition model's regex. Any cf_
// query param that doesn't look like a legal key is silently ignored so
// callers can't inject arbitrary SQL through the literal templates below.
const KEY_RX = /^[a-z][a-z0-9_]{1,49}$/;

/**
 * Validate + coerce a body.custom_fields blob against the registry for this
 * entity. If `existingRecord` is provided, the result is the existing blob
 * merged with the validated patch (so partial PATCHes work cleanly).
 *
 * Returns { custom_fields, errors, bypassed? }. Caller decides whether to
 * reject on errors; on success it should assign `custom_fields` onto the model.
 *
 * `options.skip_validation: true` — emergency override. Skips all type
 * coercion, dropdown allowed-value checks, regex/min/max validation, AND
 * the unknown-field guard. Returns `bypassed: true` so the caller can
 * write a high-visibility audit log entry. Controllers must only allow
 * this flag for super_admin / schema_editor.
 */
async function processIncomingCustomFields(entity_type, body, existingRecord = null, options = {}) {
  const incoming = (body && body.custom_fields) || {};
  const existing = existingRecord?.custom_fields || {};

  // No incoming patch and no existing row → nothing to do. Return empty blob
  // so a fresh row has the right shape rather than `undefined`.
  if (Object.keys(incoming).length === 0 && !existingRecord) {
    return { custom_fields: {}, errors: [] };
  }

  if (options.skip_validation) {
    return {
      custom_fields: { ...existing, ...incoming },
      errors: [],
      bypassed: true,
    };
  }

  const { value, errors } = await validateAndCoerce(entity_type, incoming, existing);
  return { custom_fields: value, errors };
}

/**
 * Build an array of Sequelize predicates from any `cf_<field_key>=value`
 * query params. Each predicate becomes one clause in an `Op.and` block on the
 * top-level WHERE — the caller does NOT need to know about the cf_ namespace.
 *
 * Safety: field_key is whitelisted by KEY_RX before being interpolated; the
 * value is parameterised through sequelize.where (sequelize escapes the bind).
 *
 * `tableAlias` qualifies the column reference so the literal works when the
 * query JOINs another table that also has a `custom_fields` column (e.g.
 * leads → users include). Defaults to the leads-style alias since the most
 * common caller is the lead/deal list with INCLUDE_ASSIGNEE on it.
 */
function buildCustomFieldClauses(queryParams = {}, tableAlias = null) {
  const clauses = [];
  const prefix = tableAlias ? `"${tableAlias}".` : '';
  for (const [key, value] of Object.entries(queryParams || {})) {
    if (!key.startsWith('cf_')) continue;
    const fieldKey = key.slice(3);
    if (!KEY_RX.test(fieldKey)) continue;

    // JSONB ->> always returns text, even for booleans/numbers. Compare as
    // string; the validator stored everything as JSON, and the frontend
    // sends the same shape, so equality works for all primitive types.
    const colExpr = `${prefix}custom_fields->>'${fieldKey}'`;
    const col = sequelize.literal(colExpr);

    if (value === null || value === undefined || value === '' || value === 'null') {
      clauses.push(sequelize.literal(
        `(${colExpr} IS NULL OR ${colExpr} = '')`,
      ));
    } else {
      clauses.push(sequelize.where(col, String(value)));
    }
  }
  return clauses;
}

/**
 * Convenience: caller already has a `where` object; this returns one wrapped
 * in `Op.and` with the cf_ predicates appended. If there are no cf_ params,
 * returns the where unchanged. Pass `tableAlias` when the query JOINs other
 * tables that may also expose a `custom_fields` column.
 */
function applyCustomFieldFilters(where, queryParams, tableAlias = null) {
  const clauses = buildCustomFieldClauses(queryParams, tableAlias);
  if (clauses.length === 0) return where;
  return { [Op.and]: [where, ...clauses] };
}

/**
 * Decorate a record with `custom_fields_with_meta` — one row per visible
 * field definition, each carrying both the value and the schema. Used by
 * detail-page endpoints so the UI can render fields without a second fetch.
 *
 * Drops archived definitions (the validator already does, but be defensive).
 */
async function attachDefinitionsToResponse(entity_type, record) {
  if (!record) return record;
  const defs = await getDefinitionsFor(entity_type);
  const cfWithMeta = {};
  for (const def of defs) {
    cfWithMeta[def.field_key] = {
      value: record.custom_fields?.[def.field_key] ?? null,
      definition: {
        label: def.label,
        field_type: def.field_type,
        options: def.options,
        section: def.section,
        helper_text: def.helper_text,
        is_required: def.is_required,
        visible_to_roles: def.visible_to_roles,
        editable_by_roles: def.editable_by_roles,
      },
    };
  }
  const base = record.toJSON ? record.toJSON() : record;
  return { ...base, custom_fields_with_meta: cfWithMeta };
}

// Centralised privilege check. The `?skip_validation=true` query flag is
// only honoured for super_admin and schema_editor; everyone else silently
// gets the normal validated path (no error, no bypass).
const PRIVILEGED_BYPASS_ROLES = new Set(['super_admin', 'schema_editor']);

function isSkipValidationAllowed(req) {
  if (!req || !req.user || !req.query) return false;
  if (req.query.skip_validation !== 'true') return false;
  return PRIVILEGED_BYPASS_ROLES.has(req.user.role);
}

// Convenience: write a high-visibility audit row whenever the bypass path
// runs. Controllers should call this any time `bypassed: true` came back
// from processIncomingCustomFields. Swallows errors so a failed audit
// write never breaks the save itself.
async function recordBypassAudit({
  AuditLog, req, resource, resourceId, incoming,
}) {
  try {
    await AuditLog.create({
      user_id: req.user.id,
      action: 'BYPASS_CUSTOM_FIELD_VALIDATION',
      resource,
      resource_id: resourceId,
      new_data: { custom_fields: incoming },
      ip_address: req.ip,
    });
  } catch (_) { /* audit write must not break the request */ }
}

module.exports = {
  processIncomingCustomFields,
  buildCustomFieldClauses,
  applyCustomFieldFilters,
  attachDefinitionsToResponse,
  isSkipValidationAllowed,
  recordBypassAudit,
};
