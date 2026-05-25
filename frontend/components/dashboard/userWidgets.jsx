'use client';

/**
 * Widget registry for the per-user dashboard.
 *
 * Each entry is a self-contained renderer over the stats payload returned by
 * GET /users/:id/stats. The layout (visible + order) is persisted in
 * localStorage; the registry itself is a plain object so future LLM-generated
 * widgets can drop in by registering an entry with id + render fn — the
 * page-level code reads the layout array and looks up renderers here, so it
 * never needs to know about specific widget types.
 */

import Link from 'next/link';
import dayjs from 'dayjs';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  LineChart, Line, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { TrendingUp, Users, Wallet, Percent, Languages, Activity, Clock } from 'lucide-react';
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from '@/components/ui/card';
import { LanguageBadge } from '@/components/shared/LanguageBadge';
import StatusBadge from '@/components/shared/StatusBadge';
import { CHART_COLORS } from '@/lib/charts';

const fmtINR = (n) => {
  const v = Number(n || 0);
  if (v >= 10000000) return '₹' + (v / 10000000).toFixed(1) + 'Cr';
  if (v >= 100000) return '₹' + (v / 100000).toFixed(1) + 'L';
  if (v >= 1000) return '₹' + (v / 1000).toFixed(1) + 'k';
  return '₹' + v;
};
const fmtCount = (n) => Number(n || 0).toLocaleString('en-IN');

/* ============================================================
 * Shared KPI tile — used by four of the five built-in KPI widgets.
 * ============================================================ */
function KpiTile({ title, value, change, icon: Icon, accent = 'blue' }) {
  const accents = {
    blue:    'border-blue-500/30 bg-blue-500/5 text-blue-700 dark:text-blue-300',
    emerald: 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300',
    teal:    'border-teal-500/30 bg-teal-500/5 text-teal-700 dark:text-teal-300',
    amber:   'border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300',
    purple:  'border-purple-500/30 bg-purple-500/5 text-purple-700 dark:text-purple-300',
  };
  return (
    <Card className={accents[accent] || accents.blue}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] uppercase tracking-wider font-medium">{title}</p>
          {Icon && <Icon className="h-3.5 w-3.5 opacity-70" />}
        </div>
        <p className="text-3xl font-medium tabular-nums">{value}</p>
        {change && <p className="text-[10px] mt-1 opacity-80">{change}</p>}
      </CardContent>
    </Card>
  );
}

/* ============================================================
 * KPI widgets
 * ============================================================ */
function LeadsKpi({ stats }) {
  return (
    <KpiTile
      title="Leads assigned"
      value={fmtCount(stats?.totals?.leads)}
      icon={Users}
      accent="blue"
    />
  );
}

function DealsKpi({ stats }) {
  return (
    <KpiTile
      title="Deals closed (FTDs)"
      value={fmtCount(stats?.totals?.deals)}
      icon={Wallet}
      accent="emerald"
    />
  );
}

function ConversionKpi({ stats }) {
  const rate = stats?.totals?.conversion_rate ?? 0;
  return (
    <KpiTile
      title="Conversion rate"
      value={`${rate}%`}
      icon={Percent}
      accent="teal"
      change={`${fmtCount(stats?.totals?.deals)} of ${fmtCount(stats?.totals?.leads)} leads`}
    />
  );
}

function DepositsKpi({ stats }) {
  return (
    <KpiTile
      title="Total deposited"
      value={fmtINR(stats?.totals?.deposits)}
      icon={TrendingUp}
      accent="amber"
    />
  );
}

/* ============================================================
 * By-language widget — bar of leads + deals per language
 * with a small conversion-rate column on the right.
 * ============================================================ */
