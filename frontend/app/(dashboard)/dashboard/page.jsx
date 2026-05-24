'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Award, Megaphone } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LanguageBadge } from '@/components/shared/LanguageBadge';
import api from '@/lib/api';
import useStore from '@/store/useStore';
import { cn } from '@/lib/utils';

export default function DashboardPage() {
  const { user, isAdmin, isSuperAdmin } = useStore();
  const isManagement = isAdmin || isSuperAdmin || user?.role === 'floor_manager';

  const [summary, setSummary] = useState(null);
  const [performersRange, setPerformersRange] = useState('today');
  const [performers, setPerformers] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [unassignedCount, setUnassignedCount] = useState(0);

  useEffect(() => {
    api.get('/dashboard/summary').then(({ data }) => setSummary(data.data)).catch(() => {});
    if (isManagement) {
      api.get('/dashboard/top-campaigns?range=week&limit=5')
        .then(({ data }) => setCampaigns(data.data.items || []))
        .catch(() => {});
      api.get('/leads/unassigned/summary')
        .then(({ data }) => setUnassignedCount(data.data.total || 0))
        .catch(() => {});
    }
  }, [isManagement]);

  useEffect(() => {
    if (!isManagement) return;
    api.get(`/dashboard/top-performers?range=${performersRange}&limit=10`)
      .then(({ data }) => setPerformers(data.data.items || []))
      .catch(() => {});
  }, [performersRange, isManagement]);

  const fmt = (n) => Number(n || 0).toLocaleString('en-IN');
  const fmtMoney = (n) => {
    n = Number(n || 0);
    if (n >= 10000000) return '₹' + (n / 10000000).toFixed(1) + 'Cr';
    if (n >= 100000) return '₹' + (n / 100000).toFixed(1) + 'L';
    if (n >= 1000) return '₹' + (n / 1000).toFixed(1) + 'k';
    return '₹' + Math.round(n);
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Welcome back, {user?.first_name}
        </p>
      </div>

      {isManagement && unassignedCount > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-3 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm text-amber-200">
              <span className="font-medium">{unassignedCount}</span>{' '}
              unassigned {unassignedCount === 1 ? 'lead needs' : 'leads need'} attention
            </p>
            <Button asChild size="sm" variant="outline">
              <Link href="/leads?lead_status=unassigned">
                Review <ArrowRight className="h-3 w-3 ml-1" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-blue-500/30 bg-blue-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-[11px] uppercase tracking-wider text-blue-300 font-medium">
              Today
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-blue-300">Leads</p>
                <p className="text-3xl font-medium text-blue-200 mt-1">
                  {fmt(summary?.today?.leads)}
                </p>
                {summary?.today?.leads_delta_vs_yesterday !== undefined && (
                  <p className="text-[10px] text-blue-400 mt-1">
                    {summary.today.leads_delta_vs_yesterday >= 0 ? '+' : ''}
                    {summary.today.leads_delta_vs_yesterday} from yesterday
                  </p>
                )}
              </div>
              <div>
                <p className="text-xs text-blue-300">Deals closed</p>
                <p className="text-3xl font-medium text-emerald-400 mt-1">
                  {fmt(summary?.today?.deals)}
                </p>
                <p className="text-[10px] text-blue-400 mt-1">
                  {fmtMoney(summary?.today?.deposits_total)} deposited
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
              Recent activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-background/50 border rounded-md p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">
                  This week
                </p>
                <div className="space-y-1.5">
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs text-muted-foreground">Leads</span>
                    <span className="text-base font-medium">{fmt(summary?.this_week?.leads)}</span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs text-muted-foreground">Deals</span>
                    <span className="text-base font-medium text-emerald-400">
                      {fmt(summary?.this_week?.deals)}
                    </span>
                  </div>
                </div>
              </div>
              <div className="bg-background/50 border rounded-md p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">
                  This month
                </p>
                <div className="space-y-1.5">
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs text-muted-foreground">Leads</span>
                    <span className="text-base font-medium">{fmt(summary?.this_month?.leads)}</span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-xs text-muted-foreground">Deals</span>
                    <span className="text-base font-medium text-emerald-400">
                      {fmt(summary?.this_month?.deals)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {isManagement && (
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-sm flex items-center gap-2">
                <Award className="h-4 w-4 text-emerald-400" />
                Top performers
              </CardTitle>
              <CardDescription className="text-xs">
                Telesellers ranked by FTDs closed
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex bg-muted/30 rounded-md p-0.5">
                {['today', 'week', 'month'].map((r) => (
                  <button
                    key={r}
                    onClick={() => setPerformersRange(r)}
                    className={cn(
                      'text-[11px] px-3 py-1 rounded transition-colors capitalize',
                      performersRange === r
                        ? 'bg-background text-foreground font-medium shadow-sm'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {r === 'today' ? 'Today' : r === 'week' ? 'This week' : 'This month'}
                  </button>
                ))}
              </div>
              <Button asChild size="sm" variant="ghost" className="h-7 text-xs">
                <Link href={`/telesellers/leaderboard?range=${performersRange}`}>
                  View all <ArrowRight className="h-3 w-3 ml-1" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {performers.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">
                No FTDs{' '}
                {performersRange === 'today'
                  ? 'today'
                  : performersRange === 'week'
                    ? 'this week'
                    : 'this month'}{' '}
                yet
              </p>
            ) : (
              <div className="divide-y">
                {performers.map((p) => (
                  <Link
                    key={p.user_id}
                    href={`/leads?assignee_id=${p.user_id}`}
                    className="grid grid-cols-[28px_32px_1fr_80px_70px] gap-3 items-center px-4 py-2.5 hover:bg-muted/30 transition-colors"
                  >
                    <span className="text-xs text-muted-foreground font-medium text-center">
                      {p.rank}
                    </span>
                    <div className="w-7 h-7 rounded-full bg-purple-500/15 text-purple-300 flex items-center justify-center text-[10px] font-medium">
                      {p.first_name?.[0]}
                      {p.last_name?.[0]}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm truncate">
                        {p.first_name} {p.last_name}
                      </p>
                      <div className="flex items-center gap-1 mt-0.5">
                        {(p.languages || []).slice(0, 3).map((l) => (
                          <LanguageBadge key={l} language={l} size="xs" />
                        ))}
                        {(p.languages || []).length > 3 && (
                          <span className="text-[9px] text-muted-foreground">
                            +{p.languages.length - 3}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] text-muted-foreground">{p.leads_worked} leads</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-emerald-400">
                        {p.ftd_count} FTD{p.ftd_count !== 1 ? 's' : ''}
                      </p>
                      <p className="text-[9px] text-muted-foreground">{fmtMoney(p.total_deposit)}</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {isManagement && campaigns.length > 0 && (
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-sm flex items-center gap-2">
                <Megaphone className="h-4 w-4 text-blue-400" />
                Top campaigns
              </CardTitle>
              <CardDescription className="text-xs">Best converting this week</CardDescription>
            </div>
            <Button asChild size="sm" variant="ghost" className="h-7 text-xs">
              <Link href="/campaigns">
                View all <ArrowRight className="h-3 w-3 ml-1" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <div className="grid grid-cols-[1fr_70px_70px_80px] gap-3 px-4 py-2 border-b text-[9px] text-muted-foreground uppercase tracking-wider">
              <span>Campaign</span>
              <span className="text-right">Leads</span>
              <span className="text-right">Deals</span>
              <span className="text-right">Conv. rate</span>
            </div>
            <div className="divide-y">
              {campaigns.map((c) => (
                <div
                  key={c.campaign_id}
                  className="grid grid-cols-[1fr_70px_70px_80px] gap-3 items-center px-4 py-2.5 hover:bg-muted/30"
                >
                  <div className="min-w-0">
                    <p className="text-xs truncate">{c.name}</p>
                    <p className="text-[10px] text-muted-foreground capitalize">
                      {c.platform} · {c.language}
                    </p>
                  </div>
                  <p className="text-xs text-right">{fmt(c.leads)}</p>
                  <p className="text-xs text-right text-emerald-400 font-medium">{fmt(c.deals)}</p>
                  <p className="text-sm text-right text-teal-400 font-medium">
                    {c.conversion_rate}%
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
