/**
 * Conditional-field evaluator (Zoho "basic conditions") — frontend mirror of
 * backend/utils/conditions.js.
 *
 * A field definition may carry a `visibility_condition`:
 *   { field: '<field_key|native_col>', operator: '<op>', value: <any> } | null
 * meaning "show/require this field ONLY when values[field] <op> value".
 * null / empty condition → always visible.
 *
 * `evaluateCondition(condition, values)` is a PURE evaluator that mirrors the
 * operator semantics of the filter engine (lib/filterOperators.js) and the
 * backend. It NEVER throws — on any malformed input it defaults to TRUE so a
 * broken condition can never hide or block a field. `values` is a flat merged
 * map of native + custom field values.
 */

function isEmpty(v) {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

function toTime(v) {
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number') return v;
  const t = Date.parse(v);
  return Number.isNaN(t) ? NaN : t;
}

function toNum(v) {
  if (typeof v === 'number') return v;
  if (v === null || v === undefined || v === '') return NaN;
  return Number(v);
}

function toArray(v) {
  if (Array.isArray(v)) return v;
  if (v === null || v === undefined || v === '') return [];
  return [v];
}

const lc = (v) => String(v).toLowerCase();

const NUMERIC_OPS = new Set(['gt', 'gte', 'lt', 'lte']);
const DATE_OPS = new Set(['before', 'after']);
const CHOICE_OPS = new Set(['is_any_of', 'is_none_of']);

function compare(raw, operator, condValue, condValue2) {
  if (operator === 'is_empty') return isEmpty(raw);
  if (operator === 'is_not_empty') return !isEmpty(raw);

  if (CHOICE_OPS.has(operator)) {
    const wanted = toArray(condValue).map(lc);
    if (wanted.length === 0) return operator === 'is_none_of';
    const have = (Array.isArray(raw)
      ? raw
      : (raw === null || raw === undefined ? [] : [raw])).map(lc);
    const overlaps = have.some((h) => wanted.includes(h));
    return operator === 'is_any_of' ? overlaps : !overlaps;
  }

  if (NUMERIC_OPS.has(operator)) {
    const n = toNum(raw);
    const v = toNum(condValue);
    if (Number.isNaN(n) || !Number.isFinite(v)) return false;
    switch (operator) {
      case 'gt': return n > v;
      case 'gte': return n >= v;
      case 'lt': return n < v;
      case 'lte': return n <= v;
      default: return false;
    }
  }

  if (DATE_OPS.has(operator)) {
    const t = toTime(raw);
    const v = toTime(condValue);
    if (Number.isNaN(t) || Number.isNaN(v)) return false;
    return operator === 'before' ? t < v : t > v;
  }

  if (operator === 'between') {
    const a = toNum(condValue);
    const b = toNum(condValue2);
    if (Number.isFinite(a) && Number.isFinite(b)) {
      const n = toNum(raw);
      if (Number.isNaN(n)) return false;
      return n >= a && n <= b;
    }
    const ta = toTime(condValue);
    const tb = toTime(condValue2);
    const tr = toTime(raw);
    if (Number.isNaN(ta) || Number.isNaN(tb) || Number.isNaN(tr)) return false;
    return tr >= ta && tr <= tb;
  }

  if (operator === 'is' || operator === 'is_not') {
    const boolish = (x) => x === true || x === false
      || x === 'true' || x === 'false' || x === 1 || x === 0 || x === '1' || x === '0';
    if (boolish(condValue) && boolish(raw)) {
      const truthy = (x) => x === true || x === 'true' || x === 1 || x === '1';
      const eq = truthy(raw) === truthy(condValue);
      return operator === 'is' ? eq : !eq;
    }
    // fall through to text equality
  }

  if (raw === null || raw === undefined) {
    return operator === 'is_not' || operator === 'not_contains';
  }
  const hay = lc(raw);
  const needle = lc(condValue);
  switch (operator) {
    case 'is': return hay === needle;
    case 'is_not': return hay !== needle;
    case 'contains': return hay.includes(needle);
    case 'not_contains': return !hay.includes(needle);
    case 'starts_with': return hay.startsWith(needle);
    case 'ends_with': return hay.endsWith(needle);
    // Unknown operator = a broken condition. Contract: never hide/block a
    // field, so default to visible (true) rather than false.
    default: return true;
  }
}

/**
 * Evaluate a single visibility condition against a flat merged value map.
 * Returns true when the condition is null/empty OR satisfied. NEVER throws —
 * defaults to true on any error so a broken condition never hides/blocks.
 */
export function evaluateCondition(condition, values) {
  try {
    if (!condition || typeof condition !== 'object') return true;
    const { field, operator } = condition;
    if (!field || typeof field !== 'string' || !operator) return true;
    const raw = values && typeof values === 'object' ? values[field] : undefined;
    return compare(raw, operator, condition.value, condition.value2);
  } catch {
    return true;
  }
}

/**
 * Is a field definition currently visible given a flat merged value map?
 * A definition with no `visibility_condition` is always visible. NEVER throws.
 */
export function isFieldVisible(def, values) {
  try {
    if (!def) return true;
    return evaluateCondition(def.visibility_condition, values);
  } catch {
    return true;
  }
}
