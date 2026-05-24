'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Activity, RefreshCw, ExternalLink, Phone, CalendarDays, X } from 'lucide-react';
import api, { unwrap } from '@/lib/api';
import RoleGuard from '@/components/layout/RoleGuard';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

// Action metadata — label + accent color used to render the action badge.
// Anything not in this map renders as the raw action key in the default
// blue, so the table never breaks when a new action type is added.
const ACTION_META = {
  CHANGE_LEAD_STATUS: { label: 'Status changed', color: 'blue' },
  UPDATE:             { label: 'Lead edited',    color: 'blue' },
  ADD_NOTE:           { label: 'Note added',     color: 'emerald' },
  LOG_CALL:           { label: 'Call logged',    color: 'emerald' },
  LOG_ACTIVITY:       { label: 'Activity logged', color: 'emerald' },
  ASSIGN_LEAD:        { label: 'Reassigned',     color: 'amber' },
  REASSIGN_LEAD:      { label: 'Reassigned',     color: 'amber' },
  CREATE:             { label: 'Lead created',   color: 'emerald' },
  DELETE:             { label: 'Lead deleted',   color: 'red' },
};

const COLOR_MAP = {
  red:     'text-red-600 dark:text-red-400 bg-red-500/10 border-red-500/30',
  amber:   'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/30',
  blue:    'text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/30',
  emerald: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
};

export default function SalesActivityPage() {
  return (
    <RoleGuard allowedRoles={['super_admin', 'admin']}>
      <SalesActivityContent />
    </RoleGuard>
  );
}

