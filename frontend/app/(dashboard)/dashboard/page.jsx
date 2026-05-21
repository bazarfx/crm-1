'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useTheme } from 'next-themes';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, LineChart, Line, Legend,
} from 'recharts';
import {
  Users, PhoneCall, Wallet, UserCheck, Briefcase,
  Activity, Award, BarChart3,
} from 'lucide-react';
import api, { unwrap } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import StatCard from '@/components/shared/StatCard';
import StatusBadge from '@/components/shared/StatusBadge';
import TelesellerDashboard from '@/components/dashboard/TelesellerDashboard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CHART_COLORS, statusColor } from '@/lib/charts';

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
};
const item = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } },
};

export default function DashboardPage() {
  const { role, roleLabel, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const res = await api.get('/reports/dashboard-summary');
        if (!alive) return;
        setSummary(unwrap(res) || null);
      } catch (e) {
        if (!alive) return;
        setErr(e?.code === 'ERR_NETWORK' ? 'Backend not reachable on :5000' : 'Could not load metrics');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const s = summary?.stats || {};
  const pipeline = (summary?.pipeline || []).map((p) => ({
    ...p,
    label: p.label || (p.status || '').replace(/_/g, ' '),
    fill: p.color || statusColor(p.status),
  }));
  const languages = summary?.languages || [];
  const sources = (summary?.sources || []).map((p, i) => ({
    ...p,
    fill: p.color || CHART_COLORS[i % CHART_COLORS.length],
  }));
  const trend = summary?.trend_30d || [];
  const topCampaigns = summary?.top_campaigns || [];
  const lastLeads = summary?.last_leads || [];

  const greeting = user?.first_name ? `Hi ${user.first_name}` : 'Welcome';

  // Telesellers get their own dedicated personal dashboard component
  if (role === 'tele_sales') {
    return (
      <motion.div variants={container} initial="hidden" animate="show" className="space-y-5">
        <motion.div variants={item}>
          <h2 className="text-xl font-semibold tracking-tight">{greeting}.</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Signed in as <span className="text-foreground font-medium">{roleLabel}</span>.
          </p>
        </motion.div>
        <TelesellerDashboard />
      </motion.div>
    );
  }

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      {/* Greeting */}
      <motion.div variants={item}>
        <h2 className="text-xl font-semibold tracking-tight">{greeting}.</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Signed in as <span className="text-foreground font-medium">{roleLabel}</span>.
          {err && <span className="ml-2 text-amber-600 dark:text-amber-400">{err}</span>}
        </p>
      </motion.div>

      {(role === 'floor_manager' || role === 'senior') && (
        <ManagerDashboard
          loading={loading}
          stats={s}
          pipeline={pipeline}
          languages={languages}
        />
      )}

      {(['admin', 'super_admin', 'back_office', 'auditor', 'archive'].includes(role)) && (
        <AdminDashboard
          loading={loading}
          stats={s}
          pipeline={pipeline}
          sources={sources}
          trend={trend}
          topCampaigns={topCampaigns}
          languages={languages}
        />
      )}
    </motion.div>
  );
}

/* ============================================================
 * Tooltip — theme-aware popover styling
 * ============================================================ */
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover text-popover-foreground p-3 shadow-lg text-xs">
      {label !== undefined && label !== null && (
        <p className="font-medium mb-1 capitalize">{String(label).replace(/_/g, ' ')}</p>
      )}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color || p.fill || p.payload?.fill }} />
          <span className="text-muted-foreground capitalize">
            {(p.name || '').toString().replace(/_/g, ' ')}:
          </span>
          <span className="font-semibold tabular-nums">
            {typeof p.value === 'number' ? p.value.toLocaleString('en-IN') : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function useChartAxis() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  return {
    grid: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)',
    axis: isDark ? '#64748B' : '#94A3B8',
  };
}

/* ============================================================
 * MANAGER (floor_manager / senior)
 * ============================================================ */
