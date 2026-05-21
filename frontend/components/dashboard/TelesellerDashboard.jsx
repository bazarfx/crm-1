'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useTheme } from 'next-themes';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import {
  Phone, TrendingUp, Users, Clock, PhoneOff, PhoneMissed, PhoneIncoming,
  Target, Calendar,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import StatCard from '@/components/shared/StatCard';
import StatusBadge from '@/components/shared/StatusBadge';
import api, { unwrap } from '@/lib/api';

const container = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
const item = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } },
};

const OUTCOME_COLORS = {
  interested:     '#10B981',
  not_interested: '#EF4444',
  no_answer:      '#6B7280',
  busy:           '#F59E0B',
  call_back:      '#3B82F6',
};

const OUTCOME_ICON = {
  interested:     PhoneIncoming,
  not_interested: PhoneOff,
  no_answer:      PhoneMissed,
  busy:           Phone,
  call_back:      Calendar,
};

const STATUS_COLORS = {
  new:            '#6366F1',
  contacted:      '#3B82F6',
  interested:     '#8B5CF6',
  not_interested: '#EF4444',
  call_back:      '#F59E0B',
  account_opened: '#14B8A6',
  ftd_done:       '#10B981',
  cold:           '#6B7280',
  dnd:            '#DC2626',
  inactive:       '#9CA3AF',
  reactive:       '#F97316',
};

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover text-popover-foreground p-2.5 shadow-lg text-xs">
      {label !== undefined && label !== null && (
        <p className="font-medium mb-1 capitalize">{String(label).replace(/_/g, ' ')}</p>
      )}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: p.color || p.fill || p.payload?.fill }}
          />
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

