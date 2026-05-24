'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Eye, RefreshCw, X } from 'lucide-react';
import api, { unwrap } from '@/lib/api';
import RoleGuard from '@/components/layout/RoleGuard';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

const ACTION_LABELS = {
  ASSIGN_LEAD:              { label: 'Lead reassigned',       color: 'amber' },
  REASSIGN_LEAD:            { label: 'Lead reassigned',       color: 'amber' },
  CHANGE_LEAD_STATUS:       { label: 'Status changed',         color: 'blue' },
  DEACTIVATE_USER:          { label: 'User deactivated',       color: 'red' },
  ACTIVATE_USER:            { label: 'User activated',         color: 'emerald' },
  RESET_PASSWORD:           { label: 'Password reset',         color: 'amber' },
  CREATE:                   { label: 'Created',                color: 'emerald' },
  UPDATE:                   { label: 'Updated',                color: 'blue' },
  SOFT_DELETE:              { label: 'Deleted (soft)',         color: 'red' },
  RESTORE:                  { label: 'Restored',               color: 'emerald' },
  UPDATE_PERMISSION:        { label: 'Permission updated',     color: 'blue' },
  BULK_UPDATE_PERMISSIONS:  { label: 'Permissions bulk-updated', color: 'blue' },
  COPY_ROLE_PERMISSIONS:    { label: 'Permissions copied',     color: 'blue' },
  RESET_PERMISSIONS:        { label: 'Permissions reset',      color: 'amber' },
  DISABLE_CATEGORY:         { label: 'Category disabled',      color: 'red' },
  IMPERSONATE:              { label: 'Impersonated',           color: 'amber' },
};

const COLOR_MAP = {
  red:     'text-red-600 dark:text-red-400 bg-red-500/10 border-red-500/30',
  amber:   'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/30',
  blue:    'text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/30',
  emerald: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
};

export default function AdminActionsPage() {
  return (
    <RoleGuard allowedRoles={['super_admin']}>
      <AdminActionsContent />
    </RoleGuard>
  );
}

function AdminActionsContent() {
  const sp = useSearchParams();
  const initialUserId = sp?.get('user') || '';
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({
    resource: '',
    action: '',
    admin_id: initialUserId,
  });

  const loadLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter.resource) params.append('resource', filter.resource);
      if (filter.action) params.append('action', filter.action);
      if (filter.admin_id) params.append('admin_id', filter.admin_id);
      params.append('limit', '100');
      const res = await api.get(`/audit-logs/admin-actions?${params}`);
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
  }, [filter.resource, filter.action, filter.admin_id]);

  const renderDiff = (log) => {
    if (log.action === 'ASSIGN_LEAD' || log.action === 'REASSIGN_LEAD') {
      const newAssignee =
        log.new_data?.assigned_to_id || log.new_data?.lead_owner_id;
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
          <Badge variant="outline" className="text-[10px]">
            {log.old_data?.lead_status || '—'}
          </Badge>
          <span>→</span>
          <Badge
            variant="outline"
            className="text-[10px] text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
          >
            {log.new_data?.lead_status || '—'}
          </Badge>
        </span>
      );
    }
    if (log.action === 'UPDATE_PERMISSION') {
      return (
        <span className="text-xs flex items-center gap-1.5 flex-wrap">
          <code className="text-[10px] font-mono text-muted-foreground">
            {log.new_data?.role}.{log.new_data?.permission_key}
          </code>
          <Badge variant="outline" className="text-[10px]">
            {log.old_data?.level || '—'}
          </Badge>
          <span>→</span>
          <Badge
            variant="outline"
            className="text-[10px] text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
          >
            {log.new_data?.level || '—'}
          </Badge>
        </span>
      );
    }
    if (log.old_data || log.new_data) {
      const blob = JSON.stringify(log.new_data || log.old_data || {});
      return (
        <span className="text-[11px] text-muted-foreground font-mono truncate max-w-[300px] inline-block">
          {blob.slice(0, 80)}
          {blob.length > 80 ? '…' : ''}
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
            <Eye className="h-5 w-5 text-purple-500 dark:text-purple-400" />
            Admin actions log
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Monitor all changes made by admin users — leads, users, settings, permissions
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadLogs}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
        </Button>
      </div>

      {/* Filters — grouped row matching the rest of the app: equal-height
          pickers in a single bordered bar, clear action right-anchored. */}
      <div className="rounded-xl border bg-card p-2.5 flex flex-wrap items-center gap-2">
        <Select
          value={filter.resource || 'all'}
          onValueChange={(v) => setFilter({ ...filter, resource: v === 'all' ? '' : v })}
        >
          <SelectTrigger className="w-44 h-9 text-sm">
            <SelectValue placeholder="All resources" />
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
          onValueChange={(v) => setFilter({ ...filter, action: v === 'all' ? '' : v })}
        >
          <SelectTrigger className="w-52 h-9 text-sm">
            <SelectValue placeholder="All actions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            {Object.entries(ACTION_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {filter.admin_id && (
          <div className="ml-auto inline-flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Focused on user
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-9 text-xs text-muted-foreground hover:text-red-600 dark:hover:text-red-400"
              onClick={() => setFilter({ ...filter, admin_id: '' })}
            >
              <X className="h-3.5 w-3.5 mr-1" /> Clear
            </Button>
          </div>
        )}
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b">
                <th className="text-left p-3 font-medium text-muted-foreground">When</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Admin</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Action</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Resource</th>
                <th className="text-left p-3 font-medium text-muted-foreground">Details</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Loading…</td></tr>
              )}
              {!loading && logs.length === 0 && (
                <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No admin actions yet</td></tr>
              )}
              {logs.map((log) => {
                const meta = ACTION_LABELS[log.action] || { label: log.action, color: 'blue' };
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
                      <p className="font-medium">{log.admin_name || '—'}</p>
                      <p className="text-muted-foreground text-[10px]">{log.admin_email || ''}</p>
                    </td>
                    <td className="p-3">
                      <Badge variant="outline" className={cn('text-[10px] border', COLOR_MAP[meta.color])}>
                        {meta.label}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <Badge variant="secondary" className="text-[10px]">{log.resource}</Badge>
                      {log.resource_id && (
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
