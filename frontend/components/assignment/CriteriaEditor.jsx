'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, X, ChevronDown, Check, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { fetchFieldDefinitions, visibleFields } from '@/lib/dynamic';
import { useAuth } from '@/hooks/useAuth';
import { useStore } from '@/store/useStore';
import api, { unwrap } from '@/lib/api';
import {
  operatorsFor, defaultOperator, typeFamily,
  isValueless, isRange,
} from '@/lib/filterOperators';

/**
 * Inline criteria builder — the same wire contract as the Leads Advanced filter
 * (see AdvancedFilterPanel), but laid out inline on a form page instead of a
 * popover. Controlled component:
 *
 *   value:    { match:'and'|'or', rules:[{field,source,type,operator,value,value2?}] } | null
 *   onChange: (nextValue | null) => void
 *
 * It always emits a fully-committed criteria object (or null when there are no
 * complete rules) so the parent form can validate + preview against it.
 */

const RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background';

// ── Native lead field catalog — identical to AdvancedFilterPanel.buildNativeFields.
const STATUS_FALLBACK = [
  'new', 'contacted', 'interested', 'not_interested', 'call_back',
  'account_opened', 'ftd_done', 'cold', 'dnd', 'inactive', 'reactive',
].map((v) => ({ value: v, label: v.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) }));

const LANGUAGE_FALLBACK = ['English', 'Hindi', 'Tamil', 'Telugu', 'Kannada', 'Marathi', 'Gujarati']
  .map((v) => ({ value: v.toLowerCase(), label: v }));

const SOURCE_FALLBACK = [
  { value: 'facebook_ads', label: 'Facebook Ads' },
  { value: 'instagram_ads', label: 'Instagram Ads' },
  { value: 'google_ads', label: 'Google Ads' },
  { value: 'website', label: 'Website' },
  { value: 'referral', label: 'Referral' },
  { value: 'manual', label: 'Manual' },
  { value: 'direct_ark', label: 'Direct ARK Signup' },
];

function normalizeOptions(rows, fallback) {
  if (Array.isArray(rows) && rows.length > 0) {
    return rows
      .filter((r) => r && (r.key || r.value))
      .map((r) => ({ value: r.value ?? r.key, label: r.label || r.key || r.value }));
  }
  return fallback;
}

function buildNativeFields(config, campaigns) {
  const statusOpts = normalizeOptions(config?.lead_status, STATUS_FALLBACK);
  const langOpts = normalizeOptions(config?.language, LANGUAGE_FALLBACK);
  const sourceOpts = normalizeOptions(config?.lead_source, SOURCE_FALLBACK);
  const campaignOpts = (campaigns || [])
    .filter((c) => c && c.id)
    .map((c) => ({ value: c.id, label: c.name || c.id }));

  return [
    { field: 'first_name', label: 'First name', type: 'text' },
    { field: 'last_name', label: 'Last name', type: 'text' },
    { field: 'email', label: 'Email', type: 'email' },
    { field: 'phone', label: 'Phone', type: 'phone' },
    { field: 'lead_status', label: 'Status', type: 'dropdown', options: statusOpts },
    { field: 'lead_source', label: 'Source', type: 'dropdown', options: sourceOpts },
    { field: 'language', label: 'Language', type: 'dropdown', options: langOpts },
    { field: 'campaign_id', label: 'Campaign', type: 'dropdown', options: campaignOpts },
    { field: 'city', label: 'City', type: 'text' },
    { field: 'state', label: 'State', type: 'text' },
    { field: 'ark_account_number', label: 'ARK account no.', type: 'text' },
    { field: 'deposited_amount', label: 'Deposit amount', type: 'currency' },
    { field: 'ftd_at', label: 'FTD date', type: 'date' },
    { field: 'created_at', label: 'Created date', type: 'date' },
  ].map((f) => ({ ...f, source: 'native' }));
}

