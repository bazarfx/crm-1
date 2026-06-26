'use client';

import { useEffect, useState } from 'react';
import api, { unwrap } from '@/lib/api';
import { iconByName } from '@/lib/moduleIcons';

/**
 * Client-side modules registry — mirrors lib/roles.js (shared in-flight fetch
 * + synchronous lookups with a built-in fallback so labels render before the
 * fetch lands).
 */

export const STATIC_BUILTINS = [
  { key: 'lead',          label_singular: 'Lead',     label_plural: 'Leads',      icon: 'Users',     color: '#4F8EF7', is_system: true, is_active: true },
  { key: 'user',          label_singular: 'User',     label_plural: 'Users',      icon: 'UserCog',   color: '#8B5CF6', is_system: true, is_active: true },
  { key: 'deal',          label_singular: 'Deal',     label_plural: 'Deals',      icon: 'Award',     color: '#10B981', is_system: true, is_active: true },
  { key: 'campaign',      label_singular: 'Campaign', label_plural: 'Campaigns',  icon: 'Megaphone', color: '#F59E0B', is_system: true, is_active: true },
  { key: 'group',         label_singular: 'Group',    label_plural: 'Groups',     icon: 'Building2', color: '#14B8A6', is_system: true, is_active: true },
  { key: 'lead_activity', label_singular: 'Activity', label_plural: 'Activities', icon: 'Activity',  color: '#6366F1', is_system: true, is_active: true },
];

let _cache = null;
let _inflight = null;

export async function fetchModules(force = false) {
  if (_cache && !force) return _cache;
  if (_inflight && !force) return _inflight;
  _inflight = api
    .get('/modules')
    .then((r) => { _cache = unwrap(r) || []; _inflight = null; return _cache; })
    .catch((e) => { _inflight = null; throw e; });
  return _inflight;
}

export function invalidateModules() { _cache = null; _inflight = null; }

export function moduleByKey(key) {
  const fromCache = _cache?.find((m) => m.key === key);
  if (fromCache) return fromCache;
  return STATIC_BUILTINS.find((m) => m.key === key) || null;
}

/** Resolve a module's lucide icon component (by its stored icon name). */
export function iconForModule(mod) {
  return iconByName(typeof mod === 'string' ? mod : mod?.icon);
}

export function useModules() {
  const [modules, setModules] = useState(_cache || STATIC_BUILTINS);
  const [loading, setLoading] = useState(!_cache);
  const [error, setError] = useState(null);

  const reload = async (force = true) => {
    setLoading(true);
    try {
      const data = await fetchModules(force);
      setModules(data);
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(false); /* eslint-disable-next-line */ }, []);

  return { modules, loading, error, reload };
}
