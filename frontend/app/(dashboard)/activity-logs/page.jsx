'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Activity, RefreshCw, ShieldOff, Filter, ShieldCheck, Boxes, Zap, UserCircle2, Calendar,
} from 'lucide-react';
import api, { unwrap } from '@/lib/api';
import { useStore } from '@/store/useStore';
import RoleGuard from '@/components/layout/RoleGuard';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import FilterRail from '@/components/shared/FilterRail';

// Admins can't see super_admin or other admin actions — surfacing those roles
// in the filter would just produce empty lists, so we strip them client-side
// too. The backend enforces the same rule regardless.
const ROLE_OPTIONS_SUPER_ADMIN = [
  { value: 'all',           label: 'Every role' },
  { value: 'super_admin',   label: 'Super admins' },
  { value: 'admin',         label: 'Admins' },
  { value: 'floor_manager', label: 'Floor managers' },
  { value: 'senior',        label: 'Seniors' },
  { value: 'tele_sales',    label: 'Telesellers' },
  { value: 'back_office',   label: 'Back office' },
  { value: 'auditor',       label: 'Auditors' },
  { value: 'archive',       label: 'Archive' },
  { value: 'custom',        label: 'Custom users' },
];

const ROLE_OPTIONS_ADMIN = ROLE_OPTIONS_SUPER_ADMIN.filter(
  (r) => !['super_admin', 'admin'].includes(r.value),
);

const ACTION_LABELS = {
  ASSIGN_LEAD:               { label: 'Lead reassigned',          color: 'amber' },
  REASSIGN_LEAD:             { label: 'Lead reassigned',          color: 'amber' },
  CHANGE_LEAD_STATUS:        { label: 'Status changed',           color: 'blue' },
  DEACTIVATE_USER:           { label: 'User deactivated',         color: 'red' },
  ACTIVATE_USER:             { label: 'User activated',           color: 'emerald' },
  RESET_PASSWORD:            { label: 'Password reset',           color: 'amber' },
  CREATE:                    { label: 'Created',                  color: 'emerald' },
  UPDATE:                    { label: 'Updated',                  color: 'blue' },
  SOFT_DELETE:               { label: 'Deleted (soft)',           color: 'red' },
  RESTORE:                   { label: 'Restored',                 color: 'emerald' },
  UPDATE_PERMISSION:         { label: 'Role permission updated',  color: 'blue' },
  UPDATE_USER_PERMISSIONS:   { label: 'User permissions updated', color: 'blue' },
  BULK_UPDATE_PERMISSIONS:   { label: 'Permissions bulk-updated', color: 'blue' },
  COPY_ROLE_PERMISSIONS:     { label: 'Permissions copied',       color: 'blue' },
  RESET_PERMISSIONS:         { label: 'Permissions reset',        color: 'amber' },
  DISABLE_CATEGORY:          { label: 'Category disabled',        color: 'red' },
  CHANGE_USER_LANGUAGE:      { label: 'Language changed',         color: 'blue' },
  IMPERSONATE:               { label: 'Impersonated',             color: 'amber' },
};

const COLOR_MAP = {
  red:     'text-red-600 dark:text-red-400 bg-red-500/10 border-red-500/30',
  amber:   'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/30',
  blue:    'text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/30',
  emerald: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  slate:   'text-slate-600 dark:text-slate-400 bg-slate-500/10 border-slate-500/30',
};

const ROLE_BADGE = {
  super_admin:   'text-red-600 dark:text-red-400 border-red-500/30',
  admin:         'text-purple-600 dark:text-purple-400 border-purple-500/30',
  floor_manager: 'text-amber-600 dark:text-amber-400 border-amber-500/30',
  senior:        'text-blue-600 dark:text-blue-400 border-blue-500/30',
  tele_sales:    'text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  back_office:   'text-slate-600 dark:text-slate-400 border-slate-500/30',
  auditor:       'text-teal-600 dark:text-teal-400 border-teal-500/30',
  archive:       'text-slate-600 dark:text-slate-400 border-slate-500/30',
  custom:        'text-amber-600 dark:text-amber-400 border-amber-500/30',
};

