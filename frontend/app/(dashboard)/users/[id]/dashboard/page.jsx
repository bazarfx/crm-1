'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Settings2, Plus, ChevronUp, ChevronDown, EyeOff, Eye, RotateCcw, Check, Pencil, Calendar,
} from 'lucide-react';
import dayjs from 'dayjs';
import api, { unwrap } from '@/lib/api';
import useStore from '@/store/useStore';
import RoleGuard from '@/components/layout/RoleGuard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Popover, PopoverTrigger, PopoverContent,
} from '@/components/ui/popover';
import { LanguageBadge } from '@/components/shared/LanguageBadge';
import { cn } from '@/lib/utils';
import {
  USER_WIDGETS, DEFAULT_LAYOUT, spanClass,
} from '@/components/dashboard/userWidgets';

// Each viewer gets their own saved layout in localStorage so admin-A's tweaks
// don't override admin-B's. Key namespace also includes the dashboard type
// ('user_detail') so future dashboards (per-campaign, per-group, …) can reuse
// the same machinery without colliding. The layout is stored as JSON —
// trivially swappable to a server-side endpoint when we get there.
const LAYOUT_KEY = (viewerId) => `crm1.dashlayout.user_detail.${viewerId || 'anon'}`;

function loadLayout(viewerId) {
  if (typeof window === 'undefined') return DEFAULT_LAYOUT;
  try {
    const raw = window.localStorage.getItem(LAYOUT_KEY(viewerId));
    if (!raw) return DEFAULT_LAYOUT;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_LAYOUT;
    // Drop entries pointing at widgets we no longer ship, then append any
    // newly-shipped widgets at the end as hidden so they show up in the
    // catalogue without disturbing the user's current ordering.
    const known = new Set(Object.keys(USER_WIDGETS));
    const cleaned = parsed.filter((w) => w && known.has(w.id));
    const seen = new Set(cleaned.map((w) => w.id));
    for (const id of known) {
      if (!seen.has(id)) cleaned.push({ id, hidden: true });
    }
    return cleaned;
  } catch {
    return DEFAULT_LAYOUT;
  }
}

function saveLayout(viewerId, layout) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LAYOUT_KEY(viewerId), JSON.stringify(layout));
  } catch { /* quota or unavailable — silent */ }
}

export default function UserDashboardPage() {
  return (
    <RoleGuard
      allowedRoles={['super_admin', 'admin', 'floor_manager', 'senior', 'auditor', 'back_office']}
    >
      <UserDashboardContent />
    </RoleGuard>
  );
}

