'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Award, ArrowRight, Phone, TrendingUp, Wallet, CalendarDays, Activity, X,
  Radio, Languages, Megaphone, UsersRound, UserCheck, UserRound,
} from 'lucide-react';
import dayjs from 'dayjs';
import api, { unwrap } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { useStore } from '@/store/useStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { DynamicFilterBar } from '@/components/dynamic/DynamicFilterBar';
import FilterRail from '@/components/shared/FilterRail';
import { useDynamicColumns } from '@/components/dynamic/DynamicColumns';
import { DynamicCell } from '@/components/dynamic/DynamicCell';
import { ManageFieldsButton } from '@/components/dynamic/EditableForm';

const SOURCE_LABEL = {
  facebook_ads:   'Facebook Ads',
  instagram_ads:  'Instagram Ads',
  google_ads:     'Google Ads',
  direct_ark:     'Direct ARK',
  manual:         'Manual',
  referral:       'Referral',
};

const LANGUAGE_FALLBACK = [
  { value: 'english',  label: 'English'  },
  { value: 'hindi',    label: 'Hindi'    },
  { value: 'tamil',    label: 'Tamil'    },
  { value: 'telugu',   label: 'Telugu'   },
  { value: 'kannada',  label: 'Kannada'  },
  { value: 'marathi',  label: 'Marathi'  },
  { value: 'gujarati', label: 'Gujarati' },
];

const fmtMoney = (n) =>
  '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });

const fmtCompact = (n) => {
  const v = Number(n || 0);
  if (v >= 10000000) return '₹' + (v / 10000000).toFixed(1) + 'Cr';
  if (v >= 100000) return '₹' + (v / 100000).toFixed(1) + 'L';
  if (v >= 1000) return '₹' + (v / 1000).toFixed(1) + 'k';
  return '₹' + v;
};

const initialAvatar = (first, last) =>
  ((first?.[0] || '') + (last?.[0] || '')).toUpperCase() || '?';