export default function ActivityLogsPage() {
  return (
    <RoleGuard allow={['super_admin', 'admin']}>
      <ActivityLogsContent />
    </RoleGuard>
  );
}

function ActivityLogsContent() {
  const router = useRouter();
  const sp = useSearchParams();
  const initialUserId = sp?.get('user') || '';
  const viewer = useStore((s) => s.user);
  const isSuperAdmin = viewer?.role === 'super_admin';
  const roleOptions = isSuperAdmin ? ROLE_OPTIONS_SUPER_ADMIN : ROLE_OPTIONS_ADMIN;

  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [visibility, setVisibility] = useState(null);
  const [focusedUser, setFocusedUser] = useState(null); // resolved User object when user_id is set
  const [actorOptions, setActorOptions] = useState([]); // users for the Actor chip

  // Single source of truth for every native filter. `date_from`/`date_to` are
  // sent verbatim to the backend; the FilterRail "Created" daterange chip owns
  // them (with built-in Today/7d/30d/This month presets).
  const [filters, setFilters] = useState({
    role: '',
    resource: '',
    action: '',
    user_id: initialUserId,
    search: '',
    date_from: '',
    date_to: '',
  });

  // Live-apply callback shared by every chip in the rail. Keeps the ?user query
  // param in sync so a focused-user deep link survives refresh — and is dropped
  // the moment the Actor chip is cleared.
  const applyFilters = useCallback((next) => {
    setFilters(next);
    // Drop the ?user deep-link once the Actor chip is cleared. Keyed on the
    // mount-captured id (stable) rather than the per-render searchParams object.
    if (!next.user_id && initialUserId) router.replace('/activity-logs');
  }, [router, initialUserId]);

  // When user_id is set (either via URL or by clicking "View activity"), pull
  // the user record so the chip can show a name instead of a uuid.
  useEffect(() => {
    if (!filters.user_id) {
      setFocusedUser(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get(`/users/${filters.user_id}`);
        const u = unwrap(res);
        if (!cancelled) setFocusedUser(u || null);
      } catch {
        if (!cancelled) setFocusedUser(null);
      }
    })();
    return () => { cancelled = true; };
  }, [filters.user_id]);

  // Populate the Actor single-select with selectable users. Admins get every
  // actor they're allowed to audit; the backend already hides admin/super-admin
  // actors from admin viewers, so this list mirrors what they can filter by.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get('/users', { params: { limit: 500, is_active: true } });
        const list = unwrap(res) || [];
        if (!cancelled) setActorOptions(Array.isArray(list) ? list : []);
      } catch {
        if (!cancelled) setActorOptions([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.role) params.append('role', filters.role);
      if (filters.resource) params.append('resource', filters.resource);
      if (filters.action) params.append('action', filters.action);
      if (filters.user_id) params.append('user_id', filters.user_id);
      if (filters.date_from) params.append('date_from', filters.date_from);
      if (filters.date_to) params.append('date_to', filters.date_to);
      params.append('limit', '200');
      const res = await api.get(`/audit-logs/all?${params}`);
      const data = unwrap(res) || {};
      setLogs(data.items || []);
      setVisibility(data.visibility || null);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [filters.role, filters.resource, filters.action, filters.user_id, filters.date_from, filters.date_to]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  // Options for the Actor chip — name (or email) per user, capped to keep the
  // popover snappy. The focused user is folded in so a deep-linked id always has
  // a readable label even if it's outside the first page of users.
  const actorChipOptions = useMemo(() => {
    const seen = new Set();
    const out = [];
    const push = (u) => {
      if (!u?.id || seen.has(u.id)) return;
      seen.add(u.id);
      const name = `${u.first_name || ''} ${u.last_name || ''}`.trim();
      out.push({ value: u.id, label: name ? `${name}${u.email ? ` · ${u.email}` : ''}` : (u.email || u.id) });
    };
    if (focusedUser) push(focusedUser);
    actorOptions.forEach(push);
    return out;
  }, [actorOptions, focusedUser]);

  // Role chip options — drop the synthetic "all" entry (FilterRail renders its
  // own All radio); the gating between super-admin and admin viewers is
  // preserved via ROLE_OPTIONS_SUPER_ADMIN / ROLE_OPTIONS_ADMIN.
  const roleChipOptions = useMemo(
    () => roleOptions.filter((r) => r.value !== 'all'),
    [roleOptions],
  );

  const filterSpec = useMemo(() => [
    { key: 'role', label: 'Role', kind: 'single', glyph: ShieldCheck, tint: 'bg-violet-500/40', options: roleChipOptions, allLabel: 'Every role', width: 'w-[240px]' },
    {
      key: 'resource', label: 'Resource', kind: 'single', glyph: Boxes, tint: 'bg-indigo-500/40', allLabel: 'All resources',
      options: [
        { value: 'Lead', label: 'Leads' },
        { value: 'User', label: 'Users' },
        { value: 'Group', label: 'Groups' },
        { value: 'Campaign', label: 'Campaigns' },
        { value: 'Setting', label: 'Settings' },
        { value: 'RolePermission', label: 'Role permissions' },
      ],
    },
    {
      key: 'action', label: 'Action', kind: 'single', glyph: Zap, tint: 'bg-blue-500/40', allLabel: 'All actions', width: 'w-[260px]',
      options: Object.entries(ACTION_LABELS).map(([value, v]) => ({ value, label: v.label })),
    },
    {
      key: 'user_id', label: 'Actor', kind: 'single', glyph: UserCircle2, tint: 'bg-teal-500/40', allLabel: 'Everyone',
      options: actorChipOptions, width: 'w-[300px]', capitalize: false,
    },
    { key: 'created', fromKey: 'date_from', toKey: 'date_to', label: 'Created', kind: 'daterange', glyph: Calendar, tint: 'bg-amber-500/40' },
  ], [roleChipOptions, actorChipOptions]);

  // Lightweight client-side text search across user name + email so admins can
  // jump to a specific actor without paginating. Server still does the heavy
  // role + resource + action filtering.
  const filteredLogs = useMemo(() => {
    if (!filters.search) return logs;
    const needle = filters.search.toLowerCase();
    return logs.filter((l) =>
      (l.user_name || '').toLowerCase().includes(needle)
      || (l.user_email || '').toLowerCase().includes(needle)
      || (l.action || '').toLowerCase().includes(needle)
      || (l.resource || '').toLowerCase().includes(needle));
  }, [logs, filters.search]);

  const renderDiff = (log) => {
    if (log.action === 'ASSIGN_LEAD' || log.action === 'REASSIGN_LEAD') {
      const newAssignee = log.new_data?.assigned_to_id;
      return (
        <span className="text-xs">
          Reassigned to{' '}
          <span className="font-mono text-muted-foreground">
            {newAssignee ? `${String(newAssignee).slice(0, 8)}…` : '—'}
          </span>
        </span>
      );
    }
    if (log.action === 'CHANGE_LEAD_STATUS') {
      return (
        <span className="text-xs flex items-center gap-1.5 flex-wrap">
          <Badge variant="outline" className="text-[10px]">{log.old_data?.lead_status || '—'}</Badge>
          <span>→</span>
          <Badge variant="outline" className="text-[10px] text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
            {log.new_data?.lead_status || '—'}
          </Badge>
        </span>
      );
    }
    if (log.action === 'CHANGE_USER_LANGUAGE' || log.action === 'CHANGE_USER_LANGUAGES') {
      const oldList = Array.isArray(log.old_data?.languages) ? log.old_data.languages : [];
      const newList = Array.isArray(log.new_data?.languages) ? log.new_data.languages : [];
      const fmt = (arr) => (arr.length ? arr.join(', ') : '—');
      return (
        <span className="text-xs flex items-center gap-1.5 flex-wrap">
          <Badge variant="outline" className="text-[10px]">{fmt(oldList)}</Badge>
          <span>→</span>
          <Badge variant="outline" className="text-[10px] text-purple-600 dark:text-purple-400 border-purple-500/30">
            {fmt(newList)}
          </Badge>
        </span>
      );
    }
    if (log.action === 'UPDATE_USER_PERMISSIONS') {
      const granted = Object.values(log.new_data || {}).filter((l) => l && l !== 'none').length;
      return (
        <span className="text-[11px] text-muted-foreground">
          {granted} permission{granted === 1 ? '' : 's'} granted
        </span>
      );
    }
    if (log.action === 'UPDATE_PERMISSION') {
      return (
        <span className="text-xs flex items-center gap-1.5 flex-wrap">
          <code className="text-[10px] font-mono text-muted-foreground">
            {log.new_data?.role}.{log.new_data?.permission_key}
          </code>
          <Badge variant="outline" className="text-[10px]">{log.old_data?.level || '—'}</Badge>
          <span>→</span>
          <Badge variant="outline" className="text-[10px] text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
            {log.new_data?.level || '—'}
          </Badge>
        </span>
      );
    }
    if (log.old_data || log.new_data) {
      const blob = JSON.stringify(log.new_data || log.old_data || {});
      return (
        <span className="text-[11px] text-muted-foreground font-mono truncate max-w-[300px] inline-block">
          {blob.slice(0, 80)}{blob.length > 80 ? '…' : ''}
        </span>
      );
    }
    return null;
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2 tracking-tight">
            <Activity className="h-5 w-5 text-blue-500 dark:text-blue-400" />
            Activity log
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isSuperAdmin
              ? 'Every audit-logged action across every profile, including admins and other super admins.'
              : 'Every audit-logged action by non-admin profiles. Admin and super-admin activity is hidden.'}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadLogs}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
        </Button>
      </div>

      {!isSuperAdmin && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 flex items-start gap-2 text-xs">
          <ShieldOff className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-amber-700 dark:text-amber-300">Admin view</p>
            <p className="text-amber-700/80 dark:text-amber-300/80">
              You can audit every non-admin profile (telesellers, seniors, back office, custom users, etc.).
              Super-admin and other admin activity is reserved for super admins.
            </p>
          </div>
        </div>
      )}

      {/* Filters — search expands on its own line; the chip rail carries the
          structured filters (Role, Resource, Action, Actor, Created) and matches
          every other CRM list page. Visibility metadata drops to its own line so
          it never compresses the controls into a stack. */}
      <div className="space-y-2.5">
        <div className="relative max-w-md">
          <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            placeholder="Search user, email, action…"
            className="pl-8 h-9"
          />
        </div>

        <FilterRail spec={filterSpec} filters={filters} onChange={applyFilters} />

        {visibility && (
          <p className="text-[10px] text-muted-foreground px-1">
            Visible actors: {visibility.visible_actor_count}
            {visibility.excluded_roles?.length > 0 && (
              <> · hidden: {visibility.excluded_roles.join(', ')}</>
            )}
          </p>
        )}
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b">
                <th className="text-left p-3 font-medium text-muted-foreground">When</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Actor</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Action</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Resource</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Details</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Loading…</td></tr>
              )}
              {!loading && filteredLogs.length === 0 && (
                <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No activity matches your filters yet</td></tr>
              )}
              {filteredLogs.map((log) => {
                const meta = ACTION_LABELS[log.action] || { label: log.action, color: 'slate' };
                const when = log.created_at || log.createdAt;
                return (
                  <tr key={log.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="p-3 text-muted-foreground whitespace-nowrap">
                      {when
                        ? new Date(when).toLocaleString('en-IN', {
                            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                          })
                        : '—'}
                    </td>
                    <td className="p-3">
                      <p className="font-medium">{log.user_name || '—'}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {log.user_role && (
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[9px] h-4 px-1 leading-none capitalize',
                              ROLE_BADGE[log.user_role] || 'text-muted-foreground',
                            )}
                          >
                            {log.user_role.replace(/_/g, ' ')}
                          </Badge>
                        )}
                        <p className="text-muted-foreground text-[10px] truncate">{log.user_email || ''}</p>
                      </div>
                    </td>
                    <td className="p-3">
                      <Badge variant="outline" className={cn('text-[10px] border', COLOR_MAP[meta.color])}>
                        {meta.label}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <Badge variant="secondary" className="text-[10px]">{log.resource}</Badge>
                      {log.lead && (
                        <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                          {log.lead.name} · {log.lead.phone}
                        </p>
                      )}
                      {!log.lead && log.resource_id && (
                        <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                          {String(log.resource_id).slice(0, 8)}…
                        </p>
                      )}
                    </td>
                    <td className="p-3">{renderDiff(log)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
