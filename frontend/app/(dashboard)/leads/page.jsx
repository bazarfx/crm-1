'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Download, Filter, Phone, Mail, Copy, CheckCircle2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import api, { unwrap } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { useStore } from '@/store/useStore';
import DataTable from '@/components/shared/DataTable';
import StatusBadge from '@/components/shared/StatusBadge';
import FilterDrawer from '@/components/leads/FilterDrawer';
import LeadForm from '@/components/leads/LeadForm';
import { Button } from '@/components/ui/button';
import { inrFormat } from '@/lib/charts';
import { cn } from '@/lib/utils';
import { LanguageBadge, LanguageList } from '@/components/shared/LanguageBadge';
import { labelFor } from '@/lib/languages';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

// Status slug → status dot color for the inactive chip state. Mirrors the
// status palette in CLAUDE.md so chips look right even before the user picks
// one. (Active chips inherit color via the badge-* class.)
const STATUS_DOT_COLOR = {
  new: '#6366F1',
  contacted: '#3B82F6',
  interested: '#8B5CF6',
  not_interested: '#EF4444',
  call_back: '#F59E0B',
  account_opened: '#14B8A6',
  ftd_done: '#10B981',
  cold: '#6B7280',
  dnd: '#DC2626',
  inactive: '#9CA3AF',
  reactive: '#F97316',
};

const FALLBACK_STATUSES = [
  { value: 'new',            label: 'New' },
  { value: 'contacted',      label: 'Contacted' },
  { value: 'interested',     label: 'Interested' },
  { value: 'not_interested', label: 'Not Interested' },
  { value: 'call_back',      label: 'Call Back' },
  { value: 'account_opened', label: 'Account Opened' },
  { value: 'ftd_done',       label: 'FTD Done' },
  { value: 'cold',           label: 'Cold' },
  { value: 'dnd',            label: 'DND' },
  { value: 'inactive',       label: 'Inactive' },
  { value: 'reactive',       label: 'Reactive' },
];

