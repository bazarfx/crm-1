'use client';
import { useState } from 'react';
import { Check, X, Tag } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export function DynamicField({ definition, value, onChange, disabled, hideLabel, compact }) {
  const def = definition;
  if (!def) return null;
  const id = `cf_${def.field_key}`;

  const wrap = (control) => (
    <div className={cn('space-y-1.5', compact && 'space-y-1')}>
      {!hideLabel && (
        <Label htmlFor={id} className={cn('text-xs flex items-center gap-1.5', compact && 'text-[11px]')}>
          {def.label}
          {def.is_required && <span className="text-red-400">*</span>}
        </Label>
      )}
      {control}
      {def.helper_text && !compact && (
        <p className="text-[10px] text-muted-foreground">{def.helper_text}</p>
      )}
    </div>
  );

  switch (def.field_type) {
    case 'text':
    case 'phone':
    case 'email':
    case 'url':
    case 'file_link':
      return wrap(
        <Input
          id={id}
          type={def.field_type === 'email' ? 'email' : def.field_type === 'url' || def.field_type === 'file_link' ? 'url' : 'text'}
          value={value ?? ''}
          disabled={disabled}
          onChange={e => onChange(e.target.value)}
          className={cn('h-9 text-sm', compact && 'h-8 text-xs')}
        />
      );

    case 'long_text':
      return wrap(
        <Textarea
          id={id}
          value={value ?? ''}
          disabled={disabled}
          onChange={e => onChange(e.target.value)}
          rows={compact ? 2 : 3}
          className="text-sm"
        />
      );

    case 'number':
    case 'currency':
    case 'percent':
      return wrap(
        <Input
          id={id}
          type="number"
          value={value ?? ''}
          disabled={disabled}
          onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
          min={def.validation?.min}
          max={def.validation?.max}
          step={def.field_type === 'percent' ? '0.1' : '1'}
          className={cn('h-9 text-sm', compact && 'h-8 text-xs')}
        />
      );

    case 'date':
    case 'datetime':
      return wrap(
        <Input
          id={id}
          type={def.field_type === 'datetime' ? 'datetime-local' : 'date'}
          value={value ? String(value).slice(0, def.field_type === 'datetime' ? 16 : 10) : ''}
          disabled={disabled}
          onChange={e => onChange(e.target.value)}
          className={cn('h-9 text-sm', compact && 'h-8 text-xs')}
        />
      );

    case 'boolean': {
      // Three explicit states: true / false / unset. Switch alone can't
      // distinguish unset from false, so we render a small tri-state pill
      // group instead. Unset shows in amber so it stands out as "needs
      // a decision" rather than reading as a definitive No.
      const state = value === true ? 'yes' : value === false ? 'no' : 'unset';
      const isUnset = state === 'unset';
      const pill = (id, label, color) => (
        <button
          key={id}
          type="button"
          disabled={disabled}
          onClick={() => onChange(id === 'yes' ? true : id === 'no' ? false : null)}
          className={cn(
            'px-3 py-1 text-xs rounded border transition-colors flex-1',
            state === id
              ? `${color} font-medium`
              : 'bg-transparent border-border text-muted-foreground hover:bg-muted',
            disabled && 'opacity-50 cursor-not-allowed',
          )}
        >
          {state === id && <Check className="h-3 w-3 inline mr-1" />}
          {label}
        </button>
      );
      return wrap(
        <div className="space-y-1">
          <div className="flex gap-1.5">
            {pill('yes', 'Yes', 'bg-emerald-500/15 border-emerald-500/50 text-emerald-700 dark:text-emerald-300')}
            {pill('no',  'No',  'bg-slate-500/15 border-slate-500/50 text-slate-700 dark:text-slate-300')}
          </div>
          {isUnset && !def.is_required && (
            <p className="text-[10px] text-amber-600 dark:text-amber-400">
              Not set — answer Yes or No, or leave blank.
            </p>
          )}
        </div>
      );
    }

    case 'dropdown':
      return wrap(
        <Select value={value ?? ''} onValueChange={onChange} disabled={disabled}>
          <SelectTrigger className={cn('h-9 text-sm', compact && 'h-8 text-xs')}>
            <SelectValue placeholder="Select..." />
          </SelectTrigger>
          <SelectContent>
            {(def.options || []).map(opt => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );

    case 'multiselect':
      return wrap(<MultiSelect definition={def} value={value} onChange={onChange} disabled={disabled} />);

    case 'tags':
      return wrap(<TagsInput value={value} onChange={onChange} disabled={disabled} />);

    default:
      return wrap(<Input value={value ?? ''} disabled className="h-9 text-sm" />);
  }
}

function MultiSelect({ definition, value, onChange, disabled }) {
  const selected = Array.isArray(value) ? value : [];
  const toggle = (v) => {
    if (disabled) return;
    onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]);
  };
  return (
    <div className="flex flex-wrap gap-1.5">
      {(definition.options || []).map(opt => {
        const isOn = selected.includes(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => toggle(opt.value)}
            disabled={disabled}
            className={cn(
              'px-3 py-1 text-xs rounded border transition-colors',
              isOn
                ? 'bg-primary/10 border-primary/40 text-primary font-medium'
                : 'bg-transparent border-border hover:bg-muted text-muted-foreground',
              disabled && 'opacity-50 cursor-not-allowed'
            )}
          >
            {isOn && <Check className="h-3 w-3 inline mr-1" />}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function TagsInput({ value, onChange, disabled }) {
  const [input, setInput] = useState('');
  const tags = Array.isArray(value) ? value : [];
  const add = () => {
    const t = input.trim();
    if (!t || tags.includes(t)) return;
    onChange([...tags, t]);
    setInput('');
  };
  const remove = (t) => onChange(tags.filter(x => x !== t));
  return (
    <div>
      <div className="flex flex-wrap gap-1 mb-1.5">
        {tags.map(t => (
          <Badge key={t} variant="outline" className="text-[10px] gap-1">
            <Tag className="h-2.5 w-2.5" />
            {t}
            {!disabled && (
              <button onClick={() => remove(t)} className="hover:text-red-400">
                <X className="h-2.5 w-2.5" />
              </button>
            )}
          </Badge>
        ))}
      </div>
      <Input
        value={input}
        disabled={disabled}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } }}
        placeholder="Type and press Enter..."
        className="h-8 text-xs"
      />
    </div>
  );
}
