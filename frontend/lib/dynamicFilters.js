/**
 * Single source of truth for the custom-field filter wire format.
 *
 * Pages hold a `filters` object whose `cf_*` keys are the query params the
 * backend reads. This module converts between that flat wire shape and the
 * per-field "draft" shape the filter panel edits, and derives the active-filter
 * chips shown on the page. Keeping it here means the panel, chips, and pages
 * can never drift on the encoding.
 *
 * Wire encoding by field kind:
 *   choice (dropdown/multiselect/tags)  cf_<key>=a,b            (OR / contains-any)
 *   number range                        cf_<key>_min, cf_<key>_max
 *   date range                          cf_<key>_min, cf_<key>_max  (ISO strings)
 *   boolean                             cf_<key>=true | false
 *   text                                cf_<key>=<substring>    (contains)
 */

export function fieldKind(def) {
  const t = def?.field_type;
  if (t === 'tags' && !(def.options && def.options.length)) return 'text';
  if (['dropdown', 'multiselect', 'tags'].includes(t)) return 'choice';
  if (['number', 'currency', 'percent'].includes(t)) return 'numrange';
  if (['date', 'datetime'].includes(t)) return 'daterange';
  if (t === 'boolean') return 'bool';
  return 'text';
}

export function emptyDraft(def) {
  switch (fieldKind(def)) {
    case 'choice': return [];
    case 'numrange':
    case 'daterange': return { min: '', max: '' };
    case 'bool': return null;
    default: return '';
  }
}

export function isDraftEmpty(def, draft) {
  switch (fieldKind(def)) {
    case 'choice': return !Array.isArray(draft) || draft.length === 0;
    case 'numrange':
    case 'daterange': return !draft || (!draft.min && !draft.max);
    case 'bool': return draft !== true && draft !== false;
    default: return draft == null || String(draft).trim() === '';
  }
}

/** cf_ param keys this field could occupy (for clearing). */
export function paramKeysFor(def) {
  const k = `cf_${def.field_key}`;
  return fieldKind(def) === 'numrange' || fieldKind(def) === 'daterange'
    ? [`${k}_min`, `${k}_max`]
    : [k];
}

/** One field's draft → its cf_ params. */
export function draftToParams(def, draft) {
  const key = `cf_${def.field_key}`;
  const out = {};
  if (isDraftEmpty(def, draft)) return out;
  switch (fieldKind(def)) {
    case 'choice':
      out[key] = draft.join(',');
      break;
    case 'numrange':
    case 'daterange':
      if (draft.min !== '' && draft.min != null) out[`${key}_min`] = String(draft.min);
      if (draft.max !== '' && draft.max != null) out[`${key}_max`] = String(draft.max);
      break;
    case 'bool':
      out[key] = draft ? 'true' : 'false';
      break;
    default:
      out[key] = String(draft).trim();
  }
  return out;
}

/** Current filters → one field's draft. */
export function paramsToDraft(def, filters = {}) {
  const key = `cf_${def.field_key}`;
  switch (fieldKind(def)) {
    case 'choice': {
      const raw = filters[key];
      return typeof raw === 'string' && raw !== '' ? raw.split(',') : [];
    }
    case 'numrange':
    case 'daterange':
      return { min: filters[`${key}_min`] ?? '', max: filters[`${key}_max`] ?? '' };
    case 'bool':
      return filters[key] === 'true' ? true : filters[key] === 'false' ? false : null;
    default:
      return filters[key] ?? '';
  }
}

/** All filterable defs → { [field_key]: draft } from current filters. */
export function fromQueryParams(defs, filters = {}) {
  const drafts = {};
  for (const def of defs) drafts[def.field_key] = paramsToDraft(def, filters);
  return drafts;
}

