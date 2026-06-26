'use client';

import { useEffect, useRef, useState } from 'react';
import { X, Trash2 } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { glyphFor } from '@/lib/fieldTypeMeta';
import {
  fieldKind, chipParts, paramsToDraft, paramKeysFor, removeChip, writeField,
} from '@/lib/dynamicFilters';
import { FilterValueEditor } from './FilterValueEditor';

const RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring';

const TINT = {
  choice: 'bg-violet-500/40',
  numrange: 'bg-blue-500/40',
  daterange: 'bg-amber-500/40',
  bool: 'bg-teal-500/40',
  text: 'bg-slate-400/40',
};

const POP_WIDTH = {
  choice: 'w-[250px]', numrange: 'w-[270px]', daterange: 'w-[300px]', bool: 'w-[200px]', text: 'w-[260px]',
};

/** One committed filter, rendered as an editable Linear/Airtable-style chip. */
export function FilterChip({ definition: def, filters, onChange }) {
  const kind = fieldKind(def);
  const Glyph = glyphFor(def);
  const { operator, value } = chipParts(def, filters);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => paramsToDraft(def, filters));

  // Always commit against the latest filters so sibling filters are preserved.
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const timer = useRef(null);

  // Reseed only on open so a parent re-render (another chip applying) can't
  // clobber an in-progress edit.
  useEffect(() => {
    if (open) setDraft(paramsToDraft(def, filtersRef.current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const commit = (d) => onChange(writeField(def, d, filtersRef.current));
  const handleEdit = (d) => {
    setDraft(d);
    if (kind === 'text') {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => commit(d), 300);
    } else {
      commit(d);
    }
  };
  const remove = (e) => {
    e?.stopPropagation();
    onChange(removeChip(filters, paramKeysFor(def)));
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div
        className={cn(
          'group inline-flex items-stretch h-8 rounded-lg border bg-card text-xs overflow-hidden transition-colors shadow-card',
          open ? 'border-primary/40 ring-1 ring-primary/40' : 'border-border hover:border-foreground/20',
        )}
      >
        <span aria-hidden className={cn('w-[3px] self-stretch shrink-0', TINT[kind] || 'bg-border')} />
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`Edit ${def.label} filter`}
            className={cn('flex items-center h-full pl-2 pr-2 gap-1.5 hover:bg-muted/40 transition-colors', RING)}
          >
            <Glyph className={cn('h-3.5 w-3.5 shrink-0', open ? 'text-foreground/70' : 'text-muted-foreground')} />
            <span className="text-muted-foreground">{def.label}</span>
            <span className="text-[11px] font-normal text-muted-foreground/70 px-0.5">{operator}</span>
            <span className="font-medium text-foreground max-w-[200px] truncate">{value}</span>
          </button>
        </PopoverTrigger>
        <button
          type="button"
          onClick={remove}
          aria-label={`Remove ${def.label} filter`}
          className={cn('flex items-center justify-center h-full w-7 border-l border-border/70 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors', RING)}
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      <PopoverContent align="start" className={cn('p-0 overflow-hidden', POP_WIDTH[kind] || 'w-[260px]')}>
        <div className="flex items-center gap-1.5 px-3 h-9 border-b border-border bg-muted/30">
          <Glyph className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-foreground">{def.label}</span>
          <span className="text-[11px] text-muted-foreground/70">· {operator}</span>
        </div>
        <FilterValueEditor definition={def} value={draft} onChange={handleEdit} autoFocus />
        <div className="flex items-center justify-end px-3 h-10 border-t border-border bg-muted/20">
          <button
            type="button"
            onClick={remove}
            className={cn('inline-flex items-center gap-1 h-7 px-2 text-xs text-muted-foreground hover:text-destructive rounded-md hover:bg-destructive/10 transition-colors', RING)}
          >
            <Trash2 className="h-3 w-3" /> Clear
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
