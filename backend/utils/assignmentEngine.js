// ─────────────────────────────────────────────────────────────────────────────
// Assignment Rules engine (Zoho parity).
//
// Three exports:
//   • recordMatchesCriteria(record, criteria) — PURE in-memory evaluator of a
//     Zoho-style { match, rules } payload against a plain lead object. Mirrors
//     the operator semantics of utils/criteria.js (which builds the SAME
//     operators into a Sequelize WHERE). NEVER throws.
//   • resolveAssignee(models, rule)           — turn a rule's targets into a
//     concrete active user UUID (direct or round-robin, persisting rr_index).
//   • evaluateAssignmentRules(models, lead)    — walk active rules by position,
//     return the first { rule, assigneeId } that matches. NEVER throws.
//
// The engine is deliberately independent of criteria.js's SQL builder: that
// module runs against Postgres, this one runs against an in-memory object so
// it can evaluate a lead the instant it is created (before any re-query) and
// can power the "N records match" preview cheaply.
// ─────────────────────────────────────────────────────────────────────────────

// Type families — kept in lock-step with utils/criteria.js.
const TEXT_TYPES = new Set(['text', 'email', 'phone', 'url', 'long_text']);
const NUMERIC_TYPES = new Set(['number', 'currency', 'percent']);
const DATE_TYPES = new Set(['date', 'datetime']);
const ARRAY_TYPES = new Set(['dropdown', 'multiselect', 'tags']); // rule.value is string[]

// ── value resolution ─────────────────────────────────────────────────────────
// native  → record[field]
// custom  → record.custom_fields?.[field]
function resolveRecordValue(record, rule) {
  if (!record || typeof record !== 'object') return undefined;
  const source = rule.source === 'custom' ? 'custom' : 'native';
  if (source === 'custom') {
    const cf = record.custom_fields;
    return cf && typeof cf === 'object' ? cf[rule.field] : undefined;
  }
  return record[rule.field];
}

