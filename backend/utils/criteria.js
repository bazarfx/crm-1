const { Op } = require('sequelize');

// ─────────────────────────────────────────────────────────────────────────────
// Zoho-style criteria filter → Sequelize `where` fragment.
//
// The Leads list accepts ONE new query param, `criteria`, which is
// JSON.stringify of:
//
//   {
//     "match": "and" | "or",
//     "rules": [
//       { "field": "<key>", "source": "native" | "custom",
//         "type": "<type>", "operator": "<op>",
//         "value": <string|number|string[]>, "value2": <optional> }
//     ]
//   }
//
// This module turns that into a Sequelize `where` fragment that the controller
// ANDs onto its existing scope/flat-param WHERE. It NEVER throws — a malformed
// or empty criteria returns `null` and the caller keeps its existing filters.
//
// Safety model (mirrors utils/customFieldIntegration.js):
//   • NATIVE fields  → validated against the model's own rawAttributes
//                      (Object.keys(models.Lead.rawAttributes)). Unknown fields
//                      are silently dropped — no column name ever reaches SQL
//                      unless it's a real attribute. Column identifiers are
//                      further quoted via the model's quoted table alias.
//   • CUSTOM fields  → routed through custom_fields JSONB. The field_key is
//                      validated against /^[a-z0-9_]+$/ before it can appear in
//                      any literal, and every VALUE is passed through
//                      sequelize.escape(). Numeric/date operators cast the JSONB
//                      text to numeric / timestamptz behind a regex/try guard so
//                      a stray non-castable value can't error the whole query.
// ─────────────────────────────────────────────────────────────────────────────

// Operator allow-list per type family. Exported for the frontend/test to mirror.
const OPERATORS_BY_TYPE = {
  text: ['contains', 'not_contains', 'is', 'is_not', 'starts_with', 'ends_with', 'is_empty', 'is_not_empty'],
  email: ['contains', 'not_contains', 'is', 'is_not', 'starts_with', 'ends_with', 'is_empty', 'is_not_empty'],
  phone: ['contains', 'not_contains', 'is', 'is_not', 'starts_with', 'ends_with', 'is_empty', 'is_not_empty'],
  url: ['contains', 'not_contains', 'is', 'is_not', 'starts_with', 'ends_with', 'is_empty', 'is_not_empty'],
  long_text: ['contains', 'not_contains', 'is', 'is_not', 'starts_with', 'ends_with', 'is_empty', 'is_not_empty'],
  number: ['is', 'is_not', 'gt', 'gte', 'lt', 'lte', 'between', 'is_empty', 'is_not_empty'],
  currency: ['is', 'is_not', 'gt', 'gte', 'lt', 'lte', 'between', 'is_empty', 'is_not_empty'],
  percent: ['is', 'is_not', 'gt', 'gte', 'lt', 'lte', 'between', 'is_empty', 'is_not_empty'],
  date: ['is', 'before', 'after', 'between', 'is_empty', 'is_not_empty'],
  datetime: ['is', 'before', 'after', 'between', 'is_empty', 'is_not_empty'],
  dropdown: ['is_any_of', 'is_none_of', 'is_empty', 'is_not_empty'],
  multiselect: ['is_any_of', 'is_none_of', 'is_empty', 'is_not_empty'],
  tags: ['is_any_of', 'is_none_of', 'is_empty', 'is_not_empty'],
  boolean: ['is'],
};

// Type families used to pick the right SQL treatment.
const TEXT_TYPES = new Set(['text', 'email', 'phone', 'url', 'long_text']);
const NUMERIC_TYPES = new Set(['number', 'currency', 'percent']);
const DATE_TYPES = new Set(['date', 'datetime']);
const ARRAY_TYPES = new Set(['dropdown', 'multiselect', 'tags']); // value is string[]

// Custom-field key guard — exactly the contract's /^[a-z0-9_]+$/. Any key that
// doesn't match is dropped before it can be interpolated into a literal.
const CUSTOM_KEY_RX = /^[a-z0-9_]+$/;

// Entity → model name. Only 'lead' is wired today; extend here for more entities.
const ENTITY_MODEL = { lead: 'Lead' };

function parseCriteria(criteriaRaw) {
  if (!criteriaRaw) return null;
  let obj = criteriaRaw;
  if (typeof criteriaRaw === 'string') {
    const trimmed = criteriaRaw.trim();
    if (!trimmed) return null;
    try {
      obj = JSON.parse(trimmed);
    } catch {
      return null;
    }
  }
  if (!obj || typeof obj !== 'object') return null;
  if (!Array.isArray(obj.rules) || obj.rules.length === 0) return null;
  return obj;
}