// ── Inline single-select (mirrors AdvancedFilterPanel.InlineSelect). ─────────
function InlineSelect({ value, options, onChange, placeholder = 'Select…', className, searchable, ariaLabel }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const rootRef = useRef(null);
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') { setOpen(false); e.stopPropagation(); } };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? options.filter((o) => (o.label || '').toLowerCase().includes(s)) : options;
  }, [options, q]);

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex h-8 w-full items-center justify-between gap-1 rounded-lg border border-border bg-background px-2.5 text-xs transition-colors hover:border-foreground/20',
          RING,
        )}
      >
        <span className={cn('truncate', current ? 'text-foreground' : 'text-muted-foreground')}>
          {current?.label || placeholder}
        </span>
        <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 opacity-50 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute z-[70] mt-1 w-full min-w-[160px] rounded-lg border border-border bg-popover text-popover-foreground shadow-lg animate-modalIn">
          {searchable && options.length > 8 && (
            <div className="relative border-b border-border">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…"
                className="w-full h-8 pl-8 pr-2 text-xs bg-transparent focus:outline-none placeholder:text-muted-foreground"
              />
            </div>
          )}
          <div className="max-h-[240px] overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-muted-foreground">No matches</p>
            ) : filtered.map((o) => (
              <button
                key={o.value} type="button"
                onClick={() => { onChange(o.value); setOpen(false); setQ(''); }}
                className={cn('flex w-full items-center gap-2 h-8 px-2.5 text-left text-xs transition-colors hover:bg-muted', RING)}
              >
                <span className="flex h-3.5 w-3.5 items-center justify-center shrink-0">
                  {o.value === value && <Check className="h-3.5 w-3.5 text-foreground" />}
                </span>
                <span className="truncate">{o.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Choice multi-select (mirrors AdvancedFilterPanel.MultiChoice). ───────────
function MultiChoice({ value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const rootRef = useRef(null);
  const selected = Array.isArray(value) ? value : [];

  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') { setOpen(false); e.stopPropagation(); } };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? options.filter((o) => (o.label || '').toLowerCase().includes(s)) : options;
  }, [options, q]);

  const toggle = (val) =>
    onChange(selected.includes(val) ? selected.filter((x) => x !== val) : [...selected, val]);

  const summary = selected.length === 0
    ? 'Select values…'
    : selected.length <= 2
      ? selected.map((v) => options.find((o) => o.value === v)?.label || v).join(', ')
      : `${selected.length} selected`;

  return (
    <div ref={rootRef} className="relative w-full">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex h-8 w-full items-center justify-between gap-1 rounded-lg border border-border bg-background px-2.5 text-xs transition-colors hover:border-foreground/20',
          RING,
        )}
      >
        <span className={cn('truncate', selected.length ? 'text-foreground' : 'text-muted-foreground')}>{summary}</span>
        <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 opacity-50 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute z-[70] mt-1 w-full min-w-[180px] rounded-lg border border-border bg-popover text-popover-foreground shadow-lg animate-modalIn">
          {options.length > 8 && (
            <div className="relative border-b border-border">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…"
                className="w-full h-8 pl-8 pr-2 text-xs bg-transparent focus:outline-none placeholder:text-muted-foreground"
              />
            </div>
          )}
          <div className="max-h-[220px] overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-muted-foreground">No matches</p>
            ) : filtered.map((o) => {
              const on = selected.includes(o.value);
              return (
                <button
                  key={o.value} type="button" onClick={() => toggle(o.value)}
                  className={cn('flex w-full items-center gap-2.5 h-8 px-2.5 text-left text-xs transition-colors hover:bg-muted', RING)}
                >
                  <span className={cn('h-4 w-4 rounded-[4px] border flex items-center justify-center shrink-0', on ? 'bg-foreground border-foreground text-background' : 'border-border')}>
                    {on && <Check className="h-3 w-3" strokeWidth={3} />}
                  </span>
                  <span className="truncate">{o.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Per-type value input (mirrors AdvancedFilterPanel.ValueInput). ───────────
function ValueInput({ field, operator, value, value2, onChange }) {
  if (isValueless(operator)) return null;

  const family = typeFamily(field.type);

  if (family === 'boolean') {
    const seg = (id, label) => (
      <button
        key={id} type="button"
        onClick={() => onChange({ value: id })}
        className={cn(
          'flex-1 h-8 text-xs rounded-lg border transition-colors', RING,
          value === id
            ? 'bg-foreground text-background border-foreground font-medium'
            : 'bg-background border-border text-muted-foreground hover:bg-muted',
        )}
      >
        {label}
      </button>
    );
    return <div className="flex gap-1.5 w-full">{seg('true', 'Yes')}{seg('false', 'No')}</div>;
  }

  if (family === 'choice') {
    return (
      <MultiChoice
        value={Array.isArray(value) ? value : []}
        options={field.options || []}
        onChange={(vals) => onChange({ value: vals })}
      />
    );
  }

  const inputType = family === 'date'
    ? (field.type === 'datetime' ? 'datetime-local' : 'date')
    : family === 'number' ? 'number' : 'text';
  const step = field.type === 'percent' ? '0.1' : undefined;
  const prefix = field.type === 'currency' ? '₹' : '';
  const placeholder = family === 'number' ? '0' : family === 'date' ? '' : 'Value…';

  if (isRange(operator)) {
    return (
      <div className="grid grid-cols-2 gap-1.5 w-full">
        <div className="relative">
          {prefix && <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">{prefix}</span>}
          <Input
            type={inputType} step={step} value={value ?? ''} placeholder={family === 'number' ? 'Min' : 'From'}
            onChange={(e) => onChange({ value: e.target.value, value2 })}
            className={cn('h-8 text-xs', prefix && 'pl-5')}
          />
        </div>
        <div className="relative">
          {prefix && <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">{prefix}</span>}
          <Input
            type={inputType} step={step} value={value2 ?? ''} placeholder={family === 'number' ? 'Max' : 'To'}
            onChange={(e) => onChange({ value, value2: e.target.value })}
            className={cn('h-8 text-xs', prefix && 'pl-5')}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full">
      {prefix && <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">{prefix}</span>}
      <Input
        type={inputType} step={step} value={value ?? ''} placeholder={placeholder}
        onChange={(e) => onChange({ value: e.target.value })}
        className={cn('h-8 text-xs', prefix && 'pl-5')}
      />
    </div>
  );
}

// ── Draft <-> wire helpers (mirrors AdvancedFilterPanel). ────────────────────
let ridSeq = 0;
const newRid = () => `cr${++ridSeq}`;

function blankRule(field) {
  const f = field;
  return {
    _rid: newRid(),
    field: f?.field ?? '',
    source: f?.source ?? 'native',
    type: f?.type ?? 'text',
    operator: f ? defaultOperator(f.type) : 'contains',
    value: typeFamily(f?.type) === 'choice' ? [] : '',
    value2: '',
  };
}

function ruleReady(rule) {
  if (!rule.field) return false;
  if (isValueless(rule.operator)) return true;
  if (typeFamily(rule.type) === 'choice') return Array.isArray(rule.value) && rule.value.length > 0;
  if (isRange(rule.operator)) return rule.value !== '' && rule.value != null && rule.value2 !== '' && rule.value2 != null;
  return rule.value !== '' && rule.value != null;
}

function fromCriteria(criteria) {
  if (!criteria || !Array.isArray(criteria.rules) || criteria.rules.length === 0) return null;
  return {
    match: criteria.match === 'or' ? 'or' : 'and',
    rules: criteria.rules.map((r) => ({
      _rid: newRid(),
      field: r.field,
      source: r.source || 'native',
      type: r.type || 'text',
      operator: r.operator,
      value: r.value ?? (typeFamily(r.type) === 'choice' ? [] : ''),
      value2: r.value2 ?? '',
    })),
  };
}

function buildCriteria(match, rules) {
  const ready = rules.filter(ruleReady).map((r) => {
    const rule = { field: r.field, source: r.source, type: r.type, operator: r.operator };
    if (!isValueless(r.operator)) {
      rule.value = r.value;
      if (isRange(r.operator)) rule.value2 = r.value2;
    }
    return rule;
  });
  return ready.length ? { match, rules: ready } : null;
}

/** Cheap structural signature so we only re-emit onChange on real changes. */
function sig(criteria) {
  return JSON.stringify(criteria);
}

export default function CriteriaEditor({ value, onChange, campaigns = [] }) {
  const { role } = useAuth();
  const config = useStore((s) => s.config);

  const [customDefs, setCustomDefs] = useState([]);
  const [match, setMatch] = useState(value?.match === 'or' ? 'or' : 'and');
  const [rules, setRules] = useState(() => fromCriteria(value)?.rules || []);
  const lastEmitted = useRef(sig(value || null));

  const nativeFields = useMemo(() => buildNativeFields(config, campaigns), [config, campaigns]);

  // Load lead custom fields (best-effort — native fields keep working offline).
  useEffect(() => {
    if (!role) return;
    fetchFieldDefinitions({ entity_type: 'lead' })
      .then((defs) => setCustomDefs(visibleFields(defs, role)))
      .catch(() => { /* native-only fallback */ });
  }, [role]);

  const fieldCatalog = useMemo(() => {
    const customEntries = customDefs.map((d) => ({
      field: d.field_key,
      label: d.label,
      type: d.field_type,
      source: 'custom',
      options: d.options || [],
    }));
    return [...nativeFields, ...customEntries];
  }, [nativeFields, customDefs]);

  const fieldByKey = useMemo(() => {
    const m = new Map();
    for (const f of fieldCatalog) m.set(`${f.source}:${f.field}`, f);
    return m;
  }, [fieldCatalog]);

  const fieldOptions = useMemo(
    () => fieldCatalog.map((f) => ({ value: `${f.source}:${f.field}`, label: f.label })),
    [fieldCatalog],
  );

  // Emit committed criteria to the parent whenever the local draft changes,
  // guarding against redundant onChange calls (which would loop with value).
  useEffect(() => {
    const next = buildCriteria(match, rules);
    const nextSig = sig(next);
    if (nextSig !== lastEmitted.current) {
      lastEmitted.current = nextSig;
      onChange?.(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match, rules]);

  // Reconcile if the parent replaces `value` externally (e.g. edit-load).
  useEffect(() => {
    const incoming = sig(value || null);
    if (incoming !== lastEmitted.current) {
      lastEmitted.current = incoming;
      const draft = fromCriteria(value);
      setMatch(draft?.match || 'and');
      setRules(draft?.rules || []);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const patchRule = (rid, patch) =>
    setRules((prev) => prev.map((r) => (r._rid === rid ? { ...r, ...patch } : r)));

  const changeField = (rid, compositeKey) => {
    const f = fieldByKey.get(compositeKey);
    if (!f) return;
    setRules((prev) => prev.map((r) => {
      if (r._rid !== rid) return r;
      const nextFamily = typeFamily(f.type);
      const prevFamily = typeFamily(r.type);
      const familyChanged = nextFamily !== prevFamily;
      return {
        ...r,
        field: f.field,
        source: f.source,
        type: f.type,
        operator: familyChanged ? defaultOperator(f.type) : r.operator,
        value: familyChanged ? (nextFamily === 'choice' ? [] : '') : r.value,
        value2: familyChanged ? '' : r.value2,
      };
    }));
  };

  const changeOperator = (rid, operator) =>
    setRules((prev) => prev.map((r) => {
      if (r._rid !== rid) return r;
      return { ...r, operator, value2: isRange(operator) ? r.value2 : '' };
    }));

  const addRule = () => setRules((prev) => [...prev, blankRule(fieldCatalog[0])]);
  const removeRule = (rid) => setRules((prev) => prev.filter((r) => r._rid !== rid));

  return (
    <div className="rounded-lg border border-border bg-muted/20 overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 h-10 border-b border-border bg-muted/30">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Conditions
        </span>
        {rules.length > 1 && (
          <div className="inline-flex items-center rounded-lg border border-border overflow-hidden text-[11px]">
            <span className="px-2 text-muted-foreground">Match</span>
            {['and', 'or'].map((m) => (
              <button
                key={m} type="button" onClick={() => setMatch(m)}
                className={cn(
                  'h-6 px-2.5 font-medium uppercase transition-colors', RING,
                  match === m ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted',
                )}
              >
                {m}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="p-3 space-y-2">
        {rules.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">
            No conditions yet — add one to describe which leads this rule applies to.
          </p>
        ) : rules.map((r, idx) => {
          const showValue = !isValueless(r.operator);
          return (
            <div key={r._rid} className="flex items-start gap-1.5">
              <div className="w-9 shrink-0 pt-1.5 text-right">
                {idx === 0 ? (
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Where</span>
                ) : (
                  <span className="text-[10px] uppercase tracking-wide font-medium text-foreground/70">{match}</span>
                )}
              </div>

              <InlineSelect
                ariaLabel="Field"
                className="w-[150px] shrink-0"
                value={`${r.source}:${r.field}`}
                options={fieldOptions}
                onChange={(k) => changeField(r._rid, k)}
                placeholder="Field"
                searchable
              />

              <InlineSelect
                ariaLabel="Operator"
                className={cn('shrink-0', showValue ? 'w-[130px]' : 'flex-1')}
                value={r.operator}
                options={operatorsFor(r.type)}
                onChange={(op) => changeOperator(r._rid, op)}
                placeholder="Operator"
              />

              {showValue && (
                <div className="flex-1 min-w-0">
                  <ValueInput
                    field={fieldByKey.get(`${r.source}:${r.field}`) || { type: r.type, options: [] }}
                    operator={r.operator}
                    value={r.value}
                    value2={r.value2}
                    onChange={(patch) => patchRule(r._rid, patch)}
                  />
                </div>
              )}

              <button
                type="button"
                onClick={() => removeRule(r._rid)}
                aria-label="Remove condition"
                className={cn('shrink-0 mt-0.5 h-8 w-7 inline-flex items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors', RING)}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}

        <button
          type="button"
          onClick={addRule}
          className={cn(
            'inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-dashed border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:border-foreground/30 hover:bg-muted/50 transition-colors',
            RING,
          )}
        >
          <Plus className="h-3.5 w-3.5" /> Add condition
        </button>
      </div>
    </div>
  );
}