function SalesActivityContent() {
  const sp = useSearchParams();
  const initialUserId = sp?.get('user') || '';
  const initialRole = sp?.get('role') || 'tele_sales';

  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [filter, setFilter] = useState({
    role: initialRole,
    user_id: initialUserId,
    action: '',
    date_from: '',
    date_to: '',
  });

  // Pull a roster of telesellers / seniors for the user-picker. Done once on
  // mount — the list rarely changes mid-session and refetching on every
  // filter tick would just be wasted traffic.
  useEffect(() => {
    (async () => {
      try {
        const [tsRes, srRes] = await Promise.all([
          api.get('/users', { params: { role: 'tele_sales', limit: 500 } }),
          api.get('/users', { params: { role: 'senior', limit: 200 } }).catch(() => null),
        ]);
        const flatten = (res) => {
          const p = unwrap(res);
          if (Array.isArray(p)) return p;
          return p?.data || p?.items || [];
        };
        const merged = [...flatten(tsRes), ...(srRes ? flatten(srRes) : [])]
          .filter((u) => u && (u.role === 'tele_sales' || u.role === 'senior'));
        setUsers(merged);
      } catch (e) {
        console.error('failed to fetch users for picker', e);
      }
    })();
  }, []);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter.role) params.append('role', filter.role);
      if (filter.user_id) params.append('user_id', filter.user_id);
      if (filter.action) params.append('action', filter.action);
      if (filter.date_from) params.append('date_from', filter.date_from);
      if (filter.date_to) params.append('date_to', filter.date_to);
      params.append('limit', '100');
      const res = await api.get(`/audit-logs/sales-activity?${params}`);
      const data = unwrap(res) || {};
      setLogs(data.items || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter.role, filter.user_id, filter.action, filter.date_from, filter.date_to]);

  // Group the picker list by role so the dropdown reads as
  // "Seniors / John / Jane … / Telesellers / Alice / Bob".
  const usersByRole = useMemo(() => {
    const seniors = users.filter((u) => u.role === 'senior')
      .sort((a, b) => (a.first_name || '').localeCompare(b.first_name || ''));
    const telesellers = users.filter((u) => u.role === 'tele_sales')
      .sort((a, b) => (a.first_name || '').localeCompare(b.first_name || ''));
    return { seniors, telesellers };
  }, [users]);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2 tracking-tight">
            <Activity className="h-5 w-5 text-emerald-500 dark:text-emerald-400" />
            Sales activity log
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Every lead edit, status change, note, and call logged by telesellers and seniors.
            Click any lead to open it.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadLogs}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
        </Button>
      </div>

      {/* Filters — single grouped bar, no per-control labels. Placeholders carry
          the meaning; the eye skims left-to-right and groups them as one block. */}
      <div className="rounded-xl border bg-card p-2.5 flex flex-wrap items-center gap-2">
        <Select
          value={filter.role}
          onValueChange={(v) => setFilter((f) => ({ ...f, role: v, user_id: '' }))}
        >
          <SelectTrigger className="w-36 h-9 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="tele_sales">Telesellers</SelectItem>
            <SelectItem value="senior">Seniors</SelectItem>
            <SelectItem value="tele_sales,senior">Both</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filter.user_id || 'all'}
          onValueChange={(v) => setFilter((f) => ({ ...f, user_id: v === 'all' ? '' : v }))}
        >
          <SelectTrigger className="w-52 h-9 text-sm"><SelectValue placeholder="All users" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All users</SelectItem>
            {usersByRole.seniors.length > 0 && (
              <div className="px-2 pt-2 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                Seniors
              </div>
            )}
            {usersByRole.seniors.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.first_name} {u.last_name}
              </SelectItem>
            ))}
            {usersByRole.telesellers.length > 0 && (
              <div className="px-2 pt-2 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                Telesellers
              </div>
            )}
            {usersByRole.telesellers.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.first_name} {u.last_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filter.action || 'all'}
          onValueChange={(v) => setFilter((f) => ({ ...f, action: v === 'all' ? '' : v }))}
        >
          <SelectTrigger className="w-44 h-9 text-sm"><SelectValue placeholder="All actions" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            {Object.entries(ACTION_META).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="inline-flex items-center h-9 rounded-md border bg-background overflow-hidden">
          <span className="px-2.5 inline-flex items-center text-[10px] uppercase tracking-wider text-muted-foreground border-r h-full">
            <CalendarDays className="h-3 w-3 mr-1" />
            Date
          </span>
          <input
            type="date"
            value={filter.date_from}
            onChange={(e) => setFilter((f) => ({ ...f, date_from: e.target.value }))}
            className="h-full px-2 text-xs bg-transparent focus:outline-none w-[128px]"
            aria-label="From"
          />
          <span className="text-muted-foreground text-xs px-0.5">–</span>
          <input
            type="date"
            value={filter.date_to}
            onChange={(e) => setFilter((f) => ({ ...f, date_to: e.target.value }))}
            className="h-full px-2 text-xs bg-transparent focus:outline-none w-[128px]"
            aria-label="To"
          />
        </div>

        {(filter.user_id || filter.action || filter.date_from || filter.date_to) && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-9 text-xs text-muted-foreground hover:text-red-600 dark:hover:text-red-400"
            onClick={() => setFilter({
              role: filter.role, user_id: '', action: '', date_from: '', date_to: '',
            })}
          >
            <X className="h-3.5 w-3.5 mr-1" /> Clear
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b">
                <th className="text-left p-3 font-medium text-muted-foreground">When</th>
                <th className="text-left p-3 font-medium text-muted-foreground">User</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Action</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Lead</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Details</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Loading…</td></tr>
              )}
              {!loading && logs.length === 0 && (
                <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No sales activity recorded</td></tr>
              )}
              {logs.map((log) => <ActivityRow key={log.id} log={log} />)}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function ActivityRow({ log }) {
  const meta = ACTION_META[log.action] || { label: log.action, color: 'blue' };
  const when = log.created_at || log.createdAt;

  return (
    <tr className="border-b last:border-0 hover:bg-muted/20 transition-colors">
      <td className="p-3 text-muted-foreground whitespace-nowrap">
        {when
          ? new Date(when).toLocaleString('en-IN', {
              day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
            })
          : '—'}
      </td>
      <td className="p-3">
        <p className="font-medium">{log.user_name || '—'}</p>
        <p className="text-muted-foreground text-[10px]">
          {log.user_email || ''}
          {log.user_role && (
            <span className="ml-1 text-[10px] capitalize">· {log.user_role.replace(/_/g, ' ')}</span>
          )}
        </p>
      </td>
      <td className="p-3">
        <Badge variant="outline" className={cn('text-[10px] border', COLOR_MAP[meta.color])}>
          {meta.label}
        </Badge>
      </td>
      <td className="p-3">
        {log.lead ? (
          <Link
            href={`/leads/${log.lead.id}`}
            className="inline-flex flex-col gap-0.5 group hover:text-blue-500 transition-colors"
            title="Open lead"
          >
            <span className="font-medium inline-flex items-center gap-1">
              {log.lead.name}
              <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              {log.lead.deleted && (
                <Badge variant="outline" className="text-[9px] ml-1 text-red-500 border-red-500/30">
                  deleted
                </Badge>
              )}
            </span>
            {log.lead.phone && (
              <span className="text-muted-foreground text-[10px] font-mono inline-flex items-center gap-1">
                <Phone className="h-2.5 w-2.5" /> {log.lead.phone}
              </span>
            )}
          </Link>
        ) : (
          <span className="text-muted-foreground text-[11px]">
            {log.resource}
            {log.resource_id && (
              <span className="font-mono ml-1">{String(log.resource_id).slice(0, 8)}…</span>
            )}
          </span>
        )}
      </td>
      <td className="p-3">{renderDetails(log)}</td>
    </tr>
  );
}