// ── NATIVE column predicate ─────────────────────────────────────────────────
// Returns a Sequelize condition object keyed by the column name, e.g.
// { first_name: { [Op.iLike]: '%foo%' } }. Returns null when the operator or
// value is unusable for the type (rule is then silently dropped).
function buildNativePredicate(rule) {
  const { field, type, operator } = rule;
  const value = rule.value;
  const value2 = rule.value2;

  // Empty / not-empty apply to every type and ignore `value`. Only TEXT columns
  // can be compared to '' — doing so on a timestamp/numeric column errors in
  // Postgres ("invalid input syntax for type timestamp: ''"), so those check
  // NULL only.
  if (operator === 'is_empty') {
    return TEXT_TYPES.has(type)
      ? { [field]: { [Op.or]: [{ [Op.is]: null }, { [Op.eq]: '' }] } }
      : { [field]: { [Op.is]: null } };
  }
  if (operator === 'is_not_empty') {
    return TEXT_TYPES.has(type)
      ? { [field]: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: '' }] } }
      : { [field]: { [Op.ne]: null } };
  }

  if (TEXT_TYPES.has(type)) {
    switch (operator) {
      case 'contains': return { [field]: { [Op.iLike]: `%${value}%` } };
      case 'not_contains': return { [field]: { [Op.notILike]: `%${value}%` } };
      case 'is': return { [field]: { [Op.iLike]: String(value) } };
      case 'is_not': return { [field]: { [Op.notILike]: String(value) } };
      case 'starts_with': return { [field]: { [Op.iLike]: `${value}%` } };
      case 'ends_with': return { [field]: { [Op.iLike]: `%${value}` } };
      default: return null;
    }
  }

  if (NUMERIC_TYPES.has(type)) {
    const n = Number(value);
    switch (operator) {
      case 'is': return Number.isFinite(n) ? { [field]: { [Op.eq]: n } } : null;
      case 'is_not': return Number.isFinite(n) ? { [field]: { [Op.ne]: n } } : null;
      case 'gt': return Number.isFinite(n) ? { [field]: { [Op.gt]: n } } : null;
      case 'gte': return Number.isFinite(n) ? { [field]: { [Op.gte]: n } } : null;
      case 'lt': return Number.isFinite(n) ? { [field]: { [Op.lt]: n } } : null;
      case 'lte': return Number.isFinite(n) ? { [field]: { [Op.lte]: n } } : null;
      case 'between': {
        const a = Number(value);
        const b = Number(value2);
        if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
        return { [field]: { [Op.between]: [a, b] } };
      }
      default: return null;
    }
  }

  if (DATE_TYPES.has(type)) {
    const d = (v) => {
      const dt = new Date(v);
      return Number.isNaN(dt.getTime()) ? null : dt;
    };
    switch (operator) {
      case 'is': {
        const dt = d(value);
        return dt ? { [field]: { [Op.eq]: dt } } : null;
      }
      case 'before': {
        const dt = d(value);
        return dt ? { [field]: { [Op.lt]: dt } } : null;
      }
      case 'after': {
        const dt = d(value);
        return dt ? { [field]: { [Op.gt]: dt } } : null;
      }
      case 'between': {
        const a = d(value);
        const b = d(value2);
        if (!a || !b) return null;
        return { [field]: { [Op.between]: [a, b] } };
      }
      default: return null;
    }
  }

  if (ARRAY_TYPES.has(type)) {
    // value is string[] — for a native scalar column this is set membership.
    const arr = Array.isArray(value) ? value : (value != null && value !== '' ? [value] : []);
    if (arr.length === 0) return null;
    switch (operator) {
      case 'is_any_of': return { [field]: { [Op.in]: arr } };
      case 'is_none_of': return { [field]: { [Op.notIn]: arr } };
      default: return null;
    }
  }

  if (type === 'boolean') {
    if (operator !== 'is') return null;
    const truthy = value === true || value === 'true' || value === 1 || value === '1';
    return { [field]: { [Op.is]: truthy } };
  }

  return null;
}

