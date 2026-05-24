'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Activity, RefreshCw, ShieldOff, Filter, X, UserCircle2, CalendarDays } from 'lucide-react';
import api, { unwrap } from '@/lib/api';
import { useStore } from '@/store/useStore';
import RoleGuard from '@/components/layout/RoleGuard';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

// Period presets — translate a single dropdown value into date_from/date_to.
// Anchored on "now" each time the user picks one (no auto-shifting).
const PERIOD_PRESETS = [
  { value: 'all',     label: 'All time' },
  { value: 'today',   label: 'Today' },
  { value: 'week',    label: 'This week' },
  { value: 'last7',   label: 'Last 7 days' },
  { value: 'month',   label: 'This month' },
  { value: 'last30',  label: 'Last 30 days' },
];

function computePeriodRange(preset) {
  if (preset === 'all') return { date_from: null, date_to: null };
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  let start;
  if (preset === 'today') {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  } else if (preset === 'week') {
    // ISO week — Monday start. Sunday gets pulled back 6 days.
    const day = now.getDay(); // 0 (Sun) – 6 (Sat)
    const diff = day === 0 ? 6 : day - 1;
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff);
  } else if (preset === 'last7') {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
  } else if (preset === 'month') {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (preset === 'last30') {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
  } else {
    return { date_from: null, date_to: null };
  }
  return { date_from: start.toISOString(), date_to: end.toISOString() };
}

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
  const [filter, setFilter] = useState({
    role: 'all',
    resource: '',
    action: '',
    user_id: initialUserId,
    search: '',
    period: 'all',
  });

  // When user_id is set (either via URL or by clicking "View activity"), pull
  // the user record so the filter pill can show a name instead of a uuid.
  useEffect(() => {
    if (!filter.user_id) {
      setFocusedUser(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get(`/users/${filter.user_id}`);
        const u = unwrap(res);
        if (!cancelled) setFocusedUser(u || null);
      } catch {
        if (!cancelled) setFocusedUser(null);
      }
    })();
    return () => { cancelled = true; };
  }, [filter.user_id]);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter.role && filter.role !== 'all') params.append('role', filter.role);
      if (filter.resource) params.append('resource', filter.resource);
      if (filter.action) params.append('action', filter.action);
      if (filter.user_id) params.append('user_id', filter.user_id);
      const { date_from, date_to } = computePeriodRange(filter.period);
      if (date_from) params.append('date_from', date_from);
      if (date_to) params.append('date_to', date_to);
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
  }, [filter.role, filter.resource, filter.action, filter.user_id, filter.period]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  const clearUserFilter = () => {
    setFilter((f) => ({ ...f, user_id: '' }));
    // Drop the ?user= query param so a refresh doesn't bring it back.
    if (sp?.get('user')) router.replace('/activity-logs');
  };

  // Lightweight client-side text search across user name + email so admins can
  // jump to a specific actor without paginating. Server still does the heavy
  // role + resource + action filtering.
  const filteredLogs = useMemo(() => {
    if (!filter.search) return logs;
    const needle = filter.search.toLowerCase();
    return logs.filter((l) =>
      (l.user_name || '').toLowerCase().includes(needle)
      || (l.user_email || '').toLowerCase().includes(needle)
      || (l.action || '').toLowerCase().includes(needle)
      || (l.resource || '').toLowerCase().includes(needle));
  }, [logs, filter.search]);

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

      {/* Focused-user pill — surfaces clearly when arriving from a "View activity" click */}
      {filter.user_id && (
        <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 px-3 py-2 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <UserCircle2 className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-blue-700/80 dark:text-blue-300/80">Showing activity for</p>
              <p className="text-sm font-medium truncate">
                {focusedUser
                  ? `${focusedUser.first_name || ''} ${focusedUser.last_name || ''}`.trim() || focusedUser.email
                  : 'Loading…'}
                {focusedUser?.role && (
                  <Badge
                    variant="outline"
                    className={cn(
                      'ml-2 text-[9px] h-4 px-1 leading-none align-middle capitalize',
                      ROLE_BADGE[focusedUser.role] || 'text-muted-foreground',
                    )}
                  >
                    {focusedUser.role.replace(/_/g, ' ')}
                  </Badge>
                )}
              </p>
              {focusedUser?.email && (
                <p className="text-[10px] text-muted-foreground font-mono truncate">{focusedUser.email}</p>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={clearUserFilter}
          >
            <X className="h-3 w-3" /> Show everyone
          </Button>
        </div>
      )}

      {/* Filters — search expands; the rest is a row of equal-height pickers
          inside a single card border. Visibility metadata drops to its own line
          so it never compresses the controls into a stack. */}
      <div className="space-y-2">
        <div className="rounded-xl border bg-card p-2.5 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={filter.search}
              onChange={(e) => setFilter((f) => ({ ...f, search: e.target.value }))}
              placeholder="Search user, email, action…"
              className="pl-8 h-9"
            />
          </div>

          <Select
            value={filter.role}
            onValueChange={(v) => setFilter((f) => ({ ...f, role: v }))}
          >
            <SelectTrigger className="w-40 h-9 text-sm">
              <SelectValue placeholder="Role" />
            </SelectTrigger>
            <SelectContent>
              {roleOptions.map((r) => (
                <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filter.resource || 'all'}
            onValueChange={(v) => setFilter((f) => ({ ...f, resource: v === 'all' ? '' : v }))}
          >
            <SelectTrigger className="w-40 h-9 text-sm">
              <SelectValue placeholder="Resource" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All resources</SelectItem>
              <SelectItem value="Lead">Leads</SelectItem>
              <SelectItem value="User">Users</SelectItem>
              <SelectItem value="Group">Groups</SelectItem>
              <SelectItem value="Campaign">Campaigns</SelectItem>
              <SelectItem value="Setting">Settings</SelectItem>
              <SelectItem value="RolePermission">Role permissions</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={filter.action || 'all'}
            onValueChange={(v) => setFilter((f) => ({ ...f, action: v === 'all' ? '' : v }))}
          >
            <SelectTrigger className="w-48 h-9 text-sm">
              <SelectValue placeholder="Action" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              {Object.entries(ACTION_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filter.period}
            onValueChange={(v) => setFilter((f) => ({ ...f, period: v }))}
          >
            <SelectTrigger className="w-40 h-9 text-sm">
              <CalendarDays className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
              <SelectValue placeholder="Period" />
            </SelectTrigger>
            <SelectContent>
              {PERIOD_PRESETS.map((p) => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

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
