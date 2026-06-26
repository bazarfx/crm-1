'use client';

import { useMemo, useState } from 'react';
import { Check, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { fieldKind } from '@/lib/dynamicFilters';

const RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1';

/**
 * Pure, controlled per-type value editor for a single filter, tuned for a
 * narrow popover. `value` is the field's draft (see lib/dynamicFilters);
 * `onChange(next)` reports a new draft. The parent decides when to commit.
 */
export function FilterValueEditor({ definition: def, value, onChange, autoFocus }) {
  const kind = fieldKind(def);

  if (kind === 'choice') return <ChoiceEditor def={def} value={value} onChange={onChange} autoFocus={autoFocus} />;

  if (kind === 'numrange') {
    const v = value || { min: '', max: '' };
    const cur = def.field_type === 'currency' ? '₹' : '';
    const step = def.field_type === 'percent' ? '0.1' : '1';
    return (
      <div className="p-3 grid grid-cols-2 gap-2">
        <Bound label="Min" prefix={cur}>
          <Input type="number" step={step} autoFocus={autoFocus} value={v.min ?? ''}
            onChange={(e) => onChange({ ...v, min: e.target.value })}
            placeholder="−∞" className={cn('h-9 text-sm', cur && 'pl-6')} />
        </Bound>
        <Bound label="Max" prefix={cur}>
          <Input type="number" step={step} value={v.max ?? ''}
            onChange={(e) => onChange({ ...v, max: e.target.value })}
            placeholder="∞" className={cn('h-9 text-sm', cur && 'pl-6')} />
        </Bound>
      </div>
    );
  }

  if (kind === 'daterange') {
    const v = value || { min: '', max: '' };
    const t = def.field_type === 'datetime' ? 'datetime-local' : 'date';
    return (
      <div className="p-3 grid grid-cols-2 gap-2">
        <Bound label="From">
          <Input type={t} autoFocus={autoFocus} value={v.min ?? ''} onChange={(e) => onChange({ ...v, min: e.target.value })} className="h-9 text-sm" />
        </Bound>
        <Bound label="To">
          <Input type={t} value={v.max ?? ''} onChange={(e) => onChange({ ...v, max: e.target.value })} className="h-9 text-sm" />
        </Bound>
      </div>
    );
  }

  if (kind === 'bool') {
    const seg = (id, label) => (
      <button
        key={id}
        type="button"
        autoFocus={autoFocus && id === 'yes'}
        onClick={() => onChange(id === 'yes')}
        className={cn(
          'flex-1 h-9 text-sm rounded-md border transition-colors', RING,
          value === (id === 'yes')
            ? 'bg-foreground text-background border-foreground font-medium'
            : 'bg-card border-border text-muted-foreground hover:bg-muted',
        )}
      >
        {label}
      </button>
    );
    return <div className="p-3 flex gap-2">{seg('yes', 'Yes')}{seg('no', 'No')}</div>;
  }

  // text / email / phone / url / file_link / long_text / tags-without-options
  return (
    <div className="p-3">
      <Input
        autoFocus={autoFocus}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Contains…"
        className="h-9 text-sm"
      />
    </div>
  );
}

function ChoiceEditor({ def, value, onChange, autoFocus }) {
  const selected = Array.isArray(value) ? value : [];
  const [q, setQ] = useState('');
  const opts = def.options || [];
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? opts.filter((o) => (o.label || '').toLowerCase().includes(s)) : opts;
  }, [opts, q]);

  const toggle = (val) =>
    onChange(selected.includes(val) ? selected.filter((x) => x !== val) : [...selected, val]);

  if (opts.length === 0) {
    return <p className="p-3 text-[11px] text-muted-foreground italic">No options defined.</p>;
  }

  return (
    <div>
      {opts.length > 6 && (
        <div className="relative border-b border-border">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            autoFocus={autoFocus}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search options…"
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
              key={o.value}
              type="button"
              onClick={() => toggle(o.value)}
              className={cn('w-full flex items-center gap-2.5 h-8 px-3 text-sm text-left transition-colors hover:bg-muted', RING)}
            >
              <span className={cn(
                'h-4 w-4 rounded-[4px] border flex items-center justify-center flex-shrink-0 transition-colors',
                on ? 'bg-foreground border-foreground text-background' : 'border-border',
              )}>
                {on && <Check className="h-3 w-3" strokeWidth={3} />}
              </span>
              <span className="truncate">{o.label}</span>
            </button>
          );
        })}
      </div>
      {selected.length > 0 && (
        <div className="px-3 py-1.5 border-t border-border text-[11px] text-muted-foreground">
          {selected.length} selected
        </div>
      )}
    </div>
  );
}

function Bound({ label, prefix, children }) {
  return (
    <div className="space-y-1">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <div className="relative">
        {prefix && <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">{prefix}</span>}
        {children}
      </div>
    </div>
  );
}
