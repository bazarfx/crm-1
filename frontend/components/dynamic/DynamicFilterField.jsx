'use client';

import { Check } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { fieldKind } from '@/lib/dynamicFilters';

// Matches the shadcn Button/Input focus treatment for hand-rolled buttons.
const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1';

/**
 * Filter-specific input for a custom field (NOT the form input). The control
 * matches the field type's filtering semantics — multi-select chips for choice
 * fields, min–max for ranges, tri-state for boolean, contains for text.
 * `value` is the per-field draft (see lib/dynamicFilters), `onChange(next)`
 * reports the new draft.
 */
export function DynamicFilterField({ definition: def, value, onChange }) {
  const kind = fieldKind(def);

  if (kind === 'choice') {
    const selected = Array.isArray(value) ? value : [];
    const toggle = (v) =>
      onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
    const opts = def.options || [];
    if (opts.length === 0) {
      return <p className="text-[11px] text-muted-foreground italic">No options defined.</p>;
    }
    return (
      <div className="flex flex-wrap gap-1.5">
        {opts.map((o) => {
          const on = selected.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => toggle(o.value)}
              className={cn(
                'inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-xs border transition-colors',
                FOCUS_RING,
                on
                  ? 'bg-foreground text-background border-foreground font-medium'
                  : 'bg-card border-border text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {on && <Check className="h-3 w-3" />}
              {o.label}
            </button>
          );
        })}
      </div>
    );
  }

  if (kind === 'numrange') {
    const v = value || { min: '', max: '' };
    const cur = def.field_type === 'currency' ? '₹' : '';
    const step = def.field_type === 'percent' ? '0.1' : '1';
    return (
      <div className="grid grid-cols-2 gap-2">
        <RangeInput label="Min" prefix={cur}>
          <Input
            type="number" step={step} value={v.min ?? ''}
            onChange={(e) => onChange({ ...v, min: e.target.value })}
            placeholder="–∞" className={cn('h-9 text-sm', cur && 'pl-6')}
          />
        </RangeInput>
        <RangeInput label="Max" prefix={cur}>
          <Input
            type="number" step={step} value={v.max ?? ''}
            onChange={(e) => onChange({ ...v, max: e.target.value })}
            placeholder="∞" className={cn('h-9 text-sm', cur && 'pl-6')}
          />
        </RangeInput>
      </div>
    );
  }

  if (kind === 'daterange') {
    const v = value || { min: '', max: '' };
    const inputType = def.field_type === 'datetime' ? 'datetime-local' : 'date';
    return (
      <div className="grid grid-cols-2 gap-2">
        <RangeInput label="From">
          <Input type={inputType} value={v.min ?? ''} onChange={(e) => onChange({ ...v, min: e.target.value })} className="h-9 text-sm" />
        </RangeInput>
        <RangeInput label="To">
          <Input type={inputType} value={v.max ?? ''} onChange={(e) => onChange({ ...v, max: e.target.value })} className="h-9 text-sm" />
        </RangeInput>
      </div>
    );
  }

  if (kind === 'bool') {
    const cur = value === true ? 'yes' : value === false ? 'no' : 'any';
    const btn = (id, label) => (
      <button
        key={id}
        type="button"
        onClick={() => onChange(id === 'yes' ? true : id === 'no' ? false : null)}
        className={cn(
          'flex-1 h-8 text-xs rounded-md border transition-colors',
          FOCUS_RING,
          cur === id
            ? 'bg-foreground text-background border-foreground font-medium'
            : 'bg-card border-border text-muted-foreground hover:bg-muted',
        )}
      >
        {label}
      </button>
    );
    return <div className="flex gap-1.5">{btn('any', 'Any')}{btn('yes', 'Yes')}{btn('no', 'No')}</div>;
  }

  // text / email / phone / url / file_link / long_text / tags-without-options
  return (
    <Input
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Contains…"
      className="h-9 text-sm"
    />
  );
}

function RangeInput({ label, prefix, children }) {
  return (
    <div className="space-y-1">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <div className="relative">
        {prefix && (
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
            {prefix}
          </span>
        )}
        {children}
      </div>
    </div>
  );
}
