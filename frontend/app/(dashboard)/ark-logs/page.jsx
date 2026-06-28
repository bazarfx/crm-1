'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Webhook, RefreshCw, ShieldCheck, Zap, Search } from 'lucide-react';
import dayjs from 'dayjs';
import api, { unwrap } from '@/lib/api';
import RoleGuard from '@/components/layout/RoleGuard';
import EmptyState from '@/components/shared/EmptyState';
import DataTable from '@/components/shared/DataTable';
import FilterRail from '@/components/shared/FilterRail';
import { cn } from '@/lib/utils';

// Backend GET /webhooks/ark/logs (webhookController.listArkLogs) matches
// match_status / event_type by exact equality — NO comma-separated support — so
// both render as single-selects. The param NAMES sent here mirror the
// controller's `req.query.match_status` / `req.query.event_type` exactly.
const MATCH_STATUS_OPTIONS = [
  { value: 'matched', label: 'Matched' },
  { value: 'unmatched', label: 'Unmatched' },
  { value: 'error', label: 'Error' },
];

const EVENT_TYPE_OPTIONS = [
  { value: 'account_opened', label: 'Account Opened' },
  { value: 'ftd', label: 'FTD' },
  { value: 'activity', label: 'Activity' },
];

const PAGE_SIZE = 25;
const REFRESH_MS = 30000;

// Match-status pill colours mirror the status palette in CLAUDE.md.
const MATCH_STATUS_STYLE = {
  matched: 'badge-account_opened',
  unmatched: 'badge-cold',
  error: 'badge-dnd',
};

function MatchStatusBadge({ status }) {
  if (!status) return <span className="text-muted-foreground text-xs">—</span>;
  return (
    <span
      className={cn(
        'inline-flex items-center text-xs font-medium px-2.5 py-0.5 rounded-full capitalize',
        MATCH_STATUS_STYLE[status] || 'bg-muted text-muted-foreground',
      )}
    >
      {status}
    </span>
  );
}