function ManagerDashboard({ loading, stats, pipeline, languages }) {
  const { grid, axis } = useChartAxis();
  return (
    <>
      <motion.div variants={item} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title="Team Leads Today" value={stats.team_leads_today ?? '—'} icon={Users}     accentColor="indigo"  loading={loading} />
        <StatCard title="Team Calls"       value={stats.team_calls ?? '—'}       icon={PhoneCall} accentColor="blue"    loading={loading} />
        <StatCard title="Team FTDs"        value={stats.team_ftds ?? '—'}        icon={Wallet}    accentColor="emerald" loading={loading} />
      </motion.div>

      <motion.div variants={item} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle>Pipeline</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={pipeline} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: axis, fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tick={{ fill: axis, fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'hsl(var(--muted) / 0.4)' }} />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {pipeline.map((p, i) => <Cell key={i} fill={p.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle>Language Distribution</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={languages} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={grid} horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fill: axis, fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="language" width={90} tick={{ fill: axis, fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'hsl(var(--muted) / 0.4)' }} />
                <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                  {languages.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </motion.div>
    </>
  );
}

/* ============================================================
 * ADMIN / SUPER_ADMIN / BACK_OFFICE / AUDITOR
 * ============================================================ */
function AdminDashboard({ loading, stats, pipeline, sources, trend, topCampaigns, languages }) {
  const { grid, axis } = useChartAxis();
  return (
    <>
      <motion.div variants={item} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Leads"
          value={stats.total_leads ?? '—'}
          icon={Users}
          accentColor="blue"
          loading={loading}
          change={stats.leads_today != null ? `+${stats.leads_today.toLocaleString('en-IN')} today` : undefined}
          changeType="up"
        />
        <StatCard title="Leads Today"  value={stats.leads_today ?? '—'}  icon={Activity}  accentColor="violet"  loading={loading} />
        <StatCard title="ARK Accounts" value={stats.ark_accounts ?? '—'} icon={UserCheck} accentColor="teal"    loading={loading} />
        <StatCard title="Total FTDs"   value={stats.total_ftds ?? '—'}   icon={Wallet}    accentColor="emerald" loading={loading} />
      </motion.div>

      <motion.div variants={item} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" /> Lead Pipeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={pipeline} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: axis, fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tick={{ fill: axis, fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'hsl(var(--muted) / 0.4)' }} />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {pipeline.map((p, i) => <Cell key={i} fill={p.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle>Source Distribution</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={sources}
                  dataKey="count"
                  nameKey="source"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={2}
                  stroke="hsl(var(--card))"
                  strokeWidth={2}
                >
                  {sources.map((entry, i) => (
                    <Cell key={i} fill={entry.fill || CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
                <Legend
                  verticalAlign="bottom"
                  iconType="circle"
                  formatter={(v) => (
                    <span className="text-xs text-muted-foreground">{v}</span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div variants={item}>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Last 30 Days — Lead Volume</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trend} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="lineGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4F8EF7" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#4F8EF7" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fill: axis, fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => (typeof v === 'string' ? v.slice(5) : v)}
                />
                <YAxis allowDecimals={false} tick={{ fill: axis, fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="#4F8EF7"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 5, fill: '#4F8EF7', stroke: 'hsl(var(--card))', strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div variants={item} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RankTable
          title="Top 5 Campaigns"
          icon={Briefcase}
          loading={loading}
          rows={topCampaigns.slice(0, 5).map((c) => ({
            primary: c.name,
            secondary: `${c.conversions ?? 0} conv · ${c.leads ?? 0} leads`,
            metric: c.leads ?? 0,
          }))}
        />
        <RankTable
          title="Top 5 Languages"
          icon={Award}
          loading={loading}
          rows={languages.slice(0, 5).map((l) => ({
            primary: l.language,
            secondary: `${l.count ?? 0} leads`,
            metric: l.count ?? 0,
          }))}
        />
      </motion.div>
    </>
  );
}

/* ============================================================
 * Helpers
 * ============================================================ */
function SimpleLeadRows({ rows, loading }) {
  if (loading) {
    return (
      <div className="p-5 space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="shimmer h-8 w-full rounded" />
        ))}
      </div>
    );
  }
  if (!rows?.length) {
    return <div className="p-8 text-center text-sm text-muted-foreground">No recent leads</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/40 border-b">
            <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide px-5 py-2.5">Name</th>
            <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide px-5 py-2.5">Status</th>
            <th className="text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide px-5 py-2.5">Last Contact</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 5).map((l) => (
            <tr key={l.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
              <td className="px-5 py-3 font-medium">{l.name}</td>
              <td className="px-5 py-3"><StatusBadge status={l.status} /></td>
              <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{l.last_contact_at || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RankTable({ title, icon: Icon, rows, loading }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2">
          {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="shimmer h-10 w-full rounded" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No data</p>
        ) : (
          <ul className="space-y-1">
            {rows.map((r, i) => (
              <li
                key={i}
                className="flex items-center gap-3 py-1.5 px-2 rounded-md hover:bg-muted/40 transition-colors"
              >
                <span className="font-mono text-xs text-muted-foreground w-5">{i + 1}.</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{r.primary}</p>
                  <p className="text-xs text-muted-foreground truncate">{r.secondary}</p>
                </div>
                <span className="font-mono text-sm font-semibold tabular-nums">{r.metric}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