function renderDetails(log) {
  if (log.action === 'CHANGE_LEAD_STATUS') {
    return (
      <span className="text-xs flex items-center gap-1.5 flex-wrap">
        <Badge variant="outline" className="text-[10px]">
          {log.old_data?.lead_status || '—'}
        </Badge>
        <span>→</span>
        <Badge variant="outline" className="text-[10px] text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
          {log.new_data?.lead_status || '—'}
        </Badge>
      </span>
    );
  }
  if (log.action === 'ADD_NOTE') {
    const desc = log.new_data?.description || '';
    return (
      <span className="text-[11px] text-muted-foreground line-clamp-2 max-w-[320px] inline-block">
        {desc || '—'}
      </span>
    );
  }
  if (log.action === 'LOG_CALL') {
    const outcome = log.new_data?.call_outcome;
    const duration = log.new_data?.call_duration;
    return (
      <span className="text-[11px] text-muted-foreground inline-flex items-center gap-2">
        {outcome && (
          <Badge variant="outline" className="text-[10px]">{outcome}</Badge>
        )}
        {duration ? `${duration}s` : ''}
        {log.new_data?.description && (
          <span className="line-clamp-1 max-w-[200px]">{log.new_data.description}</span>
        )}
      </span>
    );
  }
  if (log.action === 'LOG_ACTIVITY') {
    return (
      <span className="text-[11px] text-muted-foreground inline-flex items-center gap-2">
        {log.new_data?.activity_type && (
          <Badge variant="outline" className="text-[10px]">{log.new_data.activity_type}</Badge>
        )}
        {log.new_data?.title || log.new_data?.description || ''}
      </span>
    );
  }
  if (log.action === 'UPDATE') {
    // For general UPDATEs we show which fields actually changed. Comparing
    // old vs. new at the field level keeps the cell readable; dumping the
    // full JSON blob (what admin-actions does) gets unreadable fast.
    const changed = diffFields(log.old_data, log.new_data);
    if (changed.length === 0) {
      return <span className="text-[11px] text-muted-foreground italic">no field changes</span>;
    }
    return (
      <span className="text-[11px] text-muted-foreground inline-flex flex-wrap gap-1 max-w-[360px]">
        {changed.slice(0, 5).map((f) => (
          <Badge key={f} variant="outline" className="text-[10px]">{f}</Badge>
        ))}
        {changed.length > 5 && (
          <span className="text-[10px]">+{changed.length - 5} more</span>
        )}
      </span>
    );
  }
  if (log.action === 'ASSIGN_LEAD' || log.action === 'REASSIGN_LEAD') {
    const to = log.new_data?.assigned_to_id;
    return (
      <span className="text-xs">
        Reassigned to{' '}
        <span className="font-mono text-muted-foreground">
          {to ? `${String(to).slice(0, 8)}…` : '—'}
        </span>
      </span>
    );
  }
  return null;
}

// Returns the keys whose value actually changed between old and new — used
// to summarize generic UPDATE rows. Skips timestamps and Sequelize internals
// that flap on every save and would otherwise dominate the badge list.
function diffFields(oldData, newData) {
  if (!oldData || !newData) return [];
  const SKIP = new Set([
    'updatedAt', 'updated_at', 'createdAt', 'created_at',
    'deletedAt', 'deleted_at', 'id',
  ]);
  const keys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);
  const changed = [];
  for (const k of keys) {
    if (SKIP.has(k)) continue;
    const a = JSON.stringify(oldData[k] ?? null);
    const b = JSON.stringify(newData[k] ?? null);
    if (a !== b) changed.push(k);
  }
  return changed;
}