// ── CUSTOM (JSONB) predicate ────────────────────────────────────────────────
// Builds a raw predicate against custom_fields->>'<key>'. `key` is already
// CUSTOM_KEY_RX-validated by the caller, so it is safe to interpolate. Every
// VALUE goes through sequelize.escape(). Returns a sequelize.literal / .where
// fragment, or null when unusable.
function buildCustomPredicate(sequelize, rule) {
  const key = rule.field;
  const { type, operator } = rule;
  const value = rule.value;
  const value2 = rule.value2;

  // Text extraction (->>) and jsonb extraction (->) forms. Key is validated.
  const txt = `"Lead"."custom_fields"->>'${key}'`;   // -> text
  const json = `"Lead"."custom_fields"->'${key}'`;    // -> jsonb
  const lit = (sql) => sequelize.literal(sql);

  if (operator === 'is_empty') {
    return lit(`(${txt} IS NULL OR ${txt} = '')`);
  }
  if (operator === 'is_not_empty') {
    return lit(`(${txt} IS NOT NULL AND ${txt} <> '')`);
  }

  if (TEXT_TYPES.has(type)) {
    const v = String(value);
    switch (operator) {
      case 'contains': return lit(`${txt} ILIKE ${sequelize.escape(`%${v}%`)}`);
      case 'not_contains': return lit(`(${txt} IS NULL OR ${txt} NOT ILIKE ${sequelize.escape(`%${v}%`)})`);
      case 'is': return lit(`${txt} ILIKE ${sequelize.escape(v)}`);
      case 'is_not': return lit(`(${txt} IS NULL OR ${txt} NOT ILIKE ${sequelize.escape(v)})`);
      case 'starts_with': return lit(`${txt} ILIKE ${sequelize.escape(`${v}%`)}`);
      case 'ends_with': return lit(`${txt} ILIKE ${sequelize.escape(`%${v}`)}`);
      default: return null;
    }
  }

  if (NUMERIC_TYPES.has(type)) {
    // Guard the ::numeric cast so a stray non-numeric JSONB value can't error
    // the whole query (same pattern as customFieldIntegration.js).
    const guard = `${txt} ~ '^-?[0-9]+(\\.[0-9]+)?$'`;
    const num = `(${txt})::numeric`;
    const n = Number(value);
    const cmp = (opSql, x) => (Number.isFinite(x)
      ? lit(`(${guard} AND ${num} ${opSql} ${sequelize.escape(x)})`)
      : null);
    switch (operator) {
      case 'is': return cmp('=', n);
      case 'is_not': return Number.isFinite(n)
        ? lit(`(${txt} IS NULL OR NOT (${guard}) OR ${num} <> ${sequelize.escape(n)})`)
        : null;
      case 'gt': return cmp('>', n);
      case 'gte': return cmp('>=', n);
      case 'lt': return cmp('<', n);
      case 'lte': return cmp('<=', n);
      case 'between': {
        const a = Number(value);
        const b = Number(value2);
        if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
        return lit(`(${guard} AND ${num} BETWEEN ${sequelize.escape(a)} AND ${sequelize.escape(b)})`);
      }
      default: return null;
    }
  }

  if (DATE_TYPES.has(type)) {
    // Cast the JSONB text to timestamptz behind a validity guard. Postgres has
    // no IS-VALID-TIMESTAMP predicate, so we validate + normalise in JS and
    // compare the cast column against an escaped ISO literal.
    const ts = `(${txt})::timestamptz`;
    // Only attempt the cast when the value looks ISO-ish, to avoid a cast error
    // on free-text custom values. Broad but safe: leading date shape.
    const guard = `${txt} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'`;
    const iso = (v) => {
      const dt = new Date(v);
      return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
    };
    switch (operator) {
      case 'is': {
        const s = iso(value);
        return s ? lit(`(${guard} AND ${ts} = ${sequelize.escape(s)}::timestamptz)`) : null;
      }
      case 'before': {
        const s = iso(value);
        return s ? lit(`(${guard} AND ${ts} < ${sequelize.escape(s)}::timestamptz)`) : null;
      }
      case 'after': {
        const s = iso(value);
        return s ? lit(`(${guard} AND ${ts} > ${sequelize.escape(s)}::timestamptz)`) : null;
      }
      case 'between': {
        const a = iso(value);
        const b = iso(value2);
        if (!a || !b) return null;
        return lit(`(${guard} AND ${ts} BETWEEN ${sequelize.escape(a)}::timestamptz AND ${sequelize.escape(b)}::timestamptz)`);
      }
      default: return null;
    }
  }

  if (ARRAY_TYPES.has(type)) {
    const arr = Array.isArray(value) ? value : (value != null && value !== '' ? [value] : []);
    const clean = arr.map((v) => String(v)).filter((v) => v !== '');
    if (clean.length === 0) return null;
    const escaped = clean.map((v) => sequelize.escape(v)).join(', ');
    if (type === 'dropdown') {
      // Scalar stored value → text membership.
      switch (operator) {
        case 'is_any_of': return lit(`${txt} IN (${escaped})`);
        case 'is_none_of': return lit(`(${txt} IS NULL OR ${txt} NOT IN (${escaped}))`);
        default: return null;
      }
    }
    // multiselect / tags → stored as a JSON array; match array membership via
    // jsonb_exists_any (function form of `?|`, avoids the `?` bind ambiguity).
    switch (operator) {
      case 'is_any_of':
        return lit(`jsonb_exists_any(${json}, array[${escaped}]::text[])`);
      case 'is_none_of':
        return lit(`(${json} IS NULL OR NOT jsonb_exists_any(${json}, array[${escaped}]::text[]))`);
      default: return null;
    }
  }

  if (type === 'boolean') {
    if (operator !== 'is') return null;
    const truthy = value === true || value === 'true' || value === 1 || value === '1';
    // Stored as JSON boolean or its text form — compare on text.
    return lit(`${txt} = ${sequelize.escape(truthy ? 'true' : 'false')}`);
  }

  return null;
}

