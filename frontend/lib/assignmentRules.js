import api, { unwrap } from './api';

/**
 * API helpers for the Zoho-style Assignment Rules feature.
 *
 * The backend lives at /api/v1/assignment-rules. Its list / reorder endpoints
 * wrap the collection in `{ items: [...] }`; the single-resource endpoints
 * (getOne / create / update) return the hydrated rule object directly. The
 * helpers below normalise those shapes so callers always get plain data.
 *
 * AssignmentRule shape (as returned, targets are hydrated with label/resolved):
 *   { id, name, description, module:'lead',
 *     match_type:'all'|'criteria',
 *     criteria:{ match:'and'|'or', rules:[{field,source,type,operator,value,value2?}] }|null,
 *     assign_strategy:'user'|'round_robin',
 *     targets:[{ type:'user'|'group', id, label?, resolved? }],
 *     position, is_active }
 */

const BASE = '/assignment-rules';

/** List every rule for a module, ordered by position (ascending). */
export async function listRules(params = {}) {
  const res = await api.get(BASE, { params });
  const data = unwrap(res);
  // list() responds with { items }, but stay defensive if the shape changes.
  if (Array.isArray(data)) return data;
  return data?.items || [];
}

/** Fetch a single rule (hydrated targets) by id. */
export async function getRule(id) {
  const res = await api.get(`${BASE}/${id}`);
  return unwrap(res);
}

/** Create a rule. `payload` mirrors the AssignmentRule shape (minus id/position). */
export async function createRule(payload) {
  const res = await api.post(BASE, payload);
  return unwrap(res);
}

/** Patch a rule. `payload` may carry any subset of the editable fields. */
export async function updateRule(id, payload) {
  const res = await api.patch(`${BASE}/${id}`, payload);
  return unwrap(res);
}

/** Soft-delete a rule (paranoid on the backend). */
export async function deleteRule(id) {
  const res = await api.delete(`${BASE}/${id}`);
  return unwrap(res);
}

/**
 * Persist a new ordering. `list` is an array of `{ id, position }`. The backend
 * route is POST /assignment-rules/reorder and accepts the bare array as the
 * request body. Returns the refreshed, re-hydrated list.
 */
export async function reorderRules(list) {
  const order = (list || [])
    .filter((o) => o && o.id != null)
    .map((o) => ({ id: o.id, position: Number(o.position) }));
  const res = await api.post(`${BASE}/reorder`, order);
  const data = unwrap(res);
  if (Array.isArray(data)) return data;
  return data?.items || [];
}

/**
 * Ask the backend how many of the recent leads a criteria set would match.
 * Body is `{ criteria, match_type }`. Returns `{ matched, sampled, sample_size }`.
 */
export async function previewRule({ criteria, match_type = 'criteria' }) {
  const res = await api.post(`${BASE}/preview`, { criteria, match_type });
  return unwrap(res) || { matched: 0, sampled: 0 };
}

export default {
  listRules,
  getRule,
  createRule,
  updateRule,
  deleteRule,
  reorderRules,
  previewRule,
};