export default function TelesellerDashboard() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const axisColor = isDark ? '#64748B' : '#94A3B8';
  const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)';

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const res = await api.get('/reports/my-dashboard');
        if (!alive) return;
        setData(unwrap(res) || null);
      } catch (e) {
        if (!alive) return;
        if (e?.response?.status === 404) {
          setErr('Personal dashboard endpoint not yet available (Terminal 1 — /reports/my-dashboard pending).');
        } else if (e?.code === 'ERR_NETWORK') {
          setErr('Backend not reachable on :5000');
        } else {
          setErr('Could not load personal dashboard');
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const ov = data?.overview || {};
  const cs = data?.call_stats || {};
  const outcomes = data?.call_outcomes || [];
  const status = data?.status_breakdown || [];
  const groups = data?.group_stats || [];
  const recent = data?.recent_leads || [];

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-5">
      {err && (
        <motion.div variants={item}>
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardContent className="p-4 text-sm text-amber-600 dark:text-amber-400">
              {err}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Row 1: Key stats */}
      <motion.div variants={item} className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          title="My Total Leads"
          value={ov.total_leads ?? '—'}
          icon={Users}
          accentColor="blue"
          loading={loading}
        />
        <StatCard
          title="Deals Closed (FTD)"
          value={ov.ftd_count ?? '—'}
          icon={Target}
          accentColor="emerald"
          loading={loading}
          suffix={
            ov.total_leads && ov.conversion_rate !== undefined
              ? ` (${ov.conversion_rate}%)`
              : ''
          }
        />
        <StatCard
          title="Accounts Opened"
          value={ov.account_opened ?? '—'}
          icon={TrendingUp}
          accentColor="teal"
          loading={loading}
        />
        <StatCard
          title="Calls Today"
          value={cs.calls_today ?? '—'}
          icon={Phone}
          accentColor="violet"
          loading={loading}
        />
      </motion.div>

      {/* Row 2: Call outcomes + Status breakdown */}
      <motion.div variants={item} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Call outcomes */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-muted-foreground" />
              Call outcomes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="text-center p-2 bg-muted/50 rounded-lg">
                <div className="text-lg font-bold tabular-nums">{cs.total_calls ?? 0}</div>
                <div className="text-[10px] text-muted-foreground">Total calls</div>
              </div>
              <div className="text-center p-2 bg-emerald-500/10 rounded-lg">
                <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                  {cs.interested ?? 0}
                </div>
                <div className="text-[10px] text-muted-foreground">Interested</div>
              </div>
              <div className="text-center p-2 bg-amber-500/10 rounded-lg">
                <div className="text-lg font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                  {cs.call_back_pending ?? 0}
                </div>
                <div className="text-[10px] text-muted-foreground">Callbacks due</div>
              </div>
            </div>

            {outcomes.length > 0 ? (
              outcomes.map((o, i) => {
                const total = Math.max(cs.total_calls || 1, 1);
                const count = parseInt(o.count, 10) || 0;
                const pct = Math.round((count / total) * 100);
                const color = OUTCOME_COLORS[o.call_outcome] || '#6B7280';
                const Icon = OUTCOME_ICON[o.call_outcome] || Phone;
                return (
                  <div key={i} className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 w-28 flex-shrink-0">
                      <Icon className="h-3.5 w-3.5 flex-shrink-0" style={{ color }} />
                      <span className="text-xs text-muted-foreground capitalize">
                        {(o.call_outcome || '').replace(/_/g, ' ')}
                      </span>
                    </div>
                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{
                          duration: 0.8,
                          ease: [0.16, 1, 0.3, 1],
                          delay: i * 0.05,
                        }}
                        style={{ background: color }}
                        className="h-full rounded-full"
                      />
                    </div>
                    <span className="text-xs font-mono w-8 text-right text-muted-foreground tabular-nums">
                      {count}
                    </span>
                  </div>
                );
              })
            ) : (
              !loading && (
                <p className="text-xs text-muted-foreground text-center py-4">
                  No calls logged yet
                </p>
              )
            )}

            {cs.total_duration_minutes > 0 && (
              <div className="flex items-center gap-2 pt-2 border-t text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                Total talk time:{' '}
                <span className="font-medium text-foreground">
                  {cs.total_duration_minutes} minutes
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Status breakdown */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>My lead pipeline</CardTitle>
          </CardHeader>
          <CardContent>
            {status.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={status} margin={{ top: 0, right: 0, left: -25, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                  <XAxis
                    dataKey="lead_status"
                    tick={{ fill: axisColor, fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => (v || '').slice(0, 8)}
                  />
                  <YAxis
                    tick={{ fill: axisColor, fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: 'hsl(var(--muted) / 0.4)' }} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {status.map((e, i) => (
                      <Cell key={i} fill={STATUS_COLORS[e.lead_status] || '#6366F1'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-12">
                {loading ? 'Loading…' : 'No leads in pipeline yet'}
              </p>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Row 3: Group performance */}
      {groups.length > 0 && (
        <motion.div variants={item} className="space-y-2">
          <h3 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            My groups — team performance
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {groups.map((g) => (
              <Card key={g.group_id} className="overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="text-sm font-medium">{g.group_name}</p>
                      <Badge variant="secondary" className="text-[10px] mt-1 capitalize">
                        {g.language}
                      </Badge>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                        {g.ftd_count ?? 0}
                      </p>
                      <p className="text-[10px] text-muted-foreground">deals closed</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-sm font-semibold tabular-nums">{g.total_leads ?? 0}</p>
                      <p className="text-[10px] text-muted-foreground">leads</p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold tabular-nums">{g.accounts_opened ?? 0}</p>
                      <p className="text-[10px] text-muted-foreground">accounts</p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                        {g.conversion_rate ?? 0}%
                      </p>
                      <p className="text-[10px] text-muted-foreground">converted</p>
                    </div>
                  </div>
                  {g.top_performers?.length > 0 && (
                    <div className="mt-3 pt-3 border-t space-y-1">
                      {g.top_performers.map((p, j) => (
                        <div key={j} className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground truncate">{p.name}</span>
                          <span className="font-mono text-blue-600 dark:text-blue-400 tabular-nums">
                            {p.leads} leads
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </motion.div>
      )}

      {/* Row 4: Recent leads */}
      <motion.div variants={item}>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Recent leads</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-3 font-medium text-muted-foreground">Name</th>
                    <th className="text-left p-3 font-medium text-muted-foreground hidden sm:table-cell">
                      Phone
                    </th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-left p-3 font-medium text-muted-foreground hidden md:table-cell">
                      Last contact
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((lead) => (
                    <tr
                      key={lead.id}
                      className="border-b last:border-0 hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => router.push(`/leads/${lead.id}`)}
                    >
                      <td className="p-3 font-medium">
                        {lead.first_name} {lead.last_name}
                        {lead.ftd_at && (
                          <span className="ml-2 text-emerald-600 dark:text-emerald-400 font-mono text-[10px]">
                            FTD
                          </span>
                        )}
                      </td>
                      <td className="p-3 font-mono text-muted-foreground hidden sm:table-cell">
                        {lead.phone}
                      </td>
                      <td className="p-3">
                        <StatusBadge status={lead.lead_status} />
                      </td>
                      <td className="p-3 text-muted-foreground hidden md:table-cell">
                        {lead.last_contact_date
                          ? new Date(lead.last_contact_date).toLocaleDateString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                            })
                          : '—'}
                      </td>
                    </tr>
                  ))}
                  {recent.length === 0 && !loading && (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-muted-foreground">
                        No leads assigned yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