// Empty test shared by is_empty / is_not_empty across every type.
function isEmpty(v) {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

// A stray Date.parse on a non-date yields NaN — callers guard on Number.isNaN.
function toTime(v) {
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number') return v; // already an epoch
  const t = Date.parse(v);
  return Number.isNaN(t) ? NaN : t;
}

function toNum(v) {
  if (typeof v === 'number') return v;
  if (v === null || v === undefined || v === '') return NaN;
  return Number(v);
}

// Normalise a rule's `value` into an array (choice operators expect string[]).
function toArray(v) {
  if (Array.isArray(v)) return v;
  if (v === null || v === undefined || v === '') return [];
  return [v];
}

const lc = (v) => String(v).toLowerCase();

// ── single-rule evaluation ───────────────────────────────────────────────────
// Returns true/false for ONE rule against the record. Same operator meanings
// as criteria.js (text ops are case-insensitive like ILIKE, numeric/date
// comparisons cast, choice ops do set membership). Any oddity → false.
function evaluateRule(record, rule) {
  if (!rule || typeof rule !== 'object') return false;
  const { type, operator } = rule;
  const raw = resolveRecordValue(record, rule);

  // Empty / not-empty apply to every type and ignore rule.value.
  if (operator === 'is_empty') return isEmpty(raw);
  if (operator === 'is_not_empty') return !isEmpty(raw);

  if (TEXT_TYPES.has(type)) {
    // An absent value can only satisfy negative operators.
    if (raw === null || raw === undefined) {
      return operator === 'is_not' || operator === 'not_contains';
    }
    const hay = lc(raw);
    const needle = lc(rule.value);
    switch (operator) {
      case 'contains': return hay.includes(needle);
      case 'not_contains': return !hay.includes(needle);
      case 'is': return hay === needle;
      case 'is_not': return hay !== needle;
      case 'starts_with': return hay.startsWith(needle);
      case 'ends_with': return hay.endsWith(needle);
      default: return false;
    }
  }

  if (NUMERIC_TYPES.has(type)) {
    const n = toNum(raw);
    const v = toNum(rule.value);
    if (Number.isNaN(n)) return operator === 'is_not'; // missing ≠ any number
    switch (operator) {
      case 'is': return Number.isFinite(v) && n === v;
      case 'is_not': return !Number.isFinite(v) || n !== v;
      case 'gt': return Number.isFinite(v) && n > v;
      case 'gte': return Number.isFinite(v) && n >= v;
      case 'lt': return Number.isFinite(v) && n < v;
      case 'lte': return Number.isFinite(v) && n <= v;
      case 'between': {
        const a = toNum(rule.value);
        const b = toNum(rule.value2);
        if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
        return n >= a && n <= b;
      }
      default: return false;
    }
  }

  if (DATE_TYPES.has(type)) {
    const t = toTime(raw);
    if (Number.isNaN(t)) return false;
    switch (operator) {
      case 'is': {
        const v = toTime(rule.value);
        return !Number.isNaN(v) && t === v;
      }
      case 'before': {
        const v = toTime(rule.value);
        return !Number.isNaN(v) && t < v;
      }
      case 'after': {
        const v = toTime(rule.value);
        return !Number.isNaN(v) && t > v;
      }
      case 'between': {
        const a = toTime(rule.value);
        const b = toTime(rule.value2);
        if (Number.isNaN(a) || Number.isNaN(b)) return false;
        return t >= a && t <= b;
      }
      default: return false;
    }
  }

  if (ARRAY_TYPES.has(type)) {
    // rule.value is string[]. The stored value may be a scalar (dropdown) or
    // an array (multiselect/tags) — treat both as a set and test membership.
    const wanted = toArray(rule.value).map(lc);
    if (wanted.length === 0) return false;
    const have = (Array.isArray(raw) ? raw : (raw === null || raw === undefined ? [] : [raw])).map(lc);
    const overlaps = have.some((h) => wanted.includes(h));
    switch (operator) {
      case 'is_any_of': return overlaps;
      case 'is_none_of': return !overlaps;
      default: return false;
    }
  }

  if (type === 'boolean') {
    if (operator !== 'is') return false;
    const want = rule.value === true || rule.value === 'true' || rule.value === 1 || rule.value === '1';
    const got = raw === true || raw === 'true' || raw === 1 || raw === '1';
    return got === want;
  }

  return false;
}

/**
 * Pure in-memory evaluator of a Zoho-style criteria payload against a plain
 * lead object. NEVER throws — returns false on any malformed input.
 *
 * @param {object} record   Plain lead object (native cols + optional custom_fields).
 * @param {object} criteria { match:'and'|'or', rules:[...] }.
 * @returns {boolean}
 */
function recordMatchesCriteria(record, criteria) {
  try {
    if (!criteria || typeof criteria !== 'object') return false;
    const rules = Array.isArray(criteria.rules) ? criteria.rules : [];
    if (rules.length === 0) return false;

    const isOr = String(criteria.match || 'and').toLowerCase() === 'or';
    if (isOr) {
      for (const rule of rules) {
        if (evaluateRule(record, rule)) return true;
      }
      return false;
    }
    // AND — short-circuit on first miss.
    for (const rule of rules) {
      if (!evaluateRule(record, rule)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

// ── target → concrete active user UUID ───────────────────────────────────────
// user target  → that user id if the user exists and is active, else null.
// group target → next active teleseller via the existing group round-robin.
async function resolveTarget(models, target) {
  if (!target || typeof target !== 'object' || !target.id) return null;
  const type = target.type === 'group' ? 'group' : 'user';

  if (type === 'user') {
    const user = await models.User.findByPk(target.id);
    if (!user || !user.is_active) return null;
    return user.id;
  }

  // group → reuse the battle-tested intra-group round-robin (row-locked).
  try {
    const { assignLeadRoundRobin } = require('./roundRobin');
    const rr = await assignLeadRoundRobin(target.id, null);
    return rr?.user?.id || null;
  } catch {
    // Inactive group / no active members — caller falls through.
    return null;
  }
}

/**
 * Resolve a rule to a concrete active user UUID.
 *
 *   assign_strategy 'user'        → targets[0].
 *   assign_strategy 'round_robin' → advance rr_index over targets (mod length),
 *                                   resolve that target, persist rr_index.
 *
 * Round-robin skips targets that don't resolve (deactivated user / empty group)
 * but still advances the cursor so the rotation stays fair. Returns a user UUID
 * or null. Persists rr_index on the rule when it advances.
 *
 * @returns {Promise<string|null>}
 */
async function resolveAssignee(models, rule) {
  const targets = Array.isArray(rule.targets) ? rule.targets.filter((t) => t && t.id) : [];
  if (targets.length === 0) return null;

  if (rule.assign_strategy !== 'round_robin') {
    // Direct assignment — first target only.
    return resolveTarget(models, targets[0]);
  }

  // Round-robin: try each target once starting at rr_index, advancing on every
  // attempt so the pointer never sticks on a dead target.
  const len = targets.length;
  let cursor = Number.isInteger(rule.rr_index) ? rule.rr_index : 0;
  for (let attempt = 0; attempt < len; attempt += 1) {
    const idx = ((cursor % len) + len) % len; // safe modulo for negatives
    const target = targets[idx];
    cursor = idx + 1;
    // Persist the advanced cursor before resolving so a crash mid-resolve
    // still moves the rotation forward next time.
    rule.rr_index = cursor % len;
    // eslint-disable-next-line no-await-in-loop
    const assigneeId = await resolveTarget(models, target);
    if (assigneeId) {
      try {
        await rule.save({ fields: ['rr_index'] });
      } catch {
        /* non-fatal — rotation just doesn't advance this time */
      }
      return assigneeId;
    }
  }

  // Every target was unusable — still persist the advanced cursor.
  try {
    await rule.save({ fields: ['rr_index'] });
  } catch {
    /* non-fatal */
  }
  return null;
}

/**
 * Walk active lead assignment rules in `position` order and return the first
 * one that matches the lead, together with a resolved assignee.
 *
 * @param {object} models  The models registry.
 * @param {object} lead    A Sequelize Lead instance OR plain object.
 * @returns {Promise<{ rule: object, assigneeId: string }|null>}  NEVER throws.
 */
async function evaluateAssignmentRules(models, lead) {
  try {
    if (!models || !models.AssignmentRule || !lead) return null;

    const rules = await models.AssignmentRule.findAll({
      where: { module: 'lead', is_active: true },
      order: [['position', 'ASC'], ['created_at', 'ASC']],
    });
    if (!rules.length) return null;

    // Evaluate against a plain snapshot so both instances and POJOs work and
    // custom_fields is a plain object.
    const record = typeof lead.toJSON === 'function' ? lead.toJSON() : lead;

    for (const rule of rules) {
      const matches = rule.match_type === 'all'
        ? true
        : recordMatchesCriteria(record, rule.criteria);
      if (!matches) continue;

      // eslint-disable-next-line no-await-in-loop
      const assigneeId = await resolveAssignee(models, rule);
      if (assigneeId) return { rule, assigneeId };
      // Rule matched but produced no usable assignee — keep walking so a
      // later rule (or the legacy router) can still assign the lead.
    }
    return null;
  } catch {
    // Contract: never throw — a failing engine must not block lead creation.
    return null;
  }
}

module.exports = {
  recordMatchesCriteria,
  resolveAssignee,
  evaluateAssignmentRules,
  // exported for tests / preview reuse
  evaluateRule,
};
