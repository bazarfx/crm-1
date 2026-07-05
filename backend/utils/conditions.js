// ─────────────────────────────────────────────────────────────────────────────
// Conditional-field evaluator (Zoho "basic conditions").
//
// A FieldDefinition may carry a `visibility_condition`:
//   { field: '<field_key|native_col>', operator: '<op>', value: <any> } | null
// meaning "show/require this field ONLY when values[field] <op> value".
// null / empty condition → always visible.
//
// `evaluateCondition(condition, values)` is a PURE in-memory evaluator that
// MIRRORS the operator semantics of utils/assignmentEngine.recordMatchesCriteria
// (a single rule). It NEVER throws — on any malformed input it defaults to TRUE
// so a broken condition can never hide or block a field.
//
// Unlike the assignment engine, a visibility_condition carries no `type` tag
// (and `values` is a flat merged map of native + custom values), so we dispatch
// purely on the OPERATOR. The operator sets are identical to the filter engine:
//   text:    is, is_not, contains, not_contains, starts_with, ends_with
//   number:  gt, gte, lt, lte, between
//   date:    before, after, between   (+ is/is_not shared)
//   choice:  is_any_of, is_none_of
//   boolean: is
//   unary:   is_empty, is_not_empty
// ─────────────────────────────────────────────────────────────────────────────

// Empty test shared by is_empty / is_not_empty across every type. Mirrors
// assignmentEngine.isEmpty.
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

// Operators grouped by the value shape they compare. Dispatch is on operator,
// not on a field type tag (a visibility_condition carries none).
const NUMERIC_OPS = new Set(['gt', 'gte', 'lt', 'lte']);
const DATE_OPS = new Set(['before', 'after']);
const CHOICE_OPS = new Set(['is_any_of', 'is_none_of']);

// Compare a resolved record value `raw` against a single condition.
// Returns true/false. Any oddity inside falls through to a default handled by
// the caller (evaluateCondition wraps this in try/catch → true).
function compare(raw, operator, condValue, condValue2) {
  // Unary predicates ignore the condition value entirely.
  if (operator === 'is_empty') return isEmpty(raw);
  if (operator === 'is_not_empty') return !isEmpty(raw);

  // Choice membership (dropdown / multiselect / tags). condValue is a
  // scalar OR string[]; raw may be a scalar or array — treat both as sets.
  if (CHOICE_OPS.has(operator)) {
    const wanted = toArray(condValue).map(lc);
    if (wanted.length === 0) return operator === 'is_none_of';
    const have = (Array.isArray(raw)
      ? raw
      : (raw === null || raw === undefined ? [] : [raw])).map(lc);
    const overlaps = have.some((h) => wanted.includes(h));
    return operator === 'is_any_of' ? overlaps : !overlaps;
  }

  // Numeric comparisons.
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

  // Date comparisons.
  if (DATE_OPS.has(operator)) {
    const t = toTime(raw);
    const v = toTime(condValue);
    if (Number.isNaN(t) || Number.isNaN(v)) return false;
    return operator === 'before' ? t < v : t > v;
  }

  // between — numeric OR date range depending on parseability. Prefer numeric
  // when both bounds parse as numbers; otherwise fall back to time.
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

  // boolean `is` — normalise both sides to a strict boolean before comparing.
  // Distinguished from text `is` by the condition value being a boolean-ish
  // literal; when raw/cond are plainly boolean this is the natural match.
  if (operator === 'is' || operator === 'is_not') {
    const boolish = (x) => x === true || x === false
      || x === 'true' || x === 'false' || x === 1 || x === 0 || x === '1' || x === '0';
    if (boolish(condValue) && boolish(raw)) {
      const truthy = (x) => x === true || x === 'true' || x === 1 || x === '1';
      const eq = truthy(raw) === truthy(condValue);
      return operator === 'is' ? eq : !eq;
    }
    // Fall through to text equality (case-insensitive, mirrors ILIKE).
  }

  // Text operators (case-insensitive, like ILIKE). An absent value can only
  // satisfy the negative operators — mirrors assignmentEngine text handling.
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
 *
 * @param {object|null} condition { field, operator, value, value2? } | null.
 * @param {object} values         Flat map of native + custom field values.
 * @returns {boolean}  true when the condition is null/empty OR satisfied.
 *                     NEVER throws — defaults to true on any error so a broken
 *                     condition never hides or blocks a field.
 */
function evaluateCondition(condition, values) {
  try {
    // No condition / malformed condition → always visible.
    if (!condition || typeof condition !== 'object') return true;
    const { field, operator } = condition;
    if (!field || typeof field !== 'string' || !operator) return true;

    const raw = values && typeof values === 'object' ? values[field] : undefined;
    // condition.value may be under `value`; range uses `value2`.
    return compare(raw, operator, condition.value, condition.value2);
  } catch {
    // Contract: a broken condition must never hide / block a field.
    return true;
  }
}

/**
 * Is a field definition currently visible given a flat merged value map?
 * A definition with no `visibility_condition` is always visible.
 *
 * @param {object} def     A FieldDefinition (plain row or instance).
 * @param {object} values  Flat map of native + custom field values.
 * @returns {boolean}  NEVER throws — defaults to visible on any error.
 */
function isFieldVisible(def, values) {
  try {
    if (!def) return true;
    return evaluateCondition(def.visibility_condition, values);
  } catch {
    return true;
  }
}

module.exports = {
  evaluateCondition,
  isFieldVisible,
};