export default function ArkLogsPage() {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({});
  // Single filters object + live-apply callback, mirroring leads/page.jsx.
  const applyFilters = useCallback((next) => { setFilters(next); setPage(1); }, []);

  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [err, setErr] = useState(null);

  const fetchLogs = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setErr(null);
    try {
      const params = {
        page,
        limit: PAGE_SIZE,
        // PRESERVE backend param names exactly — single string values.
        match_status: filters.match_status || undefined,
        event_type: filters.event_type || undefined,
      };
      const res = await api.get('/webhooks/ark/logs', { params });
      const payload = unwrap(res);
      const list = Array.isArray(payload) ? payload : (payload?.data || payload?.items || []);
      const pag = payload?.pagination || res?.data?.pagination || null;
      setRows(list);
      setTotal(pag?.total ?? list.length ?? 0);
    } catch (e) {
      setErr(e?.code === 'ERR_NETWORK' ? 'Backend not reachable on :5000' : 'Could not load webhook logs');
      setRows([]); setTotal(0);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [page, filters]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  // Auto-refresh every 30s — silent (no skeleton flash) so the live tail stays
  // smooth. Re-arms whenever the active query (page/filters) changes.
  useEffect(() => {
    const id = setInterval(() => { fetchLogs({ silent: true }); }, REFRESH_MS);
    return () => clearInterval(id);
  }, [fetchLogs]);

  const spec = useMemo(() => [
    {
      key: 'match_status', label: 'Match Status', kind: 'single', glyph: ShieldCheck,
      tint: 'bg-emerald-500/40', options: MATCH_STATUS_OPTIONS,
      allLabel: 'All statuses', capitalize: false,
    },
    {
      key: 'event_type', label: 'Event Type', kind: 'single', glyph: Zap,
      tint: 'bg-violet-500/40', options: EVENT_TYPE_OPTIONS,
      allLabel: 'All events', capitalize: false,
    },
  ], []);

  const columns = useMemo(() => [
    {
      accessorKey: 'received_at',
      header: 'Received',
      cell: ({ row }) => {
        const v = row.original.received_at || row.original.created_at;
        return <span className="mono text-xs text-muted-foreground">{v ? dayjs(v).format('DD MMM HH:mm') : '—'}</span>;
      },
    },
    {
      accessorKey: 'event_type',
      header: 'Event',
      cell: ({ getValue }) => {
        const v = getValue();
        if (!v) return <span className="text-muted-foreground text-xs">—</span>;
        return <span className="text-xs text-foreground capitalize">{String(v).replace(/_/g, ' ')}</span>;
      },
    },
    {
      accessorKey: 'ark_username',
      header: 'Username',
      cell: ({ getValue }) => <span className="mono text-xs text-muted-foreground">{getValue() || '—'}</span>,
    },
    {
      accessorKey: 'lead',
      header: 'Matched Lead',
      cell: ({ row }) => {
        const lead = row.original.lead;
        if (!lead) return <span className="text-muted-foreground text-xs">—</span>;
        const name = `${lead.first_name || ''} ${lead.last_name || ''}`.trim();
        return <span className="text-xs text-foreground">{name || lead.phone || '—'}</span>;
      },
    },
    {
      accessorKey: 'match_status',
      header: 'Status',
      cell: ({ getValue }) => <MatchStatusBadge status={getValue()} />,
    },
  ], []);

  // Search box filters the current page's rows client-side — the backend
  // logs endpoint has no `search` param, so we never send one. It matches over
  // username, event type, match status, and the matched lead's name/phone.
  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const lead = r.lead;
      const leadName = lead ? `${lead.first_name || ''} ${lead.last_name || ''} ${lead.phone || ''}` : '';
      return [r.ark_username, r.event_type, r.match_status, leadName]
        .some((v) => String(v || '').toLowerCase().includes(q));
    });
  }, [rows, search]);

  const hasActiveFilters = Object.values(filters).some((v) => Array.isArray(v) ? v.length : v);

  return (
    <RoleGuard allow={['super_admin', 'admin', 'floor_manager', 'back_office', 'auditor']}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">ARK Webhook Logs</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Incoming events from the ARK terminal. Auto-refresh 30s.
            </p>
          </div>
          <button
            type="button"
            onClick={() => fetchLogs()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border bg-card text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 disabled:opacity-50 transition-colors"
          >
            <RefreshCw size={14} className={cn(loading && 'animate-spin')} /> Refresh
          </button>
        </div>

        {/* Horizontal filter rail — Match Status + Event Type as inline
            popover-chips. Single-selects because the backend matches both by
            exact equality. Live-applies and resets to page 1 on change. */}
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <span className="mono tabular-nums font-medium text-foreground">
              {total.toLocaleString('en-IN')}
            </span>
            <span>{total === 1 ? 'log' : 'logs'}</span>
            {hasActiveFilters && (
              <span className="inline-flex items-center gap-1 ml-1 text-[10px] font-medium text-blue-600 dark:text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-full px-2 py-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                Filtered
              </span>
            )}
          </div>
          <div className="relative w-full max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by username, event, status…"
              className="w-full h-9 rounded-md border border-border bg-background pl-9 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 transition-shadow"
            />
          </div>
        </div>

        <FilterRail spec={spec} filters={filters} onChange={applyFilters} />

        {err && (
          <div className="card border-amber-200 bg-amber-50 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-200 text-amber-800 text-sm py-3">
            {err} — table will populate when API responds.
          </div>
        )}

        <DataTable
          columns={columns}
          data={visibleRows}
          loading={loading}
          total={total}
          page={page}
          limit={PAGE_SIZE}
          onPageChange={setPage}
          searchable={false}
          emptyState={
            <EmptyState
              icon={Webhook}
              title="No webhook logs"
              message="ARK terminal events appear here as they arrive. Adjust filters if you expected results."
            />
          }
        />
      </div>
    </RoleGuard>
  );
}
