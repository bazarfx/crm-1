'use client';

import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';

/* ------------------------------------------------------------------
 * Color variants — gradient bg + icon tint, both for shadcn 'card'
 * surface in light AND dark mode
 * ------------------------------------------------------------------ */
const ACCENT_GRADIENT = {
  blue:    'from-blue-500/10 to-blue-500/0 border-l-blue-500',
  indigo:  'from-indigo-500/10 to-indigo-500/0 border-l-indigo-500',
  violet:  'from-violet-500/10 to-violet-500/0 border-l-violet-500',
  purple:  'from-purple-500/10 to-purple-500/0 border-l-purple-500',
  emerald: 'from-emerald-500/10 to-emerald-500/0 border-l-emerald-500',
  green:   'from-emerald-500/10 to-emerald-500/0 border-l-emerald-500',
  teal:    'from-teal-500/10 to-teal-500/0 border-l-teal-500',
  amber:   'from-amber-500/10 to-amber-500/0 border-l-amber-500',
  orange:  'from-orange-500/10 to-orange-500/0 border-l-orange-500',
  rose:    'from-rose-500/10 to-rose-500/0 border-l-rose-500',
  red:     'from-red-500/10 to-red-500/0 border-l-red-500',
  pink:    'from-pink-500/10 to-pink-500/0 border-l-pink-500',
  slate:   'from-slate-500/10 to-slate-500/0 border-l-slate-500',
};

const ICON_TINT = {
  blue:    'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  indigo:  'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400',
  violet:  'bg-violet-500/15 text-violet-600 dark:text-violet-400',
  purple:  'bg-purple-500/15 text-purple-600 dark:text-purple-400',
  emerald: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  green:   'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  teal:    'bg-teal-500/15 text-teal-600 dark:text-teal-400',
  amber:   'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  orange:  'bg-orange-500/15 text-orange-600 dark:text-orange-400',
  rose:    'bg-rose-500/15 text-rose-600 dark:text-rose-400',
  red:     'bg-red-500/15 text-red-600 dark:text-red-400',
  pink:    'bg-pink-500/15 text-pink-600 dark:text-pink-400',
  slate:   'bg-slate-500/15 text-slate-600 dark:text-slate-400',
};

/* requestAnimationFrame-based animated counter (cubic ease-out) */
function useNumberAnimation(value) {
  const nodeRef = useRef(null);
  useEffect(() => {
    if (!nodeRef.current) return;
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric)) {
      nodeRef.current.textContent = value ?? '—';
      return;
    }
    const start = 0;
    const end = numeric;
    const duration = 900;
    const startTime = performance.now();
    let rafId;
    const tick = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(start + (end - start) * eased);
      if (nodeRef.current) {
        nodeRef.current.textContent = current.toLocaleString('en-IN');
      }
      if (progress < 1) rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [value]);
  return nodeRef;
}

export default function StatCard({
  title,
  label,
  value,
  prefix,
  suffix,
  change,
  changeType,
  trend,
  trendLabel,
  icon: Icon,
  accentColor,
  accent,
  color,
  loading = false,
}) {
  const head = title || label || '';
  const colorKey = accentColor || accent || color || 'blue';
  const gradient = ACCENT_GRADIENT[colorKey] || ACCENT_GRADIENT.blue;
  const iconTint = ICON_TINT[colorKey] || ICON_TINT.blue;

  // back-compat: 'change' is a string label, 'trend' is a numeric %
  const numericTrend =
    typeof change === 'number' ? change : typeof trend === 'number' ? trend : null;
  const displayChange = change ?? (numericTrend !== null ? `${Math.abs(numericTrend)}%` : null);
  const direction =
    changeType ||
    (numericTrend !== null ? (numericTrend >= 0 ? 'up' : 'down') : 'neutral');

  const isNumeric = typeof value === 'number' || (typeof value === 'string' && /^-?\d+$/.test(value));
  const numberRef = useNumberAnimation(isNumeric ? Number(value) : null);

  if (loading) {
    return (
      <Card className="overflow-hidden border-l-4 border-l-blue-500/40">
        <CardContent className="p-5">
          <div className="shimmer h-3 w-24 rounded mb-3" />
          <div className="shimmer h-8 w-32 rounded mb-2" />
          <div className="shimmer h-3 w-20 rounded" />
        </CardContent>
      </Card>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      <Card className={cn('overflow-hidden bg-gradient-to-br border-l-4 elevate', gradient)}>
        <CardContent className="p-5">
          <div className="flex items-start justify-between mb-3">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {head}
            </p>
            {Icon && (
              <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg', iconTint)}>
                <Icon className="h-4 w-4" />
              </div>
            )}
          </div>

          <div className="flex items-baseline gap-1">
            {prefix && <span className="text-sm text-muted-foreground">{prefix}</span>}
            <span
              ref={isNumeric ? numberRef : null}
              className="font-mono text-3xl font-bold tracking-tight tabular-nums leading-none"
            >
              {isNumeric ? Number(value).toLocaleString('en-IN') : (value ?? '—')}
            </span>
            {suffix && <span className="text-sm text-muted-foreground">{suffix}</span>}
          </div>

          {displayChange !== null && displayChange !== undefined && (
            <div
              className={cn(
                'flex items-center gap-1 mt-3 text-xs font-medium',
                direction === 'up' && 'text-emerald-600 dark:text-emerald-400',
                direction === 'down' && 'text-red-600 dark:text-red-400',
                direction === 'neutral' && 'text-muted-foreground'
              )}
            >
              {direction === 'up' ? (
                <TrendingUp className="h-3 w-3" />
              ) : direction === 'down' ? (
                <TrendingDown className="h-3 w-3" />
              ) : (
                <Minus className="h-3 w-3" />
              )}
              <span>{displayChange}</span>
              {trendLabel && <span className="text-muted-foreground">· {trendLabel}</span>}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
