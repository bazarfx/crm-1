'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, X, Check, Search, Trash2 } from 'lucide-react';
import dayjs from 'dayjs';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

/**
 * Unified, spec-driven horizontal filter rail — the single source of the
 * Linear/Airtable-grade chip filtering used across every CRM list page. It
 * renders native (non-custom-field) filters as inline popover-chips that match
 * components/dynamic/FilterChip exactly, so native + custom-field filters read
 * as one system.
 *
 * Props:
 *   spec     — array of native filter definitions (see shape below)
 *   filters  — the current filter state object
 *   onChange — (nextFilters) => void  (live-apply; the page resets page=1)
 *
 * Spec item:
 *   { key, label, kind, glyph, tint?, options?, width?, activeClass?,
 *     fromKey?, toKey?, presets?, capitalize? }
 *   kind: 'multi' (array) | 'single' (string) | 'daterange' | 'bool'
 *   daterange uses fromKey/toKey (default `${key}_from` / `${key}_to`).
 */

const RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background';

// Deterministic tint per chip when the spec doesn't pin one — keeps the rail
// colourful but stable across renders.
const TINTS = [
  'bg-violet-500/40', 'bg-indigo-500/40', 'bg-blue-500/40', 'bg-amber-500/40',
  'bg-teal-500/40', 'bg-emerald-500/40', 'bg-rose-500/40', 'bg-sky-500/40',
];
const BOOL_ACTIVE = [
  'border-teal-500/40 bg-teal-500/10 text-teal-700 dark:text-teal-300',
  'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
];

const fmt = (d) => (d ? dayjs(d).format('DD MMM') : '');

// ---------------------------------------------------------------------------
// Chip shell (active/inactive) with popover — mirrors dynamic/FilterChip.
// ---------------------------------------------------------------------------
function PopChip({ tint, glyph: Glyph, label, active, summary, onClear, width = 'w-[250px]', children }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div
        className={cn(
          'group inline-flex items-stretch h-8 rounded-lg border text-xs overflow-hidden transition-colors',
          active ? 'bg-card shadow-card' : 'bg-card/50',
          open ? 'border-primary/40 ring-1 ring-primary/40' : 'border-border hover:border-foreground/20',
        )}
      >
        {active && <span aria-hidden className={cn('w-[3px] self-stretch shrink-0', tint)} />}
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`${label} filter`}
            className={cn('flex items-center h-full gap-1.5 hover:bg-muted/40 transition-colors', active ? 'pl-2 pr-2' : 'px-2.5', RING)}
          >
            <Glyph className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className={cn(active ? 'text-muted-foreground' : 'text-muted-foreground font-medium')}>{label}</span>
            {active && summary && <span className="font-medium text-foreground max-w-[170px] truncate">{summary}</span>}
            {!active && <ChevronDown className="h-3 w-3 text-muted-foreground/60 shrink-0" />}
          </button>
        </PopoverTrigger>
        {active && onClear && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onClear(); }}
            aria-label={`Remove ${label} filter`}
            className={cn('flex items-center justify-center h-full w-7 border-l border-border/70 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors', RING)}
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      <PopoverContent align="start" className={cn('p-0 overflow-hidden', width)}>
        <div className="flex items-center gap-1.5 px-3 h-9 border-b border-border bg-muted/30">
          <Glyph className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-foreground">{label}</span>
        </div>
        {children({ close: () => setOpen(false) })}
      </PopoverContent>
    </Popover>
  );
}

