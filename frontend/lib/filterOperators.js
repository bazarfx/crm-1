/**
 * Operator vocabulary for the Zoho-style criteria filter builder.
 *
 * This is the frontend half of the shared "criteria" wire contract used by the
 * Leads list's `criteria` query param:
 *
 *   { match: 'and'|'or', rules: [
 *       { field, source: 'native'|'custom', type, operator, value, value2? }
 *   ] }
 *
 * Operators are grouped by TYPE FAMILY (text / number / date / choice / boolean)
 * so every field of a given kind offers exactly the operators the backend knows
 * how to translate. `typeFamily(fieldType)` collapses the 13 wire types down to
 * those five families.
 */

// ---------------------------------------------------------------------------
// Type family — collapses the wire `type` down to an operator family.
// ---------------------------------------------------------------------------
export function typeFamily(fieldType) {
  switch (fieldType) {
    case 'text':
    case 'email':
    case 'phone':
    case 'url':
    case 'long_text':
      return 'text';
    case 'number':
    case 'currency':
    case 'percent':
      return 'number';
    case 'date':
    case 'datetime':
      return 'date';
    case 'dropdown':
    case 'multiselect':
    case 'tags':
      return 'choice';
    case 'boolean':
      return 'boolean';
    default:
      return 'text';
  }
}

// ---------------------------------------------------------------------------
// Operators per family. Order matters — the first entry is the default pick
// when a rule is created or its field changes to a new family.
// ---------------------------------------------------------------------------
export const OPERATORS_BY_TYPE = {
  text: [
    { value: 'contains', label: 'contains' },
    { value: 'not_contains', label: "doesn't contain" },
    { value: 'is', label: 'is' },
    { value: 'is_not', label: 'is not' },
    { value: 'starts_with', label: 'starts with' },
    { value: 'ends_with', label: 'ends with' },
    { value: 'is_empty', label: 'is empty' },
    { value: 'is_not_empty', label: 'is not empty' },
  ],
  number: [
    { value: 'is', label: 'is' },
    { value: 'is_not', label: 'is not' },
    { value: 'gt', label: 'greater than' },
    { value: 'gte', label: 'greater or equal' },
    { value: 'lt', label: 'less than' },
    { value: 'lte', label: 'less or equal' },
    { value: 'between', label: 'between' },
    { value: 'is_empty', label: 'is empty' },
    { value: 'is_not_empty', label: 'is not empty' },
  ],
  date: [
    { value: 'is', label: 'is' },
    { value: 'before', label: 'before' },
    { value: 'after', label: 'after' },
    { value: 'between', label: 'between' },
    { value: 'is_empty', label: 'is empty' },
    { value: 'is_not_empty', label: 'is not empty' },
  ],
  choice: [
    { value: 'is_any_of', label: 'is any of' },
    { value: 'is_none_of', label: 'is none of' },
    { value: 'is_empty', label: 'is empty' },
    { value: 'is_not_empty', label: 'is not empty' },
  ],
  boolean: [
    { value: 'is', label: 'is' },
  ],
};

// ---------------------------------------------------------------------------
// Value-shape helpers used by the panel to decide how to render / serialize.
// ---------------------------------------------------------------------------

/** Operators that carry NO value input (unary predicates). */
export const VALUELESS_OPERATORS = new Set(['is_empty', 'is_not_empty']);

/** Operators that need a second value input (`value2`). */
export const RANGE_OPERATORS = new Set(['between']);

/** Operators whose value is a string[] (choice multi-select). */
export const MULTI_VALUE_OPERATORS = new Set(['is_any_of', 'is_none_of']);

export function operatorsFor(fieldType) {
  return OPERATORS_BY_TYPE[typeFamily(fieldType)] || OPERATORS_BY_TYPE.text;
}

/** Default operator for a field type (first in its family list). */
export function defaultOperator(fieldType) {
  return operatorsFor(fieldType)[0]?.value || 'contains';
}

export function isValueless(operator) {
  return VALUELESS_OPERATORS.has(operator);
}

export function isRange(operator) {
  return RANGE_OPERATORS.has(operator);
}

export function isMultiValue(operator) {
  return MULTI_VALUE_OPERATORS.has(operator);
}