function LeadStatusDropdown({ lead, statuses, onChange }) {
  const [updating, setUpdating] = useState(false);
  const current = lead.status || lead.lead_status || 'new';

  const handle = async (next) => {
    if (next === current) return;
    setUpdating(true);
    try {
      await api.patch(`/leads/${lead.id}/status`, { lead_status: next });
      toast.success('Status updated');
      onChange();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed');
    } finally {
      setUpdating(false);
    }
  };

  return (
    <Select value={current} onValueChange={handle} disabled={updating}>
      <SelectTrigger
        className="h-7 text-[10px] w-36 border-0 bg-transparent p-1 hover:bg-muted/40 [&>svg]:opacity-50"
        onClick={(e) => e.stopPropagation()}
      >
        <StatusBadge status={current} />
      </SelectTrigger>
      <SelectContent onClick={(e) => e.stopPropagation()}>
        {statuses.map((s) => (
          <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function LeadAssignmentDropdown({ lead, telesellers, onChange, showOverflow }) {
  const [updating, setUpdating] = useState(false);
  const current = lead.assigned_to_id || lead.assignedTo?.id || '';

  const handle = async (next) => {
    if (!next || next === current) return;
    setUpdating(true);
    try {
      await api.patch(`/leads/${lead.id}/assign`, { new_assignee_id: next });
      toast.success('Lead reassigned');
      onChange();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed');
    } finally {
      setUpdating(false);
    }
  };

  const matched = telesellers.find((t) => t.id === current);
  const assignee = matched || lead.assignedTo || null;
  const assigneeName = assignee
    ? `${assignee.first_name || ''} ${assignee.last_name || ''}`.trim() || '—'
    : '—';
  const assigneeLang = assignee?.primary_language;

  // "Overflow" indicator — visible to admins. The assignee's primary differs
  // from the lead's language but the lead's language IS in their additional
  // list, meaning RR routed via the overflow path rather than direct.
  const isOverflow = Boolean(
    showOverflow
    && assignee
    && lead.language
    && assigneeLang
    && assigneeLang !== lead.language
    && (assignee.additional_languages || []).includes(lead.language)
  );

  return (
    <Select value={current || ''} onValueChange={handle} disabled={updating}>
      <SelectTrigger
        className="h-7 text-xs border-0 bg-transparent p-1 hover:bg-muted/40 w-52 [&>svg]:opacity-50"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="inline-flex items-center gap-1.5 truncate min-w-0">
          <span className="truncate">{assigneeName}</span>
          {assigneeLang && <LanguageBadge language={assigneeLang} size="xs" />}
          {isOverflow && (
            <span
              className="text-[9px] text-amber-600 dark:text-amber-400"
              title="Assignee's primary language differs from this lead — they took it as overflow."
            >
              overflow
            </span>
          )}
        </span>
      </SelectTrigger>
      <SelectContent onClick={(e) => e.stopPropagation()}>
        {telesellers.length === 0 ? (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">No assignees loaded</div>
        ) : (
          telesellers.map((t) => (
            <SelectItem key={t.id} value={t.id}>
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="truncate">{t.first_name} {t.last_name}</span>
                {t.role === 'senior' && (
                  <span className="text-muted-foreground text-[10px]">(SR)</span>
                )}
                {t.primary_language && <LanguageBadge language={t.primary_language} size="xs" />}
                {t.additional_languages?.length > 0 && (
                  <span className="text-muted-foreground text-[9px]">
                    +{t.additional_languages.map(labelFor).join(', ')}
                  </span>
                )}
              </div>
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  );
}

dayjs.extend(relativeTime);

const initialAvatar = (name) => {
  const t = (name || '').trim().split(/\s+/);
  return ((t[0]?.[0] || '?') + (t[1]?.[0] || '')).toUpperCase();
};

export default function LeadsPage() {
  const router = useRouter();
  const { isReadOnly, can, role } = useAuth();
  const hasPermission = useStore((s) => s.hasPermission);
  const config = useStore((s) => s.config);
  // BRUTE-FORCE OVERRIDE: admin / super_admin always allowed — never gated
  // by the async permission matrix.
  const isAdminRole = role === 'admin' || role === 'super_admin';
  const canCreate = isAdminRole || can('floor_manager');
  const isTele = can('tele_sales');
  // tele_sales / senior can always change status on leads visible to them —
  // the leads list is already scoped to their own assignments server-side
  // (buildScope in leadController), and the status endpoint re-verifies
  // ownership via canAlwaysEdit. Don't gate this on dynamic perms loading.
  const canChangeStatus = isAdminRole
    || can('floor_manager')
    || can('tele_sales')
    || can('senior')
    || hasPermission('leads.change_status');
  const canReassign = isAdminRole || hasPermission('leads.reassign') || can('floor_manager');

  const [page, setPage] = useState(1);
  const [limit] = useState(25);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({});
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [campaigns, setCampaigns] = useState([]);
  const [telesellers, setTelesellers] = useState([]);
  const [err, setErr] = useState(null);
  // Per-status counts for the quick-filter chip strip. Fetched alongside the
  // initial render (and refreshed when filters change so the count reflects
  // the active scope minus the status filter itself). Keyed by status slug.
  const [statusCounts, setStatusCounts] = useState({});

  // Pull the live status list out of config if it's been hydrated, otherwise
  // fall back to the canonical list so the dropdown always has options.
  const statuses = useMemo(() => {
    const fromConfig = Array.isArray(config?.lead_status)
      ? config.lead_status.map((r) => ({ value: r.key, label: r.label || r.key }))
      : null;
    return fromConfig?.length ? fromConfig : FALLBACK_STATUSES;
  }, [config]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const params = {
        page, limit,
        search: search || undefined,
        status: filters.status?.length ? filters.status.join(',') : undefined,
        language: filters.language?.length ? filters.language.join(',') : undefined,
        // Backend reads `lead_source` (with `source` as a legacy alias) — send
        // the canonical name so the filter actually narrows the query.
        lead_source: filters.source?.length ? filters.source.join(',') : undefined,
        campaign_id: filters.campaign || undefined,
        date_from: filters.date_from || undefined,
        date_to: filters.date_to || undefined,
        has_ark: filters.has_ark || undefined,
        has_ftd: filters.has_ftd || undefined,
      };
      const res = await api.get('/leads', { params });
      const payload = unwrap(res);
      const list = Array.isArray(payload) ? payload : (payload?.items || payload?.data || []);
      const pag = payload?.pagination || res?.data?.pagination || null;
      setRows(list);
      setTotal(pag?.total ?? list.length ?? 0);
    } catch (e) {
      setErr(e?.code === 'ERR_NETWORK' ? 'Backend not reachable on :5000' : 'Could not load leads');
      setRows([]); setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, filters]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Fetch the pipeline summary so the status chip strip can show live counts.
  // Non-blocking and silently degrades if /reports is not accessible (e.g. for
  // tele_sales / archive roles) — chips then render without counts.
  useEffect(() => {
    let alive = true;
    api.get('/reports/dashboard-summary')
      .then((res) => {
        if (!alive) return;
        const pipeline = unwrap(res)?.pipeline || [];
        const map = {};
        pipeline.forEach((p) => {
          if (p?.status) map[p.status] = Number(p.count) || 0;
        });
        setStatusCounts(map);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/campaigns', { params: { limit: 100 } });
        setCampaigns(unwrap(res)?.data || unwrap(res) || []);
      } catch { /* silent */ }
    })();
  }, []);

  // Assignees list — used by the inline reassign dropdown. Includes telesellers
  // AND seniors because direct_ark leads must be routed to seniors. Fetched in
  // two passes so we don't have to rely on a role-filter shape on the backend.
  useEffect(() => {
    if (!canReassign) return;
    (async () => {
      try {
        const [teleRes, srRes] = await Promise.all([
          api.get('/users', { params: { role: 'tele_sales', limit: 200 } }),
          api.get('/users', { params: { role: 'senior', limit: 200 } }).catch(() => null),
        ]);
        const teleList = (() => {
          const p = unwrap(teleRes);
          return Array.isArray(p) ? p : (p?.data || []);
        })();
        const srList = srRes
          ? (() => {
              const p = unwrap(srRes);
              return Array.isArray(p) ? p : (p?.data || []);
            })()
          : [];
        const merged = [...teleList, ...srList].filter(
          (u) => u && (u.role === 'tele_sales' || u.role === 'senior' || !u.role)
        );
        if (merged.length === 0) {
          console.warn('[leads] assignee fetch returned 0 users');
        }
        setTelesellers(merged);
      } catch (e) {
        console.error('[leads] failed to fetch assignees', e);
        toast.error('Could not load assignees list');
      }
    })();
  }, [canReassign]);

  const exportCsv = async () => {
    try {
      const res = await api.get('/leads/export', { responseType: 'blob', params: { search } });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `leads-${dayjs().format('YYYY-MM-DD')}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      toast.success('CSV downloaded');
    } catch {
      toast.error('Export unavailable');
    }
  };

  const copyPhone = (phone) => {
    if (!phone) return;
    navigator.clipboard?.writeText(phone);
    toast.success(`Copied ${phone}`);
  };

  const columns = useMemo(() => {
    const base = [
      {
        accessorKey: 'name',
        header: 'Name',
        cell: ({ row }) => {
          const r = row.original;
          const name = r.name || `${r.first_name || ''} ${r.last_name || ''}`.trim() || '—';
          // Avatar uses the neutral muted surface in light mode / muted-foreground
          // tint in dark mode. The previous HSL-from-name hash produced 360
          // pastel circles that read as AI-generated stock template.
          return (
            <div className="flex items-center gap-2.5 min-w-[160px]">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 bg-muted text-muted-foreground">
                {initialAvatar(name)}
              </div>
              <span className="font-medium text-foreground truncate">{name}</span>
            </div>
          );
        },
      },
      {
        accessorKey: 'phone',
        header: 'Phone',
        cell: ({ row }) => {
          const p = row.original.phone;
          if (!p) return <span className="text-muted-foreground text-xs">—</span>;
          return (
            <button
              onClick={(e) => { e.stopPropagation(); copyPhone(p); }}
              className="mono text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 group"
              title="Copy"
            >
              {p}
              <Copy size={11} className="opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          );
        },
      },
      { accessorKey: 'language', header: 'Lang',
        cell: ({ getValue }) => {
          const v = getValue();
          if (!v) return <span className="text-muted-foreground text-xs">—</span>;
          return (
            <span className="text-xs text-muted-foreground capitalize">{v}</span>
          );
        },
      },
      { accessorKey: 'status', header: 'Status',
        cell: ({ row }) => canChangeStatus
          ? <LeadStatusDropdown lead={row.original} statuses={statuses} onChange={fetchData} />
          : <StatusBadge status={row.original.status || row.original.lead_status} color={row.original.status_color} /> },
      { accessorKey: 'source', header: 'Source',
        cell: ({ getValue }) => {
          const v = getValue();
          if (!v) return <span className="text-muted-foreground text-xs">—</span>;
          return (
            <span className="text-xs text-muted-foreground capitalize">{String(v).replace(/_/g, ' ')}</span>
          );
        },
      },
      { accessorKey: 'campaign',
        header: 'Campaign',
        cell: ({ row }) => {
          const v = row.original.campaign_name || row.original.campaign || '';
          if (!v) return <span className="text-muted-foreground text-xs">—</span>;
          return (
            <span className="text-xs text-muted-foreground truncate inline-block max-w-[180px]" title={v}>
              {v.length > 22 ? `${v.slice(0, 22)}…` : v}
            </span>
          );
        },
      },
    ];

    if (!isTele) {
      base.push({
        accessorKey: 'assignedTo',
        header: 'Assigned to',
        cell: ({ row }) => {
          // BRUTE-FORCE OVERRIDE: show the assignment dropdown whenever the
          // caller can reassign, even if the assignees list is still loading
          // or came back empty — falling through to plain text was hiding the
          // edit affordance entirely for admins.
          if (canReassign) {
            return (
              <LeadAssignmentDropdown
                lead={row.original}
                telesellers={telesellers}
                onChange={fetchData}
                showOverflow={isAdminRole}
              />
            );
          }
          const a = row.original.assignedTo;
          const name = a ? `${a.first_name || ''} ${a.last_name || ''}`.trim() : '';
          const lang = a?.primary_language;
          if (!a) return <span className="text-xs text-muted-foreground">—</span>;
          return (
            <span className="inline-flex items-center gap-1.5 text-xs">
              <span className="text-muted-foreground">{name || '—'}</span>
              {lang && <LanguageBadge language={lang} size="xs" />}
            </span>
          );
        },
      });
    }

    base.push(
      {
        accessorKey: 'last_contact_at',
        header: 'Last Contact',
        cell: ({ getValue }) => {
          const v = getValue();
          return <span className="mono text-xs text-muted-foreground">{v ? dayjs(v).fromNow() : '—'}</span>;
        },
      },
      {
        accessorKey: 'has_ark',
        header: 'ARK',
        cell: ({ row }) => row.original.ark_account_number || row.original.has_ark
          ? <CheckCircle2 size={16} className="text-teal-500" />
          : <span className="text-muted-foreground text-xs">—</span>,
      },
      {
        accessorKey: 'ftd_amount',
        header: 'FTD',
        cell: ({ row }) => {
          const amt = row.original.ftd_amount;
          if (!row.original.ftd_at && !amt) return <span className="text-muted-foreground text-xs">—</span>;
          return <span className="mono text-xs font-medium text-emerald-600 dark:text-emerald-400">₹{inrFormat(amt || 0)}</span>;
        },
      },
      {
        accessorKey: 'created_at',
        header: 'Created',
        cell: ({ getValue }) => <span className="mono text-xs text-muted-foreground">{getValue() ? dayjs(getValue()).format('DD MMM') : '—'}</span>,
      }
    );

    return base;
  }, [isTele, canChangeStatus, canReassign, statuses, telesellers, fetchData]);

  // Action-bar level layout: topbar already shows the page title + subtitle,
  // so we don't repeat the "Leads" h2 here. Instead we lead with the row
  // count chip (the question users actually have when they land) and right-
  // align the actions in a tighter cluster.
  const hasActiveFilters = Object.values(filters).some((v) => Array.isArray(v) ? v.length : v);

  // Status chip strip — quick-filter shortcuts. The "All" chip clears the
  // status filter only, leaving other filters intact (language, campaign…).
  const activeStatuses = filters.status || [];
  const QUICK_STATUSES = useMemo(() => {
    // Pull the canonical ordering from config if available, otherwise fall
    // back to the FALLBACK_STATUSES we already keep at the top of the file.
    const base = statuses.slice(0, 8); // first 8 are the high-traffic ones
    return base;
  }, [statuses]);

  const toggleStatusChip = (slug) => {
    setFilters((prev) => {
      const cur = prev.status || [];
      const next = cur.includes(slug) ? cur.filter((s) => s !== slug) : [...cur, slug];
      return { ...prev, status: next };
    });
    setPage(1);
  };
  const clearStatusFilter = () => {
    setFilters((prev) => ({ ...prev, status: [] }));
    setPage(1);
  };
  const clearAllFilters = () => {
    setFilters({});
    setPage(1);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
          <span className="mono tabular-nums font-medium text-foreground">
            {total.toLocaleString('en-IN')}
          </span>
          <span>{total === 1 ? 'lead' : 'leads'}</span>
          {hasActiveFilters && (
            <span className="inline-flex items-center gap-1 ml-1 text-[10px] font-medium text-blue-600 dark:text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-full px-2 py-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
              Filtered
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setDrawerOpen(true)}>
            <Filter size={14} /> Filters
            {hasActiveFilters && (
              <span className="ml-1 w-1.5 h-1.5 rounded-full bg-primary" />
            )}
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download size={14} /> Export CSV
          </Button>
          {canCreate && !isReadOnly && (
            <Button size="sm" onClick={() => setFormOpen(true)}>
              <Plus size={14} /> Add Lead
            </Button>
          )}
        </div>
      </div>

      {/* Status quick-filter chip strip. Clicking a chip toggles that status
          on the current filter set without opening the drawer — the single
          most common filtering action on this page. Counts are surfaced when
          /reports/dashboard-summary is reachable. */}
      <div className="rounded-xl border bg-card overflow-x-auto">
        <div className="flex items-center gap-1 p-1.5 min-w-max">
          <button
            type="button"
            onClick={clearStatusFilter}
            className={cn(
              'inline-flex items-center gap-2 h-7 px-3 rounded-md text-xs font-medium transition-colors whitespace-nowrap',
              activeStatuses.length === 0
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
            )}
          >
            All
            <span className="font-mono tabular-nums text-[10px] opacity-70">
              {Object.values(statusCounts).reduce((a, b) => a + b, 0).toLocaleString('en-IN') || '—'}
            </span>
          </button>
          <span className="h-5 w-px bg-border mx-1 shrink-0" aria-hidden />
          {QUICK_STATUSES.map((s) => {
            const active = activeStatuses.includes(s.value);
            const count = statusCounts[s.value];
            return (
              <button
                key={s.value}
                type="button"
                onClick={() => toggleStatusChip(s.value)}
                className={cn(
                  'inline-flex items-center gap-2 h-7 px-3 rounded-md text-xs font-medium transition-all whitespace-nowrap',
                  'border',
                  active
                    ? `badge-${s.value} border-current/30`
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/60'
                )}
              >
                <span
                  className={cn(
                    'w-1.5 h-1.5 rounded-full',
                    active ? 'bg-current' : `bg-current opacity-40`
                  )}
                  style={!active ? { color: STATUS_DOT_COLOR[s.value] || '#94A3B8' } : undefined}
                />
                {s.label}
                {count !== undefined && (
                  <span className="font-mono tabular-nums text-[10px] opacity-70">
                    {count.toLocaleString('en-IN')}
                  </span>
                )}
              </button>
            );
          })}
          {hasActiveFilters && (
            <>
              <span className="h-5 w-px bg-border mx-1 shrink-0" aria-hidden />
              <button
                type="button"
                onClick={clearAllFilters}
                className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-xs text-muted-foreground hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/10 transition-colors whitespace-nowrap"
              >
                <X size={12} /> Clear all
              </button>
            </>
          )}
        </div>
      </div>

      {err && (
        <div className="card border-amber-200 bg-amber-50 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-200 text-amber-800 text-sm py-3">
          {err} — table will populate when API responds.
        </div>
      )}

      <DataTable
        columns={columns}
        data={rows}
        loading={loading}
        total={total}
        page={page}
        limit={limit}
        onPageChange={setPage}
        onSearch={(q) => { setSearch(q); setPage(1); }}
        searchPlaceholder="Search by name, phone, campaign…"
        onRowClick={(r) => router.push(`/leads/${r.id}`)}
      />

      <FilterDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        value={filters}
        onApply={(f) => { setFilters(f); setPage(1); }}
        campaigns={campaigns}
      />

      <LeadForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={() => { setFormOpen(false); fetchData(); }}
      />
    </div>
  );
}