/**
 * Build a Sequelize `where` fragment from a Zoho-style criteria payload.
 *
 * @param {object} models       The models registry ({ sequelize, Lead, ... }).
 * @param {string} entityType   'lead' (only entity wired today).
 * @param {string|object} criteriaRaw  JSON string or parsed criteria object.
 * @returns {object|null}       A Sequelize where fragment, or null when the
 *                              criteria is empty/invalid/produced no usable rule.
 *                              NEVER throws.
 */
function buildCriteriaWhere(models, entityType, criteriaRaw) {
  try {
    if (!models) return null;
    const sequelize = models.sequelize;
    const modelName = ENTITY_MODEL[String(entityType || '').toLowerCase()];
    const model = modelName ? models[modelName] : null;
    if (!sequelize || !model) return null;

    const criteria = parseCriteria(criteriaRaw);
    if (!criteria) return null;

    const match = String(criteria.match || 'and').toLowerCase() === 'or' ? Op.or : Op.and;

    // Injection guard for NATIVE fields: only real model columns are allowed.
    // Accept BOTH the Sequelize attribute name and its underlying DB column
    // name (they differ for mapped/timestamp columns, e.g. attribute
    // `createdAt` ↔ column `created_at`) and normalise to the attribute name,
    // since Sequelize `where` clauses key off attributes, not columns.
    const attrs = model.rawAttributes || {};
    const fieldToAttr = new Map();
    for (const [attr, def] of Object.entries(attrs)) {
      fieldToAttr.set(attr, attr);
      if (def && def.field) fieldToAttr.set(def.field, attr);
    }

    const conditions = [];
    for (const rule of criteria.rules) {
      if (!rule || typeof rule !== 'object') continue;
      const source = rule.source === 'custom' ? 'custom' : 'native';
      const type = rule.type;
      const operator = rule.operator;

      // Operator must be allowed for the declared type family.
      const allowedOps = OPERATORS_BY_TYPE[type];
      if (!allowedOps || !allowedOps.includes(operator)) continue;

      let predicate = null;
      if (source === 'custom') {
        // field_key strictly validated before it can touch a literal.
        if (typeof rule.field !== 'string' || !CUSTOM_KEY_RX.test(rule.field)) continue;
        predicate = buildCustomPredicate(sequelize, rule);
      } else {
        // native field must be a real column — silently drop unknown fields.
        const attrName = typeof rule.field === 'string' ? fieldToAttr.get(rule.field) : null;
        if (!attrName) continue;
        predicate = buildNativePredicate({ ...rule, field: attrName });
      }
      if (predicate) conditions.push(predicate);
    }

    if (conditions.length === 0) return null;
    // Single condition still wrapped so the caller can AND uniformly.
    return { [match]: conditions };
  } catch {
    // Contract: never throw — degrade to "no criteria filter".
    return null;
  }
}

module.exports = {
  buildCriteriaWhere,
  OPERATORS_BY_TYPE,
};
