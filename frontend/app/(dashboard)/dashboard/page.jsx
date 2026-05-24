'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useTheme } from 'next-themes';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, LineChart, Line, Legend,
} from 'recharts';
import {
  Users, PhoneCall, Wallet, UserCheck, Briefcase,
  Activity, Award, BarChart3, Calendar, Plus, Megaphone, UserCog, Webhook,
  Languages, AlertTriangle, ArrowRight,
} from 'lucide-react';
import dayjs from 'dayjs';
import api, { unwrap } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import StatCard from '@/components/shared/StatCard';
import StatusBadge from '@/components/shared/StatusBadge';
import { LanguageBadge } from '@/components/shared/LanguageBadge';
import { labelFor } from '@/lib/languages';
import TelesellerDashboard from '@/components/dashboard/TelesellerDashboard';
import ReassignedAwayBanner from '@/components/dashboard/ReassignedAwayBanner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CHART_COLORS, statusColor } from '@/lib/charts';
import { cn } from '@/lib/utils';

const fmtINR = (n) => {
  const v = Number(n || 0);
  if (v >= 10000000) return '₹' + (v / 10000000).toFixed(1) + 'Cr';
  if (v >= 100000) return '₹' + (v / 100000).toFixed(1) + 'L';
  if (v >= 1000) return '₹' + (v / 1000).toFixed(1) + 'k';
  return '₹' + v;
};

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
  const [dealStats, setDealStats] = useState(null);
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

  // Deals KPI — same dataset as /deals, isolated so a failure here doesn't
  // blank the rest of the dashboard.
  useEffect(() => {
    let alive = true;
    api.get('/deals/stats')
      .then((res) => { if (alive) setDealStats(unwrap(res) || null); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // Unassigned-leads alert — only admin / super_admin / floor_manager care.
  // Pulled separately so it appears even when the main dashboard summary is
  // still loading.
  const showUnassignedAlert = role === 'admin' || role === 'super_admin' || role === 'floor_manager';
  const [unassignedCount, setUnassignedCount] = useState(0);
  useEffect(() => {
    if (!showUnassignedAlert) { setUnassignedCount(0); return; }
    let alive = true;
    api.get('/leads/unassigned/summary')
      .then((res) => {
        if (!alive) return;
        const total = unwrap(res)?.total;
        setUnassignedCount(typeof total === 'number' ? total : 0);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [showUnassignedAlert]);

  // Language teams stats — only admin / super_admin see the card, so only
  // fetch for those roles. Silently degrades if /users/language-stats isn't
  // available (e.g. backend still rolling out the endpoint).
  const [langStats, setLangStats] = useState(null);
  useEffect(() => {
    if (role !== 'admin' && role !== 'super_admin') { setLangStats(null); return; }
    let alive = true;
    api.get('/users/language-stats')
      .then((res) => { if (alive) setLangStats(unwrap(res) || null); })
      .catch(() => { if (alive) setLangStats(null); });
    return () => { alive = false; };
  }, [role]);

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
          <DashboardHeader greeting={greeting} roleLabel={roleLabel} role={role} err={null} />
        </motion.div>
        <motion.div variants={item}>
          <ReassignedAwayBanner />
        </motion.div>
        <TelesellerDashboard />
      </motion.div>
    );
  }

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      {/* Header — greeting + date pulse + role-aware quick actions */}
      <motion.div variants={item}>
        <DashboardHeader greeting={greeting} roleLabel={roleLabel} role={role} err={err} />
      </motion.div>

      {/* Unassigned-leads alert — surfaces leads that round-robin couldn't
          route (no matching language speaker), so admins notice and dispatch
          them rather than letting them rot in the queue. */}
      {showUnassignedAlert && unassignedCount > 0 && (
        <motion.div variants={item}>
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                      {unassignedCount} unassigned {unassignedCount === 1 ? 'lead needs' : 'leads need'} attention
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      No teleseller speaks the lead&apos;s language, or all matching telesellers are inactive.
                    </p>
                  </div>
                </div>
                <Link
                  href="/leads?lead_status=unassigned"
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200 text-xs font-medium hover:bg-amber-500/20 transition-colors"
                >
                  Review
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {role === 'senior' && (
        <motion.div variants={item}>
          <ReassignedAwayBanner />
        </motion.div>
      )}

      {(role === 'floor_manager' || role === 'senior') && (
        <ManagerDashboard
          loading={loading}
          stats={s}
          pipeline={pipeline}
          languages={languages}
          dealStats={dealStats}
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
          dealStats={dealStats}
          langStats={langStats}
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
function ManagerDashboard({ loading, stats, pipeline, languages, dealStats }) {
  const { grid, axis } = useChartAxis();
  return (
    <>
      <motion.div variants={item} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Team Leads Today" value={stats.team_leads_today ?? '—'} icon={Users}     accentColor="indigo"  loading={loading} />
        <StatCard title="Team Calls"       value={stats.team_calls ?? '—'}       icon={PhoneCall} accentColor="blue"    loading={loading} />
        <StatCard title="Team FTDs"        value={stats.team_ftds ?? '—'}        icon={Wallet}    accentColor="emerald" loading={loading} />
        <Link href="/deals" className="block">
          <StatCard
            title="Deals"
            value={dealStats?.total ?? '—'}
            icon={Award}
            accentColor="green"
            loading={dealStats === null && loading}
            change={dealStats ? fmtINR(dealStats.totalDeposits) : undefined}
            changeType="up"
          />
        </Link>
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
function AdminDashboard({ loading, stats, pipeline, sources, trend, topCampaigns, languages, dealStats, langStats }) {
  const { grid, axis } = useChartAxis();
  const dealsTrend = dealStats
    ? `${dealStats.todayCount} today · ${fmtINR(dealStats.totalDeposits)}`
    : undefined;
  return (
    <>
      <motion.div variants={item} className="grid grid-cols-2 lg:grid-cols-5 gap-4">
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
        <Link href="/deals" className="block group">
          <StatCard
            title="Deals"
            value={dealStats?.total ?? '—'}
            icon={Award}
            accentColor="green"
            loading={dealStats === null && loading}
            change={dealsTrend}
            changeType="up"
          />
        </Link>
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

      {langStats?.by_language?.length > 0 && (
        <motion.div variants={item}>
          <LanguageTeamsCard rows={langStats.by_language} />
        </motion.div>
      )}
    </>
  );
}

/* ============================================================
 * Language teams — performance by primary language
 * ============================================================ */
function LanguageTeamsCard({ rows }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2">
          <Languages className="h-4 w-4 text-purple-600 dark:text-purple-400" />
          Language teams
        </CardTitle>
        <CardDescription>Performance by primary language</CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        {rows.slice(0, 8).map((row) => {
          const teamCount = (row.telesellers ?? 0) + (row.seniors ?? 0);
          return (
            <div
              key={row.language}
              className="grid grid-cols-[140px_1fr_auto] items-center gap-3 p-2 rounded-md hover:bg-muted/40 transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                <LanguageBadge language={row.language} primary />
                <span className="text-sm font-medium truncate">{labelFor(row.language)}</span>
              </div>
              <div className="grid grid-cols-4 gap-2 text-[10px] text-muted-foreground">
                <Stat
                  value={
                    <>
                      {row.telesellers ?? 0}<span className="text-[9px] text-muted-foreground ml-0.5">TS</span>
                      <span className="text-muted-foreground mx-0.5">·</span>
                      {row.seniors ?? 0}<span className="text-[9px] text-muted-foreground ml-0.5">SR</span>
                    </>
                  }
                  label={`active team${teamCount === 1 ? '' : ''}`}
                />
                <Stat value={(row.total_leads ?? 0).toLocaleString('en-IN')} label="leads" />
                <Stat
                  value={(row.ftd_count ?? 0).toLocaleString('en-IN')}
                  label="FTDs"
                  valueClass="text-emerald-600 dark:text-emerald-400"
                />
                <Stat
                  value={`₹${((row.total_deposits ?? 0) / 1000).toFixed(0)}k`}
                  label="deposited"
                />
              </div>
              {row.overflow_helpers > 0 ? (
                <Badge variant="outline" className="text-[9px] text-amber-600 dark:text-amber-400 border-amber-500/30 whitespace-nowrap">
                  +{row.overflow_helpers} overflow
                </Badge>
              ) : <span />}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function Stat({ value, label, valueClass }) {
  return (
    <div className="min-w-0">
      <p className={cn('text-foreground text-xs font-medium tabular-nums truncate', valueClass)}>
        {value}
      </p>
      <p className="text-[10px] text-muted-foreground truncate">{label}</p>
    </div>
  );
}

/* ============================================================
 * Header — greeting, today's date pulse strip, quick actions
 * ============================================================ */
const QUICK_ACTIONS_BY_ROLE = {
  super_admin: [
    { href: '/leads',        label: 'Open leads',     icon: Users },
    { href: '/users',        label: 'Add user',       icon: UserCog,   accent: true },
    { href: '/campaigns',    label: 'Campaigns',      icon: Megaphone },
    { href: '/ark-logs',     label: 'ARK logs',       icon: Webhook },
  ],
  admin: [
    { href: '/leads',        label: 'Open leads',     icon: Users },
    { href: '/users',        label: 'Add user',       icon: UserCog,   accent: true },
    { href: '/campaigns',    label: 'Campaigns',      icon: Megaphone },
    { href: '/reports',      label: 'Reports',        icon: BarChart3 },
  ],
  floor_manager: [
    { href: '/leads',        label: 'Open leads',     icon: Users,     accent: true },
    { href: '/groups',       label: 'Manage groups',  icon: UserCog },
    { href: '/campaigns',    label: 'Campaigns',      icon: Megaphone },
    { href: '/reports',      label: 'Reports',        icon: BarChart3 },
  ],
  senior: [
    { href: '/leads',        label: 'Team leads',     icon: Users,     accent: true },
    { href: '/deals',        label: 'Deals',          icon: Award },
    { href: '/reports',      label: 'Reports',        icon: BarChart3 },
  ],
  tele_sales: [
    { href: '/leads',        label: 'My leads',       icon: Users,     accent: true },
    { href: '/deals',        label: 'My deals',       icon: Award },
  ],
  back_office: [
    { href: '/leads',        label: 'Browse leads',   icon: Users },
    { href: '/deals',        label: 'Deals',          icon: Award },
    { href: '/reports',      label: 'Reports',        icon: BarChart3 },
  ],
  auditor: [
    { href: '/leads',        label: 'Browse leads',   icon: Users },
    { href: '/reports',      label: 'Reports',        icon: BarChart3 },
  ],
  archive: [
    { href: '/leads',        label: 'Archived leads', icon: Users },
  ],
};

function DashboardHeader({ greeting, roleLabel, role, err }) {
  const now = dayjs();
  const actions = QUICK_ACTIONS_BY_ROLE[role] || [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight leading-tight">
            {greeting}.
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Signed in as <span className="text-foreground font-medium">{roleLabel}</span>.
            {err && <span className="ml-2 text-amber-600 dark:text-amber-400">{err}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md border bg-card text-muted-foreground">
            <Calendar size={12} />
            <span className="font-medium text-foreground">{now.format('dddd')}</span>
            <span className="opacity-50">·</span>
            <span className="mono tabular-nums">{now.format('DD MMM YYYY')}</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-60" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
            </span>
            <span className="font-medium">Live</span>
          </div>
        </div>
      </div>

      {actions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {actions.map((a) => (
            <Link
              key={a.href + a.label}
              href={a.href}
              className={a.accent
                ? 'inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors'
                : 'inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium border bg-card text-foreground hover:bg-muted transition-colors'
              }
            >
              <a.icon size={13} />
              {a.label}
            </Link>
          ))}
        </div>
      )}
    </div>
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
