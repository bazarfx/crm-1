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

  // Native column snapshot for conditional-field evaluation. Conditions may
  // reference a native column (e.g. lead_status) — resolve them against the
  // existing row merged with any native fields in the incoming body. Strip
  // custom_fields itself so it can't shadow the custom-value map.
  const existingNative = existingRecord
    ? (typeof existingRecord.toJSON === 'function' ? existingRecord.toJSON() : existingRecord)
    : {};
  const { custom_fields: _ecf, ...existingNativeCols } = existingNative || {};
  const { custom_fields: _bcf, ...bodyNativeCols } = (body || {});
  const nativeValues = { ...existingNativeCols, ...bodyNativeCols };

  const { value, errors } = await validateAndCoerce(entity_type, incoming, existing, nativeValues);
  return { custom_fields: value, errors };
}

// Field-type groupings that pick the right operator for a cf_ filter.
const RANGE_TYPES = new Set(['number', 'currency', 'percent', 'date', 'datetime']);
const NUMERIC_TYPES = new Set(['number', 'currency', 'percent']);
const ARRAY_TYPES = new Set(['multiselect', 'tags']);
const TEXT_TYPES = new Set(['text', 'long_text', 'email', 'phone', 'url', 'file_link']);

/**
 * Build an array of Sequelize predicates from `cf_<field_key>` query params.
 * Each predicate becomes one clause in an `Op.and` block on the top-level
 * WHERE — the caller does NOT need to know about the cf_ namespace.
 *
 * The builder is TYPE-AWARE (it loads the field registry for `entityType`) so
 * each filter uses the correct operator instead of blanket string equality:
 *   - number/currency/percent  → `cf_<key>_min` / `cf_<key>_max` numeric range
 *   - date/datetime            → `cf_<key>_min` / `cf_<key>_max` ISO-text range
 *   - dropdown / boolean       → equality, or `IN (...)` for a comma list
 *   - multiselect / tags       → JSON array membership (any of the values)
 *   - text / email / phone / … → case-insensitive "contains"
 * Unknown keys (no matching definition) fall back to legacy string equality,
 * so nothing regresses if the registry can't be loaded.
 *
 * Safety: field_key is whitelisted by KEY_RX before interpolation; values are
 * parameterised via sequelize.where / sequelize.escape. `tableAlias` qualifies
 * the column so the literal works under a JOIN that also has custom_fields.
 */
async function buildCustomFieldClauses(queryParams = {}, tableAlias = null, entityType = null) {
  const clauses = [];
  const prefix = tableAlias ? `"${tableAlias}".` : '';

  // Load the field registry to pick operators by type. If unavailable, defMap
  // stays null and every param falls back to legacy equality.
  let defMap = null;
  if (entityType) {
    try {
      const defs = await getDefinitionsFor(entityType);
      defMap = new Map((defs || []).map((d) => [d.field_key, d]));
    } catch { defMap = null; }
  }

  // Split params into range bounds vs. single-value filters. A `<base>_min` /
  // `<base>_max` param is a range bound ONLY when <base> is a known range-type
  // field; otherwise the whole key is treated as a literal field key.
  const ranges = new Map(); // baseKey -> { type, min?, max? }
  const values = [];        // { fieldKey, raw, def }

  for (const [key, value] of Object.entries(queryParams || {})) {
    if (!key.startsWith('cf_')) continue;
    const field = key.slice(3);
    const m = field.match(/^(.+)_(min|max)$/);
    if (m && defMap) {
      const base = m[1];
      const def = defMap.get(base);
      if (def && RANGE_TYPES.has(def.field_type) && KEY_RX.test(base)) {
        if (!ranges.has(base)) ranges.set(base, { type: def.field_type });
        ranges.get(base)[m[2]] = value;
        continue;
      }
    }
    if (!KEY_RX.test(field)) continue;
    values.push({ fieldKey: field, raw: value, def: defMap ? defMap.get(field) : null });
  }

  // ── Range clauses ──────────────────────────────────────────────────────
  for (const [fieldKey, r] of ranges) {
    const colExpr = `${prefix}custom_fields->>'${fieldKey}'`;
    if (NUMERIC_TYPES.has(r.type)) {
      // Guard the ::numeric cast so a stray non-numeric value can't error the
      // whole query. ISO numbers only.
      const guard = `${colExpr} ~ '^-?[0-9]+(\\.[0-9]+)?$'`;
      if (r.min != null && r.min !== '' && Number.isFinite(Number(r.min))) {
        clauses.push(sequelize.literal(`(${guard} AND (${colExpr})::numeric >= ${Number(r.min)})`));
      }
      if (r.max != null && r.max !== '' && Number.isFinite(Number(r.max))) {
        clauses.push(sequelize.literal(`(${guard} AND (${colExpr})::numeric <= ${Number(r.max)})`));
      }
    } else {
      // date/datetime — stored as full ISO-8601 UTC (…T…:…:….000Z). Text
      // comparison is correct as long as both bounds share a sortable shape,
      // so widen a date-only / minute-precision MAX bound to the end of that
      // period (otherwise `<= '2024-01-15'` wrongly excludes that whole day).
      // The MIN bound already sorts before any same-period timestamp.
      const col = sequelize.literal(colExpr);
      if (r.min != null && r.min !== '') clauses.push(sequelize.where(col, { [Op.gte]: String(r.min) }));
      if (r.max != null && r.max !== '') {
        let max = String(r.max);
        if (/^\d{4}-\d{2}-\d{2}$/.test(max)) max += 'T23:59:59.999Z';           // date-only
        else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(max)) max += ':59.999Z'; // datetime-local
        clauses.push(sequelize.where(col, { [Op.lte]: max }));
      }
    }
  }

  // ── Single-value clauses ───────────────────────────────────────────────
  for (const { fieldKey, raw, def } of values) {
    const colExpr = `${prefix}custom_fields->>'${fieldKey}'`;
    const col = sequelize.literal(colExpr);

    if (raw === null || raw === undefined || raw === '' || raw === 'null') {
      clauses.push(sequelize.literal(`(${colExpr} IS NULL OR ${colExpr} = '')`));
      continue;
    }

    const type = def?.field_type;
    const parts = String(raw).split(',').map((s) => s.trim()).filter(Boolean);

    if (type && ARRAY_TYPES.has(type)) {
      // Stored as a JSON array — match if it contains ANY requested value.
      // jsonb_exists_any() is the function form of `?|` (avoids the `?`
      // placeholder ambiguity in raw literals).
      const arr = parts.map((v) => sequelize.escape(v)).join(', ');
      clauses.push(sequelize.literal(
        `jsonb_exists_any(${prefix}custom_fields->'${fieldKey}', array[${arr}]::text[])`,
      ));
    } else if (type && TEXT_TYPES.has(type)) {
      clauses.push(sequelize.where(col, { [Op.iLike]: `%${raw}%` }));
    } else if (parts.length > 1) {
      clauses.push(sequelize.where(col, { [Op.in]: parts }));
    } else {
      clauses.push(sequelize.where(col, String(raw)));
    }
  }

  return clauses;
}

/**
 * Convenience: caller already has a `where` object; this returns one wrapped
 * in `Op.and` with the cf_ predicates appended. If there are no cf_ params,
 * returns the where unchanged. Pass `tableAlias` when the query JOINs other
 * tables that may also expose a `custom_fields` column, and `entityType` so the
 * builder can resolve field types for the correct operators.
 */
async function applyCustomFieldFilters(where, queryParams, tableAlias = null, entityType = null) {
  const clauses = await buildCustomFieldClauses(queryParams, tableAlias, entityType);
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
