'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, SlidersHorizontal, Search, ArrowLeft } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { glyphFor, typeLabel } from '@/lib/fieldTypeMeta';
import {
  fieldKind, emptyDraft, paramsToDraft, activeChips, writeField,
} from '@/lib/dynamicFilters';
import { FilterValueEditor } from './FilterValueEditor';

const RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background';

const POP_WIDTH = {
  choice: 'w-[250px]', numrange: 'w-[270px]', daterange: 'w-[300px]', bool: 'w-[200px]', text: 'w-[260px]',
};

/** The "+ Filter" trigger + property picker + first-value capture (one motion). */
export function AddFilterMenu({ fields, filters, onChange, hasChips }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [pendingKey, setPendingKey] = useState(null);
  const [draft, setDraft] = useState(null);

  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const timer = useRef(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // Only offer fields that aren't already active (active fields are editable
  // via their chips).
  const activeKeys = useMemo(
    () => new Set(activeChips(fields, filters).map((c) => c.key)),
    [fields, filters],
  );
  const available = useMemo(
    () => fields.filter((d) => !activeKeys.has(d.field_key)),
    [fields, activeKeys],
  );
  const matched = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? available.filter((d) => (d.label || '').toLowerCase().includes(q)) : available;
  }, [available, query]);

  // Group matches by section.
  const groups = useMemo(() => {
    const m = new Map();
    for (const d of matched) {
      const s = d.section || 'Custom';
      if (!m.has(s)) m.set(s, []);
      m.get(s).push(d);
    }
    return Array.from(m.entries());
  }, [matched]);
  const showHeaders = groups.length > 1;

  const pendingDef = pendingKey ? fields.find((d) => d.field_key === pendingKey) : null;

  const reset = () => { setPendingKey(null); setQuery(''); setDraft(null); };
  const onOpen = (v) => { setOpen(v); if (!v) reset(); };

  const pick = (def) => {
    setPendingKey(def.field_key);
    setDraft(emptyDraft(def));
    setQuery('');
  };

  const commit = (d) => onChange(writeField(pendingDef, d, filtersRef.current));
  const handleEdit = (d) => {
    setDraft(d);
    if (fieldKind(pendingDef) === 'text') {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => commit(d), 300);
    } else {
      commit(d);
    }
  };

  return (
    <Popover open={open} onOpenChange={onOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Add filter"
          className={cn(
            'inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border text-xs font-medium transition-colors', RING,
            open
              ? 'border-solid border-primary/40 text-foreground bg-muted/40 ring-1 ring-primary/30'
              : 'border-dashed border-border bg-transparent text-muted-foreground hover:text-foreground hover:border-foreground/30 hover:bg-muted/50',
          )}
        >
          {hasChips ? <Plus className="h-3.5 w-3.5" /> : <SlidersHorizontal className="h-3.5 w-3.5" />}
          Filter
        </button>
      </PopoverTrigger>

      {/* PHASE B — value editor for the just-picked field */}
      {pendingDef ? (
        <PopoverContent align="start" className={cn('p-0 overflow-hidden', POP_WIDTH[fieldKind(pendingDef)] || 'w-[260px]')}>
          <div className="flex items-center gap-1 px-2 h-9 border-b border-border bg-muted/30">
            <button
              type="button"
              onClick={() => { setPendingKey(null); setDraft(null); }}
              aria-label="Back to fields"
              className={cn('h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground', RING)}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </button>
            {(() => { const G = glyphFor(pendingDef); return <G className="h-3.5 w-3.5 text-muted-foreground" />; })()}
            <span className="text-xs font-medium text-foreground">{pendingDef.label}</span>
          </div>
          <FilterValueEditor definition={pendingDef} value={draft} onChange={handleEdit} autoFocus />
          <div className="flex items-center justify-end px-3 h-10 border-t border-border bg-muted/20">
            <button
              type="button"
              onClick={() => onOpen(false)}
              className={cn('inline-flex items-center h-7 px-3 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors', RING)}
            >
              Done
            </button>
          </div>
        </PopoverContent>
      ) : (
        /* PHASE A — searchable property picker */
        <PopoverContent align="start" className="w-[248px] p-1">
          <div className="relative border-b border-border -m-1 mb-1 px-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by field…"
              aria-label="Filter by field"
              className="w-full h-9 pl-8 pr-2 text-sm bg-transparent focus:outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-[280px] overflow-y-auto py-1">
            {matched.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                {available.length === 0 ? 'All fields are filtered.' : `No fields match “${query}”.`}
              </p>
            ) : groups.map(([section, defs]) => (
              <div key={section}>
                {showHeaders && (
                  <p className="px-2 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground select-none">
                    {section}
                  </p>
                )}
                {defs.map((def) => {
                  const G = glyphFor(def);
                  return (
                    <button
                      key={def.field_key}
                      type="button"
                      onClick={() => pick(def)}
                      className={cn('group/row flex w-full items-center gap-2 h-8 px-2 rounded-md text-sm text-left transition-colors hover:bg-muted', RING)}
                    >
                      <G className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="flex-1 truncate text-foreground">{def.label}</span>
                      <span className="text-[10px] text-muted-foreground opacity-0 group-hover/row:opacity-100 transition-opacity">
                        {typeLabel(def)}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </PopoverContent>
      )}
    </Popover>
  );
}