export default function DealsPage() {
  const { role } = useAuth();
  const isManagement = ['super_admin', 'admin', 'floor_manager'].includes(role);

  const config = useStore((s) => s.config);
  const sources = useMemo(() => {
    const fromConfig = Array.isArray(config?.lead_source)
      ? config.lead_source.map((r) => ({ value: r.key, label: r.label || r.key }))
      : null;
    if (fromConfig?.length) return fromConfig;
    return Object.keys(SOURCE_LABEL).map((k) => ({ value: k, label: SOURCE_LABEL[k] }));
  }, [config]);

  const languages = useMemo(() => {
    const fromConfig = Array.isArray(config?.language)
      ? config.language.map((r) => ({ value: r.key ?? r.value, label: r.label || r.key || r.value }))
      : null;
    if (fromConfig?.length) return fromConfig;
    return LANGUAGE_FALLBACK;
  }, [config]);

  const [deals, setDeals] = useState([]);
  const [stats, setStats] = useState(null);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);

  const [search, setSearch] = useState('');
  // All native filters live in one object now (keyed by the backend query-param
  // name) and render through the shared FilterRail chip system.
  const [filters, setFilters] = useState({});
  const applyFilters = useCallback((next) => { setFilters(next); setPage(1); }, []);
  const [sortBy, setSortBy] = useState('ftd_at');
  const [page, setPage] = useState(1);
  const [assignees, setAssignees] = useState([]);
  const [groups, setGroups] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [customFilters, setCustomFilters] = useState({});
  // Deals share the same field-definition pool as leads ('deal' entity_type
  // is wired in the FieldDefinition registry).
  const dynDeal = useDynamicColumns('deal');
  const [err, setErr] = useState(null);

  const hasActiveFilters =
    !!search || Object.values(filters).some((v) => v !== '' && v != null);

  const clearFilters = () => {
    setSearch('');
    setFilters({});
    setPage(1);
  };

  // Spec for the native filter rail. Management sees the full set; everyone
  // else gets Source + FTD date. Keys ARE the backend query-param names.
  const filterSpec = useMemo(() => [
    { key: 'lead_source', label: 'Source', kind: 'single', glyph: Radio, tint: 'bg-indigo-500/40', options: sources, allLabel: 'All sources', capitalize: false, width: 'w-[240px]' },
    isManagement && { key: 'language', label: 'Language', kind: 'single', glyph: Languages, tint: 'bg-violet-500/40', options: languages, allLabel: 'All languages' },
    isManagement && { key: 'group_id', label: 'Group', kind: 'single', glyph: UsersRound, tint: 'bg-sky-500/40', options: groups.map((g) => ({ value: g.id, label: g.language ? `${g.name} (${g.language})` : g.name })), allLabel: 'All groups', capitalize: false, width: 'w-[280px]' },
    isManagement && { key: 'campaign_id', label: 'Campaign', kind: 'single', glyph: Megaphone, tint: 'bg-blue-500/40', options: campaigns.map((c) => ({ value: c.id, label: c.name })), allLabel: 'All campaigns', capitalize: false, width: 'w-[300px]' },
    isManagement && { key: 'closed_by_id', label: 'Closer', kind: 'single', glyph: UserCheck, tint: 'bg-emerald-500/40', options: assignees.map((a) => ({ value: a.id, label: `${a.first_name || ''} ${a.last_name || ''}`.trim() + (a.role === 'senior' ? ' (senior)' : '') })), allLabel: 'Closed by anyone', capitalize: false, width: 'w-[280px]' },
    isManagement && { key: 'assignee_id', label: 'Assignee', kind: 'single', glyph: UserRound, tint: 'bg-rose-500/40', options: assignees.map((a) => ({ value: a.id, label: `${a.first_name || ''} ${a.last_name || ''}`.trim() + (a.role === 'senior' ? ' (senior)' : '') })), allLabel: 'Assigned to anyone', capitalize: false, width: 'w-[280px]' },
    { key: 'ftd', label: 'FTD date', kind: 'daterange', glyph: CalendarDays, tint: 'bg-amber-500/40', fromKey: 'ftd_from', toKey: 'ftd_to' },
  ].filter(Boolean), [isManagement, sources, languages, groups, campaigns, assignees]);

  const loadDeals = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const params = {
        page,
        limit: 50,
        sort_by: sortBy,
        sort_dir: 'DESC',
        search: search || undefined,
        lead_source: filters.lead_source || undefined,
        closed_by_id: filters.closed_by_id || undefined,
        assignee_id: filters.assignee_id || undefined,
        group_id: filters.group_id || undefined,
        campaign_id: filters.campaign_id || undefined,
        language: filters.language || undefined,
        ftd_from: filters.ftd_from || undefined,
        ftd_to: filters.ftd_to || undefined,
      };
      for (const k of Object.keys(customFilters)) {
        if (customFilters[k] !== '' && customFilters[k] != null) params[k] = customFilters[k];
      }
      const res = await api.get('/deals', { params });
      const payload = unwrap(res) || {};
      setDeals(payload.items || []);
      setPagination(payload.pagination || { total: 0, totalPages: 0 });
    } catch (e) {
      setErr(e?.code === 'ERR_NETWORK' ? 'Backend not reachable on :5000' : 'Could not load deals');
      setDeals([]);
      setPagination({ total: 0, totalPages: 0 });
    } finally {
      setLoading(false);
    }
  }, [page, sortBy, search, filters, customFilters]);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const params = {
        lead_source: filters.lead_source || undefined,
        closed_by_id: filters.closed_by_id || undefined,
        assignee_id: filters.assignee_id || undefined,
        group_id: filters.group_id || undefined,
        campaign_id: filters.campaign_id || undefined,
        language: filters.language || undefined,
        ftd_from: filters.ftd_from || undefined,
        ftd_to: filters.ftd_to || undefined,
      };
      const res = await api.get('/deals/stats', { params });
      setStats(unwrap(res) || null);
    } catch {
      setStats(null);
    } finally {
      setStatsLoading(false);
    }
  }, [filters]);

  // Initial load + reload when filters/page/sort change.
  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { loadDeals(); }, [loadDeals]);

  // Reset to page 1 when the search text or sort changes (filter-chip changes
  // already reset the page via applyFilters).
  useEffect(() => {
    const t = setTimeout(() => setPage(1), 0);
    return () => clearTimeout(t);
  }, [search, sortBy]);

  // Load assignees list for managers' filter dropdown.
  useEffect(() => {
    if (!isManagement) return;
    (async () => {
      try {
        const [t, s] = await Promise.all([
          api.get('/users', { params: { role: 'tele_sales', limit: 200 } }),
          api.get('/users', { params: { role: 'senior', limit: 200 } }).catch(() => null),
        ]);
        const unwrapList = (r) => {
          if (!r) return [];
          const p = unwrap(r);
          return Array.isArray(p) ? p : (p?.items || p?.data || []);
        };
        setAssignees([...unwrapList(t), ...unwrapList(s)]);
      } catch {
        setAssignees([]);
      }
    })();
  }, [isManagement]);

  // Load groups + campaigns for managers' filter dropdowns.
  useEffect(() => {
    if (!isManagement) return;
    const unwrapList = (r) => {
      if (!r) return [];
      const p = unwrap(r);
      return Array.isArray(p) ? p : (p?.items || p?.data || []);
    };
    (async () => {
      try {
        const [g, c] = await Promise.all([
          api.get('/groups', { params: { limit: 200 } }).catch(() => null),
          api.get('/campaigns', { params: { limit: 200 } }).catch(() => null),
        ]);
        setGroups(unwrapList(g));
        setCampaigns(unwrapList(c));
      } catch {
        setGroups([]);
        setCampaigns([]);
      }
    })();
  }, [isManagement]);

  const containerAnim = {
    hidden: {},
    show: { transition: { staggerChildren: 0.05 } },
  };
  const itemAnim = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } },
  };

  return (
    <motion.div variants={containerAnim} initial="hidden" animate="show" className="space-y-6">
      {/* Header */}
      <motion.div variants={itemAnim} className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <Award className="h-5 w-5 text-emerald-500 dark:text-emerald-400" />
            Deals
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Leads who made their first deposit · {pagination.total.toLocaleString('en-IN')}{' '}
            {pagination.total === 1 ? 'deal' : 'deals'}
            {err && <span className="ml-2 text-amber-600 dark:text-amber-400">{err}</span>}
          </p>
        </div>
      </motion.div>

      {/* Stats cards */}
      <motion.div variants={itemAnim} className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatTile
          label="Total deals"
          value={statsLoading ? '—' : (stats?.total ?? 0).toLocaleString('en-IN')}
          icon={Award}
          accent="emerald"
        />
        <StatTile
          label="Total deposits"
          value={statsLoading ? '—' : fmtCompact(stats?.totalDeposits)}
          icon={Wallet}
          accent="emerald"
          highlight
        />
        <StatTile
          label="Avg deposit"
          value={statsLoading ? '—' : fmtCompact(stats?.avgDeposit)}
          icon={TrendingUp}
          accent="blue"
        />
        <StatTile
          label="Today"
          value={statsLoading ? '—' : (stats?.todayCount ?? 0).toLocaleString('en-IN')}
          icon={Activity}
          accent="amber"
        />
        <StatTile
          label="This month"
          value={statsLoading ? '—' : (stats?.thisMonthCount ?? 0).toLocaleString('en-IN')}
          icon={CalendarDays}
          accent="violet"
        />
      </motion.div>

      {/* Top deal makers — management only. Ranked by who CLOSED the deal
          (snapshotted at FTD time), so reassignments don't steal credit. */}
      {isManagement && stats?.byCloser?.length > 0 && (
        <motion.div variants={itemAnim}>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                Top deal makers
                <span className="text-[10px] font-normal text-muted-foreground">
                  · by deposits closed
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {stats.byCloser.slice(0, 5).map((r, idx) => {
                  const [first = '', last = ''] = (r.closer_name || '').split(' ');
                  const isUnattributed = !r.closer_id;
                  return (
                    <div
                      key={r.closer_id || `unattributed-${idx}`}
                      className="flex items-center justify-between gap-3 px-2 py-2 rounded-md hover:bg-muted/40 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-5 text-center text-[11px] font-semibold text-muted-foreground tabular-nums">
                          {idx + 1}
                        </div>
                        <div className="w-8 h-8 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-[11px] font-semibold">
                          {isUnattributed ? '—' : initialAvatar(first, last)}
                        </div>
                        <div>
                          <p className="text-sm font-medium leading-none">
                            {r.closer_name}
                            {!r.user && r.closer_id && (
                              <span className="ml-1.5 text-[10px] text-muted-foreground">
                                (deleted)
                              </span>
                            )}
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-1 capitalize">
                            {r.closer_role ? r.closer_role.replace(/_/g, ' ') : '—'}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold tabular-nums">{fmtCompact(r.total)}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {r.count} {r.count === 1 ? 'deal' : 'deals'}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Filters — single grouped bar that wraps elegantly on smaller widths.
          Search expands to fill remaining space, every control is 36px tall, and
          the clear button is right-anchored when filters are active so the eye
          always finds it in the same place. */}
      <motion.div variants={itemAnim}>
        <div className="rounded-xl border bg-card p-2.5 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Input
              placeholder="Search name, phone, ARK#…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 text-sm"
            />
          </div>

          <FilterRail spec={filterSpec} filters={filters} onChange={applyFilters} />

          <DynamicFilterBar
            entityType="deal"
            filters={customFilters}
            onChange={(next) => { setPage(1); setCustomFilters(next); }}
          />
          <dynDeal.PickerButton />
          <ManageFieldsButton entityType="deal" size="sm" />

          <div className="ml-auto flex items-center gap-2">
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-44 h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ftd_at">Newest FTD first</SelectItem>
                <SelectItem value="deposited_amount">Largest deposit</SelectItem>
                <SelectItem value="last_contact_date">Recently contacted</SelectItem>
                <SelectItem value="created_at">Lead created</SelectItem>
              </SelectContent>
            </Select>

            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="h-9 text-xs text-muted-foreground hover:text-red-600 dark:hover:text-red-400"
              >
                <X className="h-3.5 w-3.5 mr-1" />
                Clear
              </Button>
            )}
          </div>
        </div>
      </motion.div>

      {/* Table */}
      <motion.div variants={itemAnim}>
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left p-3 font-medium text-muted-foreground text-xs">Customer</th>
                  <th className="text-left p-3 font-medium text-muted-foreground text-xs">Deposit</th>
                  <th className="text-left p-3 font-medium text-muted-foreground text-xs">FTD date</th>
                  <th className="text-left p-3 font-medium text-muted-foreground text-xs">Closed by</th>
                  <th className="text-left p-3 font-medium text-muted-foreground text-xs">Source</th>
                  <th className="text-left p-3 font-medium text-muted-foreground text-xs">Assigned to</th>
                  <th className="text-left p-3 font-medium text-muted-foreground text-xs">ARK</th>
                  {/* Dynamic custom-field columns the admin toggled on. */}
                  {dynDeal.customDefs
                    .filter((d) => dynDeal.visibleColumns[d.field_key])
                    .map((d) => (
                      <th key={d.field_key} className="text-left p-3 font-medium text-muted-foreground text-xs">
                        {d.label}
                      </th>
                    ))}
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={8 + dynDeal.cfColumnDefs.length} className="p-10 text-center text-muted-foreground">Loading deals…</td>
                  </tr>
                )}
                {!loading && deals.length === 0 && (
                  <tr>
                    <td colSpan={8 + dynDeal.cfColumnDefs.length} className="p-10 text-center text-muted-foreground">
                      No deals yet. Deals appear here when a lead completes their first deposit.
                    </td>
                  </tr>
                )}
                {!loading && deals.map((d) => {
                  const name = `${d.first_name || ''} ${d.last_name || ''}`.trim() || '—';
                  const sourceLabel = SOURCE_LABEL[d.lead_source] || (d.lead_source || '').replace(/_/g, ' ');
                  return (
                    <tr key={d.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="p-3">
                        <Link href={`/leads/${d.id}`} className="hover:text-blue-500 dark:hover:text-blue-400">
                          <p className="font-medium leading-tight">{name}</p>
                        </Link>
                        {d.phone && (
                          <p className="text-muted-foreground font-mono text-[11px] mt-0.5 flex items-center gap-1">
                            <Phone className="h-2.5 w-2.5" />
                            {d.phone}
                          </p>
                        )}
                      </td>
                      <td className="p-3">
                        <p className="font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                          {fmtMoney(d.deposited_amount)}
                        </p>
                      </td>
                      <td className="p-3 text-muted-foreground whitespace-nowrap text-xs">
                        {d.ftd_at ? dayjs(d.ftd_at).format('DD MMM YYYY') : '—'}
                      </td>
                      <td className="p-3">
                        {d.closed_by_name || d.closedBy ? (
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-[10px] font-semibold flex-shrink-0">
                              {initialAvatar(
                                d.closedBy?.first_name || (d.closed_by_name || '').split(' ')[0],
                                d.closedBy?.last_name  || (d.closed_by_name || '').split(' ')[1],
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-medium truncate leading-tight">
                                {d.closedBy
                                  ? `${d.closedBy.first_name || ''} ${d.closedBy.last_name || ''}`.trim()
                                  : d.closed_by_name}
                                {!d.closedBy && d.closed_by_user_id && (
                                  <span className="ml-1 text-[9px] text-muted-foreground">
                                    (deleted)
                                  </span>
                                )}
                              </p>
                              {d.closedBy?.role && (
                                <p className="text-[9px] text-muted-foreground capitalize leading-tight">
                                  {d.closedBy.role.replace(/_/g, ' ')}
                                </p>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">Unattributed</span>
                        )}
                      </td>
                      <td className="p-3">
                        <Badge
                          variant="outline"
                          className={
                            d.lead_source === 'direct_ark'
                              ? 'text-[10px] text-teal-600 dark:text-teal-400 border-teal-500/40'
                              : 'text-[10px] text-blue-600 dark:text-blue-400 border-blue-500/40'
                          }
                        >
                          {sourceLabel}
                        </Badge>
                      </td>
                      <td className="p-3">
                        {d.assignedTo ? (
                          <span className="text-xs">
                            {d.assignedTo.first_name} {d.assignedTo.last_name}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">Unassigned</span>
                        )}
                      </td>
                      <td className="p-3">
                        {d.ark_account_number ? (
                          <Badge variant="outline" className="text-[10px] text-teal-600 dark:text-teal-400 border-teal-500/40 font-mono">
                            {d.ark_account_number}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      {/* Dynamic custom-field cells. */}
                      {dynDeal.customDefs
                        .filter((dd) => dynDeal.visibleColumns[dd.field_key])
                        .map((dd) => (
                          <td key={dd.field_key} className="p-3">
                            <DynamicCell definition={dd} value={d.custom_fields?.[dd.field_key]} />
                          </td>
                        ))}
                      <td className="p-3 text-right">
                        <Button asChild size="sm" variant="ghost" className="h-7 text-xs">
                          <Link href={`/leads/${d.id}`}>
                            View <ArrowRight className="h-3 w-3 ml-1" />
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </motion.div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Page {page} of {pagination.totalPages}</span>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="outline"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= pagination.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </motion.div>
  );
}

/* ─── Local stat tile (smaller than the dashboard StatCard) ─────────────── */
const ACCENT_BG = {
  emerald: 'border-l-emerald-500',
  blue:    'border-l-blue-500',
  amber:   'border-l-amber-500',
  violet:  'border-l-violet-500',
};
const ACCENT_TEXT = {
  emerald: 'text-emerald-600 dark:text-emerald-400',
  blue:    'text-blue-600 dark:text-blue-400',
  amber:   'text-amber-600 dark:text-amber-400',
  violet:  'text-violet-600 dark:text-violet-400',
};

function StatTile({ label, value, icon: Icon, accent = 'blue', highlight = false }) {
  return (
    <Card className={`overflow-hidden border-l-4 ${ACCENT_BG[accent]}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          {Icon && (
            <div className={`h-7 w-7 rounded-md flex items-center justify-center bg-muted ${ACCENT_TEXT[accent]}`}>
              <Icon className="h-3.5 w-3.5" />
            </div>
          )}
        </div>
        <p className={`font-mono text-2xl font-bold tracking-tight tabular-nums leading-none ${highlight ? ACCENT_TEXT[accent] : ''}`}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
