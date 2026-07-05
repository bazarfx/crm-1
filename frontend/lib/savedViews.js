import api, { unwrap } from './api';

/**
 * Saved Views API helpers — the Zoho-style "Saved Filters" store.
 *
 * A saved view captures a named snapshot of a list page's filter state:
 *   { id, entity_type, name, owner_id, owner_name, is_shared, is_default,
 *     filters, criteria, columns, sort, position, created_at, updated_at }
 *
 * The backend serves `own + shared` views for an entity from
 * GET /saved-views?entity_type=<key>, and always wraps payloads in the standard
 * { success, message, data } envelope. `unwrap` peels the envelope; the list
 * endpoint returns { items: [...] } inside `data`.
 */

/** List the caller's own views + every shared view for an entity. */
export async function listViews(entityType) {
  const res = await api.get('/saved-views', { params: { entity_type: entityType } });
  const data = unwrap(res);
  return Array.isArray(data) ? data : (data?.items || []);
}

/**
 * Create a saved view.
 * payload: { entity_type, name, is_shared?, filters?, criteria?, columns?, sort? }
 * Non-manager roles can't actually share — the backend forces is_shared=false.
 */
export async function createView(payload) {
  const res = await api.post('/saved-views', payload);
  return unwrap(res);
}

/** Patch a view (owner or admin). patch may include any createable field. */
export async function updateView(id, patch) {
  const res = await api.patch(`/saved-views/${id}`, patch);
  return unwrap(res);
}

/** Delete (soft) a view (owner or admin). */
export async function deleteView(id) {
  const res = await api.delete(`/saved-views/${id}`);
  return unwrap(res);
}
