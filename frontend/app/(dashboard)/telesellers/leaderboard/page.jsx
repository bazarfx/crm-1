'use client';
import { useEffect, useState } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Award } from 'lucide-react';
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LanguageBadge } from '@/components/shared/LanguageBadge';
import RoleGuard from '@/components/layout/RoleGuard';
import api from '@/lib/api';
import { cn } from '@/lib/utils';

export default function LeaderboardPage() {
  return (
    <RoleGuard allowedRoles={['super_admin', 'admin', 'floor_manager']}>
      <LeaderboardContent />
    </RoleGuard>
  );
}

function LeaderboardContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const range = searchParams.get('range') || 'week';
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const fmtMoney = (n) => {
    n = Number(n || 0);
    if (n >= 10000000) return '₹' + (n / 10000000).toFixed(1) + 'Cr';
    if (n >= 100000) return '₹' + (n / 100000).toFixed(1) + 'L';
    if (n >= 1000) return '₹' + (n / 1000).toFixed(1) + 'k';
    return '₹' + Math.round(n);
  };

  useEffect(() => {
    setLoading(true);
    api
      .get(`/dashboard/top-performers?range=${range}&limit=200`)
      .then(({ data }) => setItems(data.data.items || []))
      .finally(() => setLoading(false));
  }, [range]);

  const setRange = (r) => router.replace(`${pathname}?range=${r}`);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard')}>
          <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />Dashboard
        </Button>
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Award className="h-5 w-5 text-emerald-400" />
            Telesellers leaderboard
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            All telesellers and seniors with FTDs
          </p>
        </div>
      </div>

      <div className="flex bg-muted/30 rounded-md p-0.5 w-fit">
        {['today', 'week', 'month'].map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={cn(
              'text-xs px-4 py-1.5 rounded transition-colors capitalize',
              range === r
                ? 'bg-background text-foreground font-medium shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {r === 'today' ? 'Today' : r === 'week' ? 'This week' : 'This month'}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            {items.length} performer{items.length !== 1 ? 's' : ''}
          </CardTitle>
          <CardDescription className="text-xs">
            Sorted by FTDs closed in selected period
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading && (
            <p className="text-xs text-muted-foreground text-center py-8">Loading...</p>
          )}
          {!loading && items.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-8">
              No FTDs in this period yet
            </p>
          )}
          {!loading && items.length > 0 && (
            <div className="divide-y">
              {items.map((p) => (
                <Link
                  key={p.user_id}
                  href={`/leads?assignee_id=${p.user_id}`}
                  className="grid grid-cols-[40px_36px_1fr_120px_100px_100px] gap-4 items-center px-5 py-3 hover:bg-muted/30 transition-colors"
                >
                  <span
                    className={cn(
                      'text-sm font-medium text-center',
                      p.rank === 1 && 'text-amber-400',
                      p.rank === 2 && 'text-slate-300',
                      p.rank === 3 && 'text-orange-400',
                      p.rank > 3 && 'text-muted-foreground',
                    )}
                  >
                    {p.rank}
                  </span>
                  <div className="w-8 h-8 rounded-full bg-purple-500/15 text-purple-300 flex items-center justify-center text-[11px] font-medium">
                    {p.first_name?.[0]}
                    {p.last_name?.[0]}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm">
                      {p.first_name} {p.last_name}
                    </p>
                    <p className="text-[10px] text-muted-foreground capitalize">
                      {p.role?.replace(/_/g, ' ')} · {p.email}
                    </p>
                  </div>
                  <div>
                    <div className="flex flex-wrap gap-1">
                      {(p.languages || []).map((l) => (
                        <LanguageBadge key={l} language={l} size="xs" />
                      ))}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] text-muted-foreground">{p.leads_worked} leads</p>
                  </div>
                  <div className="text-right">
                    <p className="text-base font-medium text-emerald-400">{p.ftd_count}</p>
                    <p className="text-[9px] text-muted-foreground">{fmtMoney(p.total_deposit)}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
