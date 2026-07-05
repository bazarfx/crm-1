import { useEffect, useState } from 'react';
import api from './api';

let cache = { items: null, grouped: {}, at: 0 };
const CACHE_TTL = 30 * 1000;

// Bumped on every invalidate; subscribed forms read it as a render-trigger.
// Lets a DynamicForm sitting on the lead detail page re-fetch the instant
// a new field is saved from the SchemaSidePanel — no page refresh needed.
let version = 0;
const listeners = new Set();
function notify() {
  for (const cb of listeners) {
    try { cb(version); } catch (_) { /* listener must not break others */ }
  }
}

export async function fetchFieldDefinitions({ force = false, entity_type } = {}) {
  if (!force && cache.items && Date.now() - cache.at < CACHE_TTL) {
    return entity_type ? (cache.grouped[entity_type] || []) : cache.items;
  }
  const { data } = await api.get('/field-definitions');
  cache = { items: data.data.items, grouped: data.data.grouped || {}, at: Date.now() };
  return entity_type ? (cache.grouped[entity_type] || []) : cache.items;
}

/**
 * Persist a drag-and-drop layout for one entity. `items` is a flat list of
 * { id, section, display_order }. Bumps the registry version on success so any
 * open form/detail view re-fetches the new order. Returns the server's fresh
 * ordered list.
 */
export async function saveFieldLayout({ entity_type, sections, items }) {
  const { data } = await api.patch('/field-definitions/layout', { entity_type, sections, items });
  invalidateFieldDefinitions();
  return data.data;
}

export function invalidateFieldDefinitions() {
  cache = { items: null, grouped: {}, at: 0 };
  version += 1;
  notify();
}

/**
 * Subscribe to schema-change notifications. Every save in the field
 * editor / side panel bumps the version; the hook re-renders whoever
 * uses it, which lets their useEffect re-run and refetch.
 */
export function useFieldDefinitionsVersion() {
  const [v, setV] = useState(version);
  useEffect(() => {
    listeners.add(setV);
    return () => listeners.delete(setV);
  }, []);
  return v;
}

export function visibleFields(definitions, userRole) {
  return (definitions || []).filter(d => !d.is_archived && (d.visible_to_roles || []).includes(userRole));
}

export function editableFields(definitions, userRole) {
  return visibleFields(definitions, userRole).filter(d => (d.editable_by_roles || []).includes(userRole));
}

export function formatValue(def, value) {
  if (value === null || value === undefined || value === '') return '—';
  switch (def.field_type) {
    case 'currency': return '₹' + Number(value).toLocaleString('en-IN');
    case 'percent': return Number(value).toFixed(1) + '%';
    case 'date': return new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    case 'datetime': return new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    case 'boolean': return value ? 'Yes' : 'No';
    case 'dropdown': {
      const opt = (def.options || []).find(o => o.value === value);
      return opt ? opt.label : value;
    }
    case 'multiselect':
    case 'tags':
      return Array.isArray(value) ? value.join(', ') : value;
    default: return String(value);
  }
}
