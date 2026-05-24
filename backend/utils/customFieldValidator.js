const { FieldDefinition } = require('../models');

// ─── 30-second TTL cache ─────────────────────────────────────────────────
// Custom-field definitions barely change at runtime; refetching them on every
// lead/user write would be wasteful. The cache is invalidated explicitly from
// the FieldDefinition controller on every mutation.
let cache = null;
let cachedAt = 0;
const CACHE_TTL_MS = 30 * 1000;

async function loadCache() {
  const defs = await FieldDefinition.findAll({
    where: { is_archived: false },
    raw: true,
    order: [['display_order', 'ASC']],
  });
  cache = {};
  for (const d of defs) {
    if (!cache[d.entity_type]) cache[d.entity_type] = {};
    cache[d.entity_type][d.field_key] = d;
  }
  cachedAt = Date.now();
}

async function ensureCache() {
  if (!cache || Date.now() - cachedAt > CACHE_TTL_MS) await loadCache();
}

function invalidateCache() {
  cache = null;
  cachedAt = 0;
}

async function getDefinitionsFor(entity_type) {
  await ensureCache();
  return Object.values(cache[entity_type] || {});
}

// ─── Coercion: incoming value → canonical typed value ────────────────────
function coerceValue(def, value) {
  try {
    switch (def.field_type) {
      case 'text':
      case 'long_text':
      case 'phone':
      case 'email':
      case 'url':
      case 'file_link':
        return { value: String(value) };

      case 'number':
      case 'currency':
      case 'percent': {
        const n = Number(value);
        if (Number.isNaN(n)) return { error: 'must be a number' };
        return { value: n };
      }

      case 'boolean':
        if (typeof value === 'boolean') return { value };
        if (value === 'true') return { value: true };
        if (value === 'false') return { value: false };
        return { error: 'must be true or false' };

      case 'date':
      case 'datetime': {
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return { error: 'invalid date' };
        return { value: d.toISOString() };
      }

      case 'dropdown': {
        const validValues = (def.options || []).map((o) => o.value);
        if (!validValues.includes(value)) {
          return { error: `must be one of: ${validValues.join(', ')}` };
        }
        return { value };
      }

      case 'multiselect':
      case 'tags': {
        if (!Array.isArray(value)) return { error: 'must be an array' };
        if (def.field_type === 'multiselect') {
          const validValues = (def.options || []).map((o) => o.value);
          for (const v of value) {
            if (!validValues.includes(v)) return { error: `"${v}" not in options` };
          }
        }
        return { value: [...new Set(value)] };
      }

      default:
        return { value };
    }
  } catch (e) {
    return { error: e.message };
  }
}

// ─── Validation: enforce min/max/regex from def.validation JSONB ─────────
function runValidation(def, value) {
  const errors = [];
  const v = def.validation || {};
  switch (def.field_type) {
    case 'text':
    case 'long_text':
    case 'phone':
    case 'url':
    case 'file_link':
      if (v.min_length && value.length < v.min_length) errors.push(`min length ${v.min_length}`);
      if (v.max_length && value.length > v.max_length) errors.push(`max length ${v.max_length}`);
      if (v.regex) {
        try {
          if (!new RegExp(v.regex).test(value)) errors.push('does not match required format');
        } catch (_) { /* invalid regex stored — ignore */ }
      }
      break;
    case 'email':
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) errors.push('must be a valid email');
      break;
    case 'number':
    case 'currency':
    case 'percent':
      if (v.min !== undefined && value < v.min) errors.push(`min ${v.min}`);
      if (v.max !== undefined && value > v.max) errors.push(`max ${v.max}`);
      if (def.field_type === 'percent' && (value < 0 || value > 100)) errors.push('must be 0-100');
      break;
    default:
      break;
  }
  return errors;
}

// ─── Main entry: validate + coerce a custom_fields patch ─────────────────
// Returns { value, errors }. The caller decides whether to reject on errors
// or write the partial. `existing` is the row's current custom_fields blob;
// `incoming` is the patch from the request body.
async function validateAndCoerce(entity_type, incoming = {}, existing = {}) {
  await ensureCache();
  const defs = cache[entity_type] || {};
  const errors = [];
  const merged = { ...existing };

  for (const [key, value] of Object.entries(incoming)) {
    const def = defs[key];
    if (!def) {
      errors.push(`Unknown custom field "${key}" on ${entity_type}`);
      continue;
    }

    if (value === null || value === undefined || value === '') {
      if (def.is_required && !(key in existing)) {
        errors.push(`${def.label} is required`);
        continue;
      }
      merged[key] = null;
      continue;
    }

    const coerced = coerceValue(def, value);
    if (coerced.error) {
      errors.push(`${def.label}: ${coerced.error}`);
      continue;
    }

    const valErrors = runValidation(def, coerced.value);
    if (valErrors.length) {
      errors.push(...valErrors.map((e) => `${def.label}: ${e}`));
      continue;
    }

    merged[key] = coerced.value;
  }

  // Backfill defaults for required fields that the row doesn't yet have a
  // value for AND that the caller didn't try to set.
  for (const def of Object.values(defs)) {
    if (def.is_required && !(def.field_key in merged) && !(def.field_key in incoming)) {
      if (def.default_value !== null && def.default_value !== undefined) {
        merged[def.field_key] = def.default_value;
      }
    }
  }

  return { value: merged, errors };
}

// ─── Filter helper: extract cf_<key>=value query params ──────────────────
// Callers can transform this into a JSONB containment WHERE clause or a
// `custom_fields->>'<key>' = '<value>'` predicate, depending on the field
// type. Returned shape: { [field_key]: value, ... }.
function buildJsonbWhere(entity_type, queryParams) {
  const filters = {};
  for (const [key, value] of Object.entries(queryParams || {})) {
    if (!key.startsWith('cf_')) continue;
    const fieldKey = key.slice(3);
    filters[fieldKey] = value;
  }
  return filters;
}

module.exports = {
  invalidateCache,
  getDefinitionsFor,
  validateAndCoerce,
  buildJsonbWhere,
};