function UserDashboardContent() {
  const params = useParams();
  const router = useRouter();
  const viewer = useStore((s) => s.user);
  const isAdminOrAbove = viewer?.role === 'super_admin' || viewer?.role === 'admin';
  const targetId = params?.id;

  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [editing, setEditing] = useState(false);
  const [layout, setLayout] = useState(() => loadLayout(viewer?.id));

  // Date-range filter. `range` is one of 'all' | 'today' | 'week' | 'month'
  // | 'year' | 'custom'. For 'custom' the from/to inputs drive the request.
  const [range, setRange] = useState('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  // Re-hydrate the layout once we know who's viewing — Zustand may not
  // have settled on first render.
  useEffect(() => {
    setLayout(loadLayout(viewer?.id));
  }, [viewer?.id]);

  // Custom range only fires when both dates are filled, otherwise we'd
  // re-fetch on every keystroke with an invalid window.
  const customReady = range === 'custom' && customFrom && customTo;

  useEffect(() => {
    if (!targetId) return;
    let alive = true;

    const params = new URLSearchParams();
    if (range !== 'all') {
      if (range === 'custom') {
        if (!customReady) return undefined; // wait until both dates set
        params.set('range', 'custom');
        params.set('from', customFrom);
        params.set('to', customTo);
      } else {
        params.set('range', range);
      }
    }

    setLoading(true);
    api.get(`/users/${targetId}/stats?${params.toString()}`)
      .then((res) => { if (alive) setStats(unwrap(res) || null); })
      .catch((e) => {
        if (alive) setErr(e?.response?.data?.message || 'Could not load user stats');
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [targetId, range, customFrom, customTo, customReady]);

  const persist = useCallback((next) => {
    setLayout(next);
    saveLayout(viewer?.id, next);
  }, [viewer?.id]);

  const toggleHidden = (id) => persist(
    layout.map((w) => (w.id === id ? { ...w, hidden: !w.hidden } : w))
  );

  const move = (id, dir) => {
    const visible = layout.filter((w) => !w.hidden);
    const idx = visible.findIndex((w) => w.id === id);
    if (idx === -1) return;
    const newIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= visible.length) return;
    const reorderedVisible = [...visible];
    [reorderedVisible[idx], reorderedVisible[newIdx]] = [reorderedVisible[newIdx], reorderedVisible[idx]];
    const hidden = layout.filter((w) => w.hidden);
    persist([...reorderedVisible, ...hidden]);
  };

  const addWidget = (id) => {
    const existing = layout.find((w) => w.id === id);
    if (existing) {
      // Already in layout — unhide it.
      persist(layout.map((w) => (w.id === id ? { ...w, hidden: false } : w)));
    } else {
      persist([...layout, { id }]);
    }
  };

  const resetLayout = () => {
    if (!confirm('Reset to the default widget layout?')) return;
    persist(DEFAULT_LAYOUT);
  };

  const visibleWidgets = useMemo(
    () => layout.filter((w) => !w.hidden && USER_WIDGETS[w.id]),
    [layout]
  );

  const u = stats?.user;

  return (
    <div className="space-y-5">
      {/* ─── Header ─────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3 min-w-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/users')}
            className="mt-1"
          >
            <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />Users
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-semibold">
                {u ? `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email : 'Loading…'}
              </h1>
              {u?.role && (
                <span className="text-[10px] px-1.5 py-0.5 rounded border bg-muted/30 text-muted-foreground capitalize">
                  {u.role.replace(/_/g, ' ')}
                </span>
              )}
              {u && u.is_active === false && (
                <span className="text-[10px] px-1.5 py-0.5 rounded border border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300">
                  Inactive
                </span>
              )}
            </div>
            {u?.email && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {u.email}
                {u.created_at && (
                  <> · joined {new Date(u.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</>
                )}
              </p>
            )}
            {Array.isArray(u?.languages) && u.languages.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {u.languages.map((l) => <LanguageBadge key={l} language={l} size="xs" />)}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href={`/leads?assignee_id=${targetId}`}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border bg-card text-xs font-medium hover:bg-muted"
          >
            View their leads
          </Link>
          {isAdminOrAbove && (
            <Link
              href={`/users/${targetId}`}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border bg-card text-xs font-medium hover:bg-muted"
            >
              <Pencil className="h-3 w-3" />Edit profile
            </Link>
          )}
          <Button
            size="sm"
            variant={editing ? 'default' : 'outline'}
            onClick={() => setEditing((v) => !v)}
          >
            {editing ? (
              <><Check className="h-3.5 w-3.5 mr-1.5" />Done</>
            ) : (
              <><Settings2 className="h-3.5 w-3.5 mr-1.5" />Customize</>
            )}
          </Button>
        </div>
      </div>

      {/* ─── Date range picker ──────────────────────────────── */}
      <RangePicker
        range={range}
        onRangeChange={setRange}
        customFrom={customFrom}
        customTo={customTo}
        onCustomFrom={setCustomFrom}
        onCustomTo={setCustomTo}
        resolved={stats?.range}
      />

      {/* ─── Edit-mode toolbar ─────────────────────────────── */}
      {editing && (
        <Card className="border-blue-500/30 bg-blue-500/5">
          <CardContent className="p-3 flex items-center justify-between gap-2 flex-wrap">
            <p className="text-xs text-blue-700 dark:text-blue-300">
              <span className="font-medium">{visibleWidgets.length}</span> widget
              {visibleWidgets.length === 1 ? '' : 's'} visible.
              Use the ↑↓ arrows on each card to reorder, the eye to hide. Saved per-viewer.
            </p>
            <div className="flex items-center gap-2">
              <AddWidgetMenu layout={layout} onAdd={addWidget} />
              <Button size="sm" variant="ghost" onClick={resetLayout}>
                <RotateCcw className="h-3 w-3 mr-1.5" />Reset
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Error / loading states ─────────────────────────── */}
      {err && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-3 text-xs text-amber-800 dark:text-amber-200">
            {err}
          </CardContent>
        </Card>
      )}

      {loading && !stats && (
        <p className="text-xs text-muted-foreground">Loading stats…</p>
      )}

      {/* ─── Widget grid ─────────────────────────────────────
           4-col grid on lg; each widget claims 1/2/4 cols based on its
           registered span. No drag-and-drop — explicit ↑↓ arrows. */}
      {stats && visibleWidgets.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {visibleWidgets.map((w, idx) => {
            const def = USER_WIDGETS[w.id];
            const Component = def.render;
            return (
              <div key={w.id} className={cn('relative', spanClass(def.span))}>
                {editing && (
                  <div className="absolute -top-2 right-2 z-10 flex items-center gap-1 bg-background border rounded-md shadow-sm p-0.5">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      disabled={idx === 0}
                      onClick={() => move(w.id, 'up')}
                      title="Move up"
                    >
                      <ChevronUp className="h-3 w-3" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      disabled={idx === visibleWidgets.length - 1}
                      onClick={() => move(w.id, 'down')}
                      title="Move down"
                    >
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-red-400 hover:text-red-500"
                      onClick={() => toggleHidden(w.id)}
                      title="Hide widget"
                    >
                      <EyeOff className="h-3 w-3" />
                    </Button>
                  </div>
                )}
                <Component stats={stats} />
              </div>
            );
          })}
        </div>
      )}

      {/* Catalogue when no widgets are visible — recovery path so the
          page never goes completely blank. */}
      {stats && visibleWidgets.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">No widgets visible</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-3">
              Add one from the widget catalogue, or reset to the default layout.
            </p>
            <div className="flex gap-2">
              <AddWidgetMenu layout={layout} onAdd={addWidget} />
              <Button size="sm" variant="outline" onClick={resetLayout}>
                <RotateCcw className="h-3 w-3 mr-1.5" />Reset to default
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
 * Date-range picker — preset chips + a Custom option that
 * reveals two date inputs. Applies to all KPIs and breakdowns
 * (the 6-month trend widget stays fixed for historical context).
 * ────────────────────────────────────────────────────────── */
const RANGE_PRESETS = [
  { key: 'all',   label: 'All time' },
  { key: 'today', label: 'Today' },
  { key: 'week',  label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'year',  label: 'This year' },
  { key: 'custom', label: 'Custom' },
];

function RangePicker({ range, onRangeChange, customFrom, customTo, onCustomFrom, onCustomTo, resolved }) {
  // Human-readable resolved-range label so the user can confirm what the
  // backend actually applied (especially useful for the preset shorthand).
  const resolvedLabel = (() => {
    if (!resolved?.from || !resolved?.to) return 'all-time';
    const f = dayjs(resolved.from).format('DD MMM YYYY');
    const t = dayjs(resolved.to).format('DD MMM YYYY');
    return f === t ? f : `${f} → ${t}`;
  })();

  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
              <Calendar className="h-3 w-3" />
              Range
            </div>
            <div className="flex bg-muted/30 rounded-md p-0.5 flex-wrap">
              {RANGE_PRESETS.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => onRangeChange(r.key)}
                  className={cn(
                    'text-[11px] px-3 py-1 rounded transition-colors',
                    range === r.key
                      ? 'bg-background text-foreground font-medium shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
            {range === 'custom' && (
              <div className="inline-flex items-center gap-1.5">
                <Input
                  type="date"
                  value={customFrom}
                  onChange={(e) => onCustomFrom(e.target.value)}
                  className="h-7 text-[11px] w-[140px]"
                />
                <span className="text-muted-foreground text-xs">→</span>
                <Input
                  type="date"
                  value={customTo}
                  onChange={(e) => onCustomTo(e.target.value)}
                  className="h-7 text-[11px] w-[140px]"
                />
              </div>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground">
            Showing <span className="font-medium text-foreground">{resolvedLabel}</span>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

/* ──────────────────────────────────────────────────────────
 * Widget catalogue dropdown — lists every registered widget,
 * marks the ones already visible, and lets the viewer toggle
 * any of them on. Grouped by the registry's `group` field so
 * a future LLM-generated section can drop in cleanly.
 * ────────────────────────────────────────────────────────── */
function AddWidgetMenu({ layout, onAdd }) {
  const visibleIds = new Set(layout.filter((w) => !w.hidden).map((w) => w.id));
  const groups = useMemo(() => {
    const map = {};
    for (const [id, def] of Object.entries(USER_WIDGETS)) {
      const g = def.group || 'Other';
      if (!map[g]) map[g] = [];
      map[g].push({ id, ...def });
    }
    return Object.entries(map);
  }, []);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="h-3 w-3 mr-1.5" />Add widget
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 max-h-[60vh] overflow-y-auto">
        <p className="text-xs font-medium mb-2">Widget catalogue</p>
        <div className="space-y-3">
          {groups.map(([groupName, items]) => (
            <div key={groupName}>
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">
                {groupName}
              </p>
              <div className="space-y-1">
                {items.map((w) => {
                  const isVisible = visibleIds.has(w.id);
                  return (
                    <button
                      key={w.id}
                      type="button"
                      onClick={() => onAdd(w.id)}
                      className={cn(
                        'w-full flex items-center justify-between text-xs px-2 py-1.5 rounded hover:bg-muted/50',
                        isVisible && 'opacity-60',
                      )}
                    >
                      <span>{w.title}</span>
                      {isVisible ? (
                        <Eye className="h-3 w-3 text-emerald-500" />
                      ) : (
                        <Plus className="h-3 w-3 text-muted-foreground" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground mt-3 border-t pt-2">
          Future: LLM-generated widgets register here too. The layout is
          stored as JSON so generated widgets persist alongside built-ins.
        </p>
      </PopoverContent>
    </Popover>
  );
}
