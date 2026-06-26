'use client';

import { useEffect, useState } from 'react';
import api, { unwrap } from '@/lib/api';

/**
 * Client-side roles registry. Mirrors the dynamic-fields cache pattern: one
 * in-flight fetch shared across callers, plus a synchronous label/colour
 * lookup that falls back to the built-in system roles before the fetch lands.
 */

const STATIC_META = {
  super_admin:   { name: 'Super Admin',   color: '#EF4444' },
  admin:         { name: 'Admin',         color: '#8B5CF6' },
  floor_manager: { name: 'Floor Manager', color: '#F59E0B' },
  schema_editor: { name: 'Schema Editor', color: '#6366F1' },
  senior:        { name: 'Senior',        color: '#3B82F6' },
  tele_sales:    { name: 'Teleseller',    color: '#10B981' },
  back_office:   { name: 'Back Office',   color: '#64748B' },
  auditor:       { name: 'Auditor',       color: '#14B8A6' },
  archive:       { name: 'Archive',       color: '#6B7280' },
  custom:        { name: 'Custom',        color: '#F97316' },
};

let _cache = null;
let _inflight = null;

export async function fetchRoles(force = false) {
  if (_cache && !force) return _cache;
  if (_inflight && !force) return _inflight;
  _inflight = api
    .get('/roles')
    .then((r) => { _cache = unwrap(r) || []; _inflight = null; return _cache; })
    .catch((e) => { _inflight = null; throw e; });
  return _inflight;
}

export function invalidateRoles() { _cache = null; _inflight = null; }

function fromCache(key) {
  if (!_cache) return null;
  return _cache.find((r) => r.key === key) || null;
}

function prettify(key) {
  return String(key || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function roleLabel(key) {
  return fromCache(key)?.name || STATIC_META[key]?.name || prettify(key);
}

export function roleColor(key) {
  return fromCache(key)?.color || STATIC_META[key]?.color || '#64748B';
}

/** React hook: returns { roles, loading, error, reload }. */
export function useRoles() {
  const [roles, setRoles] = useState(_cache || []);
  const [loading, setLoading] = useState(!_cache);
  const [error, setError] = useState(null);

  const reload = async (force = true) => {
    setLoading(true);
    try {
      const data = await fetchRoles(force);
      setRoles(data);
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(false); /* eslint-disable-next-line */ }, []);

  return { roles, loading, error, reload };
}