function CheckList({ options, selected, onToggle, onClear, capitalize }) {
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? options.filter((o) => (o.label || '').toLowerCase().includes(s)) : options;
  }, [options, q]);

  return (
    <div>
      {options.length > 6 && (
        <div className="relative border-b border-border">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…"
            className="w-full h-9 pl-8 pr-2 text-sm bg-transparent focus:outline-none placeholder:text-muted-foreground"
          />
        </div>
      )}
      <div className="max-h-[240px] overflow-y-auto py-1">
        {filtered.length === 0 ? (
          <p className="px-3 py-5 text-center text-xs text-muted-foreground">No options match</p>
        ) : filtered.map((o) => {
          const on = selected.includes(o.value);
          return (
            <button
              key={o.value} type="button" onClick={() => onToggle(o.value)}
              className={cn('w-full flex items-center gap-2.5 h-8 px-3 text-sm text-left transition-colors hover:bg-muted', RING)}
            >
              <span className={cn('h-4 w-4 rounded-[4px] border flex items-center justify-center flex-shrink-0 transition-colors', on ? 'bg-foreground border-foreground text-background' : 'border-border')}>
                {on && <Check className="h-3 w-3" strokeWidth={3} />}
              </span>
              <span className={cn('truncate', capitalize && 'capitalize')}>{o.label}</span>
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-between px-3 h-10 border-t border-border bg-muted/20">
        <span className="text-[11px] text-muted-foreground">{selected.length} selected</span>
        {selected.length > 0 && (
          <button type="button" onClick={onClear} className={cn('inline-flex items-center gap-1 h-7 px-2 text-xs text-muted-foreground hover:text-destructive rounded-md hover:bg-destructive/10 transition-colors', RING)}>
            <Trash2 className="h-3 w-3" /> Clear
          </button>
        )}
      </div>
    </div>
  );
}

function SingleSelect({ options, value, onPick, allLabel = 'All', capitalize, required }) {
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? options.filter((o) => (o.label || '').toLowerCase().includes(s)) : options;
  }, [options, q]);
  const Radio = ({ on }) => (
    <span className={cn('h-3.5 w-3.5 rounded-full border flex items-center justify-center shrink-0', on ? 'border-foreground' : 'border-border')}>
      {on && <span className="h-1.5 w-1.5 rounded-full bg-foreground" />}
    </span>
  );
  return (
    <div>
      {options.length > 6 && (
        <div className="relative border-b border-border">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…"
            className="w-full h-9 pl-8 pr-2 text-sm bg-transparent focus:outline-none placeholder:text-muted-foreground" />
        </div>
      )}
      <div className="max-h-[260px] overflow-y-auto py-1">
        {!required && (
          <button type="button" onClick={() => onPick('')} className={cn('w-full flex items-center gap-2.5 h-8 px-3 text-sm text-left transition-colors hover:bg-muted', RING)}>
            <Radio on={!value} /><span className="text-muted-foreground">{allLabel}</span>
          </button>
        )}
        {filtered.length === 0 ? (
          <p className="px-3 py-5 text-center text-xs text-muted-foreground">No options match</p>
        ) : filtered.map((o) => (
          <button key={o.value} type="button" onClick={() => onPick(o.value)} className={cn('w-full flex items-center gap-2.5 h-8 px-3 text-sm text-left transition-colors hover:bg-muted', RING)}>
            <Radio on={o.value === value} /><span className={cn('truncate', capitalize && 'capitalize')}>{o.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

const DEFAULT_PRESETS = [
  { label: 'Today', from: () => dayjs(), to: () => dayjs() },
  { label: 'Last 7 days', from: () => dayjs().subtract(6, 'day'), to: () => dayjs() },
  { label: 'Last 30 days', from: () => dayjs().subtract(29, 'day'), to: () => dayjs() },
  { label: 'This month', from: () => dayjs().startOf('month'), to: () => dayjs() },
];

function DateBody({ from, to, onSet, presets = DEFAULT_PRESETS }) {
  return (
    <div className="p-3 space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {presets.map((p) => (
          <button key={p.label} type="button"
            onClick={() => onSet(p.from().format('YYYY-MM-DD'), p.to().format('YYYY-MM-DD'))}
            className={cn('inline-flex items-center h-7 px-2.5 rounded-md border border-border bg-card text-[11px] font-medium text-muted-foreground hover:text-foreground hover:border-foreground/20 hover:bg-muted/50 transition-colors', RING)}>
            {p.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">From</span>
          <input type="date" value={from || ''} onChange={(e) => onSet(e.target.value, to)} className={cn('w-full h-9 rounded-md border border-border bg-background px-2.5 text-xs text-foreground transition-shadow', RING)} />
        </label>
        <label className="space-y-1">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">To</span>
          <input type="date" value={to || ''} onChange={(e) => onSet(from, e.target.value)} className={cn('w-full h-9 rounded-md border border-border bg-background px-2.5 text-xs text-foreground transition-shadow', RING)} />
        </label>
      </div>
    </div>
  );
}

function ToggleChip({ glyph: Glyph, label, active, activeClass, onToggle }) {
  return (
    <button type="button" onClick={onToggle} aria-pressed={active}
      className={cn('inline-flex items-center h-8 gap-1.5 px-2.5 rounded-lg border text-xs font-medium transition-colors', RING,
        active ? activeClass : 'bg-card/50 border-border text-muted-foreground hover:text-foreground hover:border-foreground/20')}>
      {active ? <Check className="h-3.5 w-3.5 shrink-0" /> : <Glyph className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
      {label}
    </button>
  );
}

const multiSummary = (vals, options, capitalize) => {
  if (!vals.length) return '';
  const first = options.find((o) => o.value === vals[0])?.label || vals[0];
  const f = capitalize ? String(first).replace(/\b\w/g, (c) => c.toUpperCase()) : first;
  return vals.length > 1 ? `${f} +${vals.length - 1}` : f;
};

export default function FilterRail({ spec = [], filters = {}, onChange }) {
  const set = (patch) => onChange({ ...filters, ...patch });

  const items = spec.filter(Boolean);
  if (!items.length) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {items.map((f, i) => {
        const tint = f.tint || TINTS[i % TINTS.length];
        const cap = f.capitalize !== false;

        if (f.kind === 'bool') {
          return (
            <ToggleChip
              key={f.key}
              glyph={f.glyph}
              label={f.label}
              active={!!filters[f.key]}
              activeClass={f.activeClass || BOOL_ACTIVE[i % BOOL_ACTIVE.length]}
              onToggle={() => set({ [f.key]: !filters[f.key] })}
            />
          );
        }

        if (f.kind === 'daterange') {
          const fromKey = f.fromKey || `${f.key}_from`;
          const toKey = f.toKey || `${f.key}_to`;
          const fromV = filters[fromKey] || '';
          const toV = filters[toKey] || '';
          const active = !!(fromV || toV);
          const summary = fromV && toV ? (fromV === toV ? fmt(fromV) : `${fmt(fromV)} – ${fmt(toV)}`)
            : fromV ? `After ${fmt(fromV)}` : toV ? `Before ${fmt(toV)}` : '';
          return (
            <PopChip key={f.key || fromKey} tint={tint} glyph={f.glyph} label={f.label} active={active}
              summary={summary} width={f.width || 'w-[300px]'} onClear={() => set({ [fromKey]: '', [toKey]: '' })}>
              {() => <DateBody from={fromV} to={toV} presets={f.presets} onSet={(a, b) => set({ [fromKey]: a, [toKey]: b })} />}
            </PopChip>
          );
        }

        if (f.kind === 'single') {
          const val = filters[f.key] || '';
          // `required` filters always carry a value (a mode selector, e.g. the
          // sales-activity Role) — render them as always-active with no clear
          // affordance and no "All …" reset row.
          const summary = val ? (f.options?.find((o) => o.value === val)?.label || '1 selected') : '';
          return (
            <PopChip key={f.key} tint={tint} glyph={f.glyph} label={f.label} active={f.required || !!val}
              summary={summary} width={f.width || 'w-[280px]'} onClear={f.required ? undefined : () => set({ [f.key]: '' })}>
              {({ close }) => (
                <SingleSelect options={f.options || []} value={val} required={f.required}
                  allLabel={f.allLabel || `All ${f.label.toLowerCase()}`}
                  capitalize={cap} onPick={(v) => { set({ [f.key]: v }); close(); }} />
              )}
            </PopChip>
          );
        }

        // multi (default)
        const vals = filters[f.key] || [];
        return (
          <PopChip key={f.key} tint={tint} glyph={f.glyph} label={f.label} active={vals.length > 0}
            summary={multiSummary(vals, f.options || [], cap)} width={f.width} onClear={() => set({ [f.key]: [] })}>
            {() => (
              <CheckList options={f.options || []} selected={vals} capitalize={cap}
                onToggle={(v) => set({ [f.key]: vals.includes(v) ? vals.filter((x) => x !== v) : [...vals, v] })}
                onClear={() => set({ [f.key]: [] })} />
            )}
          </PopChip>
        );
      })}
    </div>
  );
}