/** Merge the panel's drafts back into `filters`, replacing every cf_ key. */
export function toQueryParams(defs, drafts, baseFilters = {}) {
  const next = { ...baseFilters };
  // Drop every cf_ key this set of defs owns, then re-add from drafts.
  for (const def of defs) for (const pk of paramKeysFor(def)) delete next[pk];
  for (const def of defs) Object.assign(next, draftToParams(def, drafts[def.field_key]));
  return next;
}

function optionLabel(def, value) {
  return (def.options || []).find((o) => o.value === value)?.label || value;
}

/** Human-readable display for an active field's value. */
function displayFor(def, filters) {
  const key = `cf_${def.field_key}`;
  const kind = fieldKind(def);
  if (kind === 'choice') {
    const vals = String(filters[key] || '').split(',').filter(Boolean);
    const labels = vals.map((v) => optionLabel(def, v));
    if (labels.length <= 2) return labels.join(', ');
    return `${labels.slice(0, 2).join(', ')} +${labels.length - 2}`;
  }
  if (kind === 'numrange' || kind === 'daterange') {
    const min = filters[`${key}_min`];
    const max = filters[`${key}_max`];
    const cur = def.field_type === 'currency' ? '₹' : '';
    if (min && max) return `${cur}${min} – ${cur}${max}`;
    if (min) return `≥ ${cur}${min}`;
    if (max) return `≤ ${cur}${max}`;
    return '';
  }
  if (kind === 'bool') return filters[key] === 'true' ? 'Yes' : 'No';
  return `"${filters[key]}"`;
}

/** Active filter chips for the page action bar. */
export function activeChips(defs, filters = {}) {
  const chips = [];
  for (const def of defs) {
    const pks = paramKeysFor(def).filter((pk) => filters[pk] != null && filters[pk] !== '');
    if (pks.length === 0) continue;
    chips.push({
      key: def.field_key,
      paramKeys: pks,
      label: def.label,
      display: displayFor(def, filters),
    });
  }
  return chips;
}

/**
 * Split a field's active filter into a display operator + value for the chip's
 * three-zone layout (label · operator · value). Reads from committed `filters`.
 */
export function chipParts(def, filters = {}) {
  const key = `cf_${def.field_key}`;
  const kind = fieldKind(def);
  if (kind === 'choice') {
    const vals = String(filters[key] || '').split(',').filter(Boolean);
    const labels = vals.map((v) => optionLabel(def, v));
    const value = labels.length <= 2
      ? labels.join(', ')
      : `${labels.slice(0, 2).join(', ')} +${labels.length - 2}`;
    return { operator: labels.length > 1 ? 'is any of' : 'is', value };
  }
  if (kind === 'numrange' || kind === 'daterange') {
    const min = filters[`${key}_min`];
    const max = filters[`${key}_max`];
    const cur = def.field_type === 'currency' ? '₹' : '';
    if (min && max) return { operator: 'is between', value: `${cur}${min} – ${cur}${max}` };
    if (min) return { operator: 'is ≥', value: `${cur}${min}` };
    if (max) return { operator: 'is ≤', value: `${cur}${max}` };
    return { operator: 'is', value: '' };
  }
  if (kind === 'bool') return { operator: 'is', value: filters[key] === 'true' ? 'Yes' : 'No' };
  return { operator: 'contains', value: filters[key] || '' };
}

/** Commit ONE field's draft into filters, preserving every other cf_ key. */
export function writeField(def, draft, filters = {}) {
  return toQueryParams([def], { [def.field_key]: draft }, filters);
}

/** Remove a chip's params from filters. */
export function removeChip(filters, paramKeys) {
  const next = { ...filters };
  for (const pk of paramKeys) delete next[pk];
  return next;
}

/** Drop every cf_ key from filters (Clear all). */
export function clearAllCustom(filters) {
  const next = { ...filters };
  for (const k of Object.keys(next)) if (k.startsWith('cf_')) delete next[k];
  return next;
}

/** Count of distinct custom fields currently filtered. */
export function activeCount(defs, filters = {}) {
  return activeChips(defs, filters).length;
}