function ByLanguageWidget({ stats }) {
  const rows = stats?.by_language || [];
  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Languages className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            Performance by language
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground text-center py-6">
            No leads assigned yet.
          </p>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Languages className="h-4 w-4 text-purple-600 dark:text-purple-400" />
          Performance by language
        </CardTitle>
        <CardDescription className="text-xs">
          Leads, deals, and conversion rate broken down per language this user speaks.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        {rows.map((r) => (
          <div
            key={r.language}
            className="grid grid-cols-[120px_1fr_80px_60px_60px] gap-3 items-center px-2 py-2 rounded-md hover:bg-muted/40"
          >
            <div className="flex items-center gap-2 min-w-0">
              <LanguageBadge language={r.language} size="xs" />
              <span className="text-xs capitalize truncate">{r.language}</span>
            </div>
            <div className="h-2 bg-muted/40 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500/60"
                style={{ width: `${Math.min(100, r.conversion_rate)}%` }}
              />
            </div>
            <span className="text-[11px] text-right tabular-nums text-muted-foreground">
              {fmtCount(r.leads)} leads
            </span>
            <span className="text-[11px] text-right tabular-nums text-emerald-600 dark:text-emerald-400 font-medium">
              {fmtCount(r.deals)}
            </span>
            <span className="text-[11px] text-right tabular-nums text-teal-600 dark:text-teal-400 font-medium">
              {r.conversion_rate}%
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/* ============================================================
 * By-status pie chart — lead status distribution.
 * ============================================================ */
function ByStatusWidget({ stats }) {
  const rows = (stats?.by_status || []).filter((r) => r.count > 0);
  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            Status breakdown
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground text-center py-6">No status data.</p>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Activity className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          Status breakdown
        </CardTitle>
        <CardDescription className="text-xs">Distribution of this user&apos;s leads across statuses.</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={240}>
          <PieChart>
            <Pie
              data={rows}
              dataKey="count"
              nameKey="status"
              innerRadius={50}
              outerRadius={85}
              paddingAngle={2}
              stroke="hsl(var(--card))"
              strokeWidth={2}
            >
              {rows.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: 'hsl(var(--popover))',
                border: '1px solid hsl(var(--border))',
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(value, name) => [fmtCount(value), String(name).replace(/_/g, ' ')]}
            />
            <Legend
              verticalAlign="bottom"
              iconType="circle"
              formatter={(v) => (
                <span className="text-[10px] text-muted-foreground capitalize">
                  {String(v).replace(/_/g, ' ')}
                </span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

/* ============================================================
 * 6-month trend — leads vs deals line chart.
 * ============================================================ */
function MonthlyTrendWidget({ stats }) {
  const data = (stats?.monthly_trend || []).map((m) => ({
    month: m.month ? dayjs(m.month + '-01').format('MMM') : m.month,
    leads: m.leads,
    deals: m.deals,
  }));
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          6-month trend
        </CardTitle>
        <CardDescription className="text-xs">Leads received and deals closed each month.</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={{
                background: 'hsl(var(--popover))',
                border: '1px solid hsl(var(--border))',
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <Legend
              iconType="circle"
              formatter={(v) => <span className="text-[10px] text-muted-foreground capitalize">{v}</span>}
            />
            <Line type="monotone" dataKey="leads" stroke="#4F8EF7" strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="deals" stroke="#10B981" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

/* ============================================================
 * Status bar chart — alternative viz for status distribution.
 * Available as a separate widget so admins can pick pie OR bar.
 * ============================================================ */
function StatusBarWidget({ stats }) {
  const rows = (stats?.by_status || []).filter((r) => r.count > 0);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Activity className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
          Status counts
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={rows} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis
              dataKey="status"
              tick={{ fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => String(v).replace(/_/g, ' ')}
            />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={{
                background: 'hsl(var(--popover))',
                border: '1px solid hsl(var(--border))',
                borderRadius: 8,
                fontSize: 12,
              }}
              labelFormatter={(v) => String(v).replace(/_/g, ' ')}
            />
            <Bar dataKey="count" radius={[6, 6, 0, 0]}>
              {rows.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

/* ============================================================
 * Recent leads table.
 * ============================================================ */
function RecentLeadsWidget({ stats }) {
  const rows = stats?.recent_leads || [];
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          Recent leads
        </CardTitle>
        <CardDescription className="text-xs">10 most recently assigned to this user.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">No leads yet.</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/20">
                <th className="text-left p-2.5 font-medium text-muted-foreground">Name</th>
                <th className="text-left p-2.5 font-medium text-muted-foreground">Language</th>
                <th className="text-left p-2.5 font-medium text-muted-foreground">Status</th>
                <th className="text-right p-2.5 font-medium text-muted-foreground">Created</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => (
                <tr key={l.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="p-2.5">
                    <Link href={`/leads/${l.id}`} className="font-medium hover:underline">
                      {l.name}
                    </Link>
                    <p className="text-[10px] text-muted-foreground mono">{l.phone}</p>
                  </td>
                  <td className="p-2.5">
                    {l.language && <LanguageBadge language={l.language} size="xs" />}
                  </td>
                  <td className="p-2.5">
                    <StatusBadge status={l.status} />
                  </td>
                  <td className="p-2.5 text-right mono text-[10px] text-muted-foreground">
                    {l.created_at ? dayjs(l.created_at).format('DD MMM') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

/* ============================================================
 * Registry — each entry: { id, title, group, span, render }.
 *   span:  'sm' (1 col on lg) | 'md' (2 col) | 'lg' (full row)
 *   group: lets the catalogue UI cluster widgets when adding.
 *
 * Adding a new built-in widget = adding an entry here. Adding an
 * LLM-generated widget at runtime would be: push a registry entry whose
 * `render` closure reads the LLM-supplied data shape and returns JSX.
 * ============================================================ */
export const USER_WIDGETS = {
  leads_total:     { title: 'Leads assigned',      group: 'KPI',   span: 'sm', render: LeadsKpi },
  deals_total:     { title: 'Deals closed',        group: 'KPI',   span: 'sm', render: DealsKpi },
  conversion:      { title: 'Conversion rate',     group: 'KPI',   span: 'sm', render: ConversionKpi },
  deposits:        { title: 'Total deposits',      group: 'KPI',   span: 'sm', render: DepositsKpi },
  by_language:     { title: 'By language',         group: 'Charts', span: 'md', render: ByLanguageWidget },
  by_status_pie:   { title: 'Status (pie)',        group: 'Charts', span: 'md', render: ByStatusWidget },
  by_status_bar:   { title: 'Status (bar)',        group: 'Charts', span: 'md', render: StatusBarWidget },
  monthly_trend:   { title: '6-month trend',       group: 'Charts', span: 'md', render: MonthlyTrendWidget },
  recent_leads:    { title: 'Recent leads',        group: 'Tables', span: 'lg', render: RecentLeadsWidget },
};

// Default layout shipped with the app. Each item is just an id plus optional
// hidden flag — kept in a flat array so future LLM-generated widgets slot in
// without restructuring.
export const DEFAULT_LAYOUT = [
  { id: 'leads_total' },
  { id: 'deals_total' },
  { id: 'conversion' },
  { id: 'deposits' },
  { id: 'by_language' },
  { id: 'monthly_trend' },
  { id: 'by_status_pie' },
  { id: 'by_status_bar', hidden: true },
  { id: 'recent_leads' },
];

export function spanClass(span) {
  switch (span) {
    case 'sm': return 'lg:col-span-1';
    case 'md': return 'lg:col-span-2';
    case 'lg':
    default:   return 'lg:col-span-4';
  }
}
