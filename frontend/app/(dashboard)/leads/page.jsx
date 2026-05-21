'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Download, Filter, Phone, Mail, Copy, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import api, { unwrap } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import DataTable from '@/components/shared/DataTable';
import StatusBadge from '@/components/shared/StatusBadge';
import FilterDrawer from '@/components/leads/FilterDrawer';
import LeadForm from '@/components/leads/LeadForm';
import { inrFormat } from '@/lib/charts';

dayjs.extend(relativeTime);

const initialAvatar = (name) => {
  const t = (name || '').trim().split(/\s+/);
  return ((t[0]?.[0] || '?') + (t[1]?.[0] || '')).toUpperCase();
};

const colorFromName = (name) => {
  const hue = (name || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return `hsl(${hue} 70% 92%)`;
};

const colorTextFromName = (name) => {
  const hue = (name || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return `hsl(${hue} 60% 35%)`;
};

export default function LeadsPage() {
  const router = useRouter();
  const { isReadOnly, can } = useAuth();
  const canCreate = can('super_admin', 'admin', 'floor_manager');
  const isTele = can('tele_sales');

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
  const [err, setErr] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const params = {
        page, limit,
        search: search || undefined,
        status: filters.status?.length ? filters.status.join(',') : undefined,
        language: filters.language?.length ? filters.language.join(',') : undefined,
        source: filters.source?.length ? filters.source.join(',') : undefined,
        campaign_id: filters.campaign || undefined,
        date_from: filters.date_from || undefined,
        date_to: filters.date_to || undefined,
        has_ark: filters.has_ark || undefined,
        has_ftd: filters.has_ftd || undefined,
      };
      const res = await api.get('/leads', { params });
      const body = res?.data || {};
      setRows(body.data || []);
      setTotal(body.pagination?.total || body.data?.length || 0);
    } catch (e) {
      setErr(e?.code === 'ERR_NETWORK' ? 'Backend not reachable on :5000' : 'Could not load leads');
      setRows([]); setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, filters]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/campaigns', { params: { limit: 100 } });
        setCampaigns(unwrap(res)?.data || unwrap(res) || []);
      } catch { /* silent */ }
    })();
  }, []);

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
          return (
            <div className="flex items-center gap-2.5 min-w-[160px]">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0"
                style={{ background: colorFromName(name), color: colorTextFromName(name) }}
              >
                {initialAvatar(name)}
              </div>
              <span className="font-medium text-ink-primary truncate">{name}</span>
            </div>
          );
        },
      },
      {
        accessorKey: 'phone',
        header: 'Phone',
        cell: ({ row }) => {
          const p = row.original.phone;
          if (!p) return <span className="text-ink-muted text-xs">—</span>;
          return (
            <button
              onClick={(e) => { e.stopPropagation(); copyPhone(p); }}
              className="mono text-xs text-ink-secondary hover:text-accent inline-flex items-center gap-1.5 group"
              title="Copy"
            >
              {p}
              <Copy size={11} className="opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          );
        },
      },
      { accessorKey: 'language', header: 'Lang',
        cell: ({ getValue }) => <span className="badge bg-slate-100 text-slate-700">{getValue() || '—'}</span> },
      { accessorKey: 'status', header: 'Status',
        cell: ({ row }) => <StatusBadge status={row.original.status || row.original.lead_status} color={row.original.status_color} /> },
      { accessorKey: 'source', header: 'Source',
        cell: ({ getValue }) => <span className="text-xs text-ink-secondary">{getValue() || '—'}</span> },
      { accessorKey: 'campaign',
        header: 'Campaign',
        cell: ({ row }) => {
          const v = row.original.campaign_name || row.original.campaign || '';
          return <span className="text-xs text-ink-secondary truncate inline-block max-w-[180px]" title={v}>{v.length > 20 ? `${v.slice(0, 20)}…` : v || '—'}</span>;
        },
      },
    ];

    if (!isTele) {
      base.push({
        accessorKey: 'owner',
        header: 'Owner',
        cell: ({ row }) => {
          const o = row.original.owner_name || row.original.owner?.name || row.original.lead_owner?.name;
          return <span className="text-xs text-ink-secondary">{o || '—'}</span>;
        },
      });
    }

    base.push(
      {
        accessorKey: 'last_contact_at',
        header: 'Last Contact',
        cell: ({ getValue }) => {
          const v = getValue();
          return <span className="mono text-xs text-ink-muted">{v ? dayjs(v).fromNow() : '—'}</span>;
        },
      },
      {
        accessorKey: 'has_ark',
        header: 'ARK',
        cell: ({ row }) => row.original.ark_account_number || row.original.has_ark
          ? <CheckCircle2 size={16} className="text-teal-500" />
          : <span className="text-ink-muted text-xs">—</span>,
      },
      {
        accessorKey: 'ftd_amount',
        header: 'FTD',
        cell: ({ row }) => {
          const amt = row.original.ftd_amount;
          if (!row.original.ftd_at && !amt) return <span className="text-ink-muted text-xs">—</span>;
          return <span className="mono text-xs font-medium text-emerald-700">₹{inrFormat(amt || 0)}</span>;
        },
      },
      {
        accessorKey: 'created_at',
        header: 'Created',
        cell: ({ getValue }) => <span className="mono text-xs text-ink-muted">{getValue() ? dayjs(getValue()).format('DD MMM') : '—'}</span>,
      }
    );

    return base;
  }, [isTele]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-ink-primary">Leads</h2>
          <span className="badge bg-slate-100 text-ink-primary mono tabular-nums">{total}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-ghost text-sm" onClick={() => setDrawerOpen(true)}>
            <Filter size={14} /> Filters
            {Object.values(filters).some((v) => Array.isArray(v) ? v.length : v) && (
              <span className="ml-1 w-1.5 h-1.5 rounded-full bg-accent" />
            )}
          </button>
          <button className="btn-ghost text-sm" onClick={exportCsv}>
            <Download size={14} /> Export CSV
          </button>
          {canCreate && !isReadOnly && (
            <button className="btn-primary text-sm" onClick={() => setFormOpen(true)}>
              <Plus size={14} /> Add Lead
            </button>
          )}
        </div>
      </div>

      {err && (
        <div className="card border-amber-200 bg-amber-50 text-amber-800 text-sm py-3">
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
