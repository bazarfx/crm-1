'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  PanelLeftClose, PanelLeftOpen, Search, Plus, X, Check, ChevronDown,
  Bookmark, Users, Loader2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { fetchFieldDefinitions, visibleFields } from '@/lib/dynamic';
import { useAuth } from '@/hooks/useAuth';
import { useStore } from '@/store/useStore';
import {
  operatorsFor, defaultOperator, typeFamily,
  isValueless, isRange,
} from '@/lib/filterOperators';
import { listViews, createView, deleteView } from '@/lib/savedViews';

const RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background';

// Roles allowed to publish a view to the whole team. Mirrors the backend's
// SHARE_ROLES — the checkbox is only enabled for these, and the backend forces
// is_shared=false for everyone else regardless.
const MANAGER_ROLES = ['super_admin', 'admin', 'floor_manager'];

// ---------------------------------------------------------------------------
// Native lead field catalog — MIRRORS AdvancedFilterPanel.buildNativeFields so
// the sidebar, the advanced-filter popover, and the criteria editor all speak
// the exact same wire shape. Options for choice fields hydrate from Config with
// a static fallback so the sidebar is always usable offline.
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Inline single-select (mirrors AdvancedFilterPanel.InlineSelect) — the shadcn
// Select clips inside the narrow sidebar column, so we use a same-flow menu.
// ---------------------------------------------------------------------------
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
          'flex h-7 w-full items-center justify-between gap-1 rounded-md border border-border bg-background px-2 text-xs transition-colors hover:border-foreground/20',
          RING,
        )}
      >
        <span className={cn('truncate', current ? 'text-foreground' : 'text-muted-foreground')}>
          {current?.label || placeholder}
        </span>
        <ChevronDown className={cn('h-3 w-3 shrink-0 opacity-50 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute z-[70] mt-1 w-full min-w-[150px] rounded-lg border border-border bg-popover text-popover-foreground shadow-lg animate-modalIn">
          {searchable && options.length > 8 && (
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

// ---------------------------------------------------------------------------
// Choice multi-select (mirrors AdvancedFilterPanel.MultiChoice). Value string[].
// ---------------------------------------------------------------------------
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
          'flex h-7 w-full items-center justify-between gap-1 rounded-md border border-border bg-background px-2 text-xs transition-colors hover:border-foreground/20',
          RING,
        )}
      >
        <span className={cn('truncate', selected.length ? 'text-foreground' : 'text-muted-foreground')}>{summary}</span>
        <ChevronDown className={cn('h-3 w-3 shrink-0 opacity-50 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute z-[70] mt-1 w-full min-w-[170px] rounded-lg border border-border bg-popover text-popover-foreground shadow-lg animate-modalIn">
          {options.length > 8 && (
            <div className="relative border-b border-border">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…"
                className="w-full h-8 pl-8 pr-2 text-xs bg-transparent focus:outline-none placeholder:text-muted-foreground"
              />
            </div>
          )}
          <div className="max-h-[200px] overflow-y-auto py-1">
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

// ---------------------------------------------------------------------------
// Per-type value input (mirrors AdvancedFilterPanel.ValueInput). Stacks under
// its field row in the narrow sidebar column.
// ---------------------------------------------------------------------------
function ValueInput({ field, operator, value, value2, onChange }) {
  if (isValueless(operator)) return null;

  const family = typeFamily(field.type);

  if (family === 'boolean') {
    const seg = (id, label) => (
      <button
        key={id} type="button"
        onClick={() => onChange({ value: id })}
        className={cn(
          'flex-1 h-7 text-xs rounded-md border transition-colors', RING,
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
            className={cn('h-7 text-xs', prefix && 'pl-5')}
          />
        </div>
        <div className="relative">
          {prefix && <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">{prefix}</span>}
          <Input
            type={inputType} step={step} value={value2 ?? ''} placeholder={family === 'number' ? 'Max' : 'To'}
            onChange={(e) => onChange({ value, value2: e.target.value })}
            className={cn('h-7 text-xs', prefix && 'pl-5')}
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
        className={cn('h-7 text-xs', prefix && 'pl-5')}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Draft <-> wire helpers (mirror AdvancedFilterPanel / CriteriaEditor). A draft
// carries a client-only `_rid` so React keys stay stable across edits.
// ---------------------------------------------------------------------------
let ridSeq = 0;
const newRid = () => `fs${++ridSeq}`;

function ruleReady(rule) {
  if (!rule.field) return false;
  if (isValueless(rule.operator)) return true;
  if (typeFamily(rule.type) === 'choice') return Array.isArray(rule.value) && rule.value.length > 0;
  if (isRange(rule.operator)) return rule.value !== '' && rule.value != null && rule.value2 !== '' && rule.value2 != null;
  return rule.value !== '' && rule.value != null;
}

function fromCriteria(criteria) {
  if (!criteria || !Array.isArray(criteria.rules) || criteria.rules.length === 0) {
    return { match: 'and', rules: [] };
  }
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

const sig = (c) => JSON.stringify(c ?? null);

// ---------------------------------------------------------------------------
// The sidebar.
// ---------------------------------------------------------------------------
export default function FilterSidebar({
  entityType = 'lead',
  filters = {},
  criteria = null,
  onApply,
  currentColumns = null,
  currentSort = null,
  campaigns = [],
  className,
}) {
  const { role } = useAuth();
  const config = useStore((s) => s.config);
  const currentUserId = useStore((s) => s.user?.id);
  const canShare = MANAGER_ROLES.includes(role);

  // ── Saved views ──────────────────────────────────────────────────────────
  const [views, setViews] = useState([]);
  const [loadingViews, setLoadingViews] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveShared, setSaveShared] = useState(false);

  const refreshViews = useCallback(() => {
    setLoadingViews(true);
    listViews(entityType)
      .then((items) => setViews(items || []))
      .catch(() => setViews([]))
      .finally(() => setLoadingViews(false));
  }, [entityType]);

  useEffect(() => { refreshViews(); }, [refreshViews]);

  const applyView = (view) => {
    onApply?.({
      filters: view.filters || {},
      criteria: view.criteria || null,
    });
    toast.success(`Applied "${view.name}"`);
  };

  const submitSave = async () => {
    const name = saveName.trim();
    if (!name) { toast.error('Name the view first'); return; }
    setSaving(true);
    try {
      await createView({
        entity_type: entityType,
        name,
        is_shared: canShare ? saveShared : false,
        filters,
        criteria,
        columns: currentColumns,
        sort: currentSort,
      });
      toast.success('View saved');
      setShowSaveForm(false);
      setSaveName('');
      setSaveShared(false);
      refreshViews();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to save view');
    } finally {
      setSaving(false);
    }
  };

  const removeView = async (view) => {
    if (!window.confirm(`Delete saved view "${view.name}"?`)) return;
    try {
      await deleteView(view.id);
      toast.success('View deleted');
      refreshViews();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to delete');
    }
  };

  // ── Field catalog (native + custom) ──────────────────────────────────────
  const [customDefs, setCustomDefs] = useState([]);
  useEffect(() => {
    if (!role) return;
    fetchFieldDefinitions({ entity_type: entityType })
      .then((defs) => setCustomDefs(visibleFields(defs, role)))
      .catch(() => { /* native-only fallback */ });
  }, [role, entityType]);

  const nativeFields = useMemo(() => buildNativeFields(config, campaigns), [config, campaigns]);
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

  // ── Criteria draft (the "Filter by fields" builder) ──────────────────────
  const [match, setMatch] = useState('and');
  const [rules, setRules] = useState([]);
  const lastEmitted = useRef(sig(criteria));

  // Reconcile drafts when the page replaces `criteria` externally (applying a
  // saved view, clearing all, etc.). Guard against the echo of our own emit.
  useEffect(() => {
    const incoming = sig(criteria);
    if (incoming !== lastEmitted.current) {
      lastEmitted.current = incoming;
      const draft = fromCriteria(criteria);
      setMatch(draft.match);
      setRules(draft.rules);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [criteria]);

  // Debounced live-apply — emit the committed criteria 300ms after edits settle
  // (so typing a value doesn't fire a request per keystroke), passing the
  // page's current `filters` through untouched.
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  useEffect(() => {
    const next = buildCriteria(match, rules);
    const nextSig = sig(next);
    if (nextSig === lastEmitted.current) return undefined;
    const t = setTimeout(() => {
      lastEmitted.current = nextSig;
      onApply?.({ filters: filtersRef.current, criteria: next });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match, rules]);

  const patchRule = (rid, patch) =>
    setRules((prev) => prev.map((r) => (r._rid === rid ? { ...r, ...patch } : r)));

  const changeOperator = (rid, operator) =>
    setRules((prev) => prev.map((r) => (r._rid === rid
      ? { ...r, operator, value2: isRange(operator) ? r.value2 : '' }
      : r)));

  const removeRule = (rid) => setRules((prev) => prev.filter((r) => r._rid !== rid));

  // Clicking a field in the list adds a fresh rule for it (default operator,
  // empty value) — the Zoho "add criteria" gesture.
  const addFieldRule = (f) => {
    const nextFamily = typeFamily(f.type);
    setRules((prev) => [...prev, {
      _rid: newRid(),
      field: f.field,
      source: f.source,
      type: f.type,
      operator: defaultOperator(f.type),
      value: nextFamily === 'choice' ? [] : '',
      value2: '',
    }]);
  };

  // Set of composite keys already present as a rule (used to mark fields active
  // in the list — clicking an already-active field still stacks another rule,
  // matching Zoho, but the marker hints it's in play).
  const activeFieldKeys = useMemo(
    () => new Set(rules.map((r) => `${r.source}:${r.field}`)),
    [rules],
  );

  // ── Field search ─────────────────────────────────────────────────────────
  const [fieldQuery, setFieldQuery] = useState('');
  const visibleFieldList = useMemo(() => {
    const s = fieldQuery.trim().toLowerCase();
    if (!s) return fieldCatalog;
    return fieldCatalog.filter((f) => (f.label || '').toLowerCase().includes(s)
      || (f.field || '').toLowerCase().includes(s));
  }, [fieldCatalog, fieldQuery]);

  // ── Collapse state (persisted per entity) ────────────────────────────────
  const storageKey = `crm1.filterSidebar.open.${entityType}`;
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw === '0') setCollapsed(true);
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);
  const toggleCollapse = () => {
    setCollapsed((c) => {
      const next = !c;
      try { window.localStorage.setItem(storageKey, next ? '0' : '1'); } catch { /* ignore */ }
      return next;
    });
  };

  // Collapsed rail — a thin strip that just re-opens the panel.
  if (collapsed) {
    return (
      <aside className={cn('shrink-0 w-10 sticky top-4 self-start', className)}>
        <button
          type="button"
          onClick={toggleCollapse}
          aria-label="Expand filters"
          title="Expand filters"
          className={cn('flex flex-col items-center gap-2 w-10 py-3 rounded-xl border border-border bg-card text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors', RING)}
        >
          <PanelLeftOpen className="h-4 w-4" />
          <span className="text-[10px] font-medium uppercase tracking-wide [writing-mode:vertical-rl] rotate-180">
            Filters
          </span>
        </button>
      </aside>
    );
  }

  const rulesCount = rules.length;

  return (
    <aside className={cn('shrink-0 w-64 lg:w-72 sticky top-4 self-start', className)}>
      <div className="rounded-xl border border-border bg-card overflow-hidden flex flex-col max-h-[calc(100vh-2rem)]">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-3 h-11 border-b border-border bg-muted/30 shrink-0">
          <span className="text-sm font-semibold text-foreground">Filters</span>
          <button
            type="button"
            onClick={toggleCollapse}
            aria-label="Collapse filters"
            title="Collapse filters"
            className={cn('inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors', RING)}
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* ── Saved Filters ─────────────────────────────────────────────── */}
          <section className="border-b border-border">
            <div className="flex items-center justify-between gap-2 px-3 h-9">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Bookmark className="h-3.5 w-3.5" /> Saved Filters
              </span>
              <button
                type="button"
                onClick={() => setShowSaveForm((v) => !v)}
                aria-label="Save current view"
                title="Save current view"
                className={cn('inline-flex items-center justify-center h-6 w-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors', RING)}
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>

            {showSaveForm && (
              <div className="px-3 pb-3 space-y-2">
                <Input
                  autoFocus
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') submitSave(); }}
                  placeholder="View name…"
                  className="h-8 text-xs"
                />
                {canShare && (
                  <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={saveShared}
                      onChange={(e) => setSaveShared(e.target.checked)}
                      className="rounded border-border"
                    />
                    <Users className="h-3.5 w-3.5" /> Share with team
                  </label>
                )}
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={submitSave}
                    disabled={saving || !saveName.trim()}
                    className={cn('inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:pointer-events-none', RING)}
                  >
                    {saving && <Loader2 className="h-3 w-3 animate-spin" />} Save
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowSaveForm(false); setSaveName(''); setSaveShared(false); }}
                    className={cn('inline-flex items-center h-7 px-2.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors', RING)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div className="px-2 pb-2 space-y-0.5">
              {loadingViews ? (
                <p className="px-2 py-3 text-xs text-muted-foreground">Loading…</p>
              ) : views.length === 0 ? (
                <p className="px-2 py-3 text-xs text-muted-foreground">No saved filters yet.</p>
              ) : views.map((v) => {
                const ownView = v.owner_id === currentUserId;
                return (
                  <div
                    key={v.id}
                    className={cn('group flex items-center gap-1.5 rounded-md px-2 h-8 text-xs transition-colors hover:bg-muted', RING)}
                  >
                    <button
                      type="button"
                      onClick={() => applyView(v)}
                      className="flex-1 min-w-0 flex items-center gap-1.5 text-left"
                    >
                      <span className="truncate text-foreground">{v.name}</span>
                      {v.is_shared && (
                        <span
                          className="inline-flex items-center gap-0.5 shrink-0 text-[9px] font-medium px-1.5 h-4 rounded-full bg-primary/10 text-primary border border-primary/20"
                          title={v.owner_name ? `Shared by ${v.owner_name}` : 'Shared with team'}
                        >
                          <Users className="h-2.5 w-2.5" /> Shared
                        </span>
                      )}
                    </button>
                    {ownView && (
                      <button
                        type="button"
                        onClick={() => removeView(v)}
                        aria-label={`Delete ${v.name}`}
                        className="shrink-0 inline-flex items-center justify-center h-6 w-6 rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive hover:bg-destructive/10 transition-all"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* ── Filter by fields (Zoho criteria builder) ─────────────────── */}
          <section>
            <div className="flex items-center justify-between gap-2 px-3 h-9">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Filter by fields
              </span>
              {rulesCount > 1 && (
                <div className="inline-flex items-center rounded-md border border-border overflow-hidden text-[10px]">
                  {['and', 'or'].map((m) => (
                    <button
                      key={m} type="button" onClick={() => setMatch(m)}
                      className={cn(
                        'h-5 px-2 font-medium uppercase transition-colors', RING,
                        match === m ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted',
                      )}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Active conditions — editable rows at the top of the section. */}
            {rulesCount > 0 && (
              <div className="px-2 pb-2 space-y-2">
                {rules.map((r, idx) => {
                  const f = fieldByKey.get(`${r.source}:${r.field}`) || { type: r.type, options: [], label: r.field };
                  const showValue = !isValueless(r.operator);
                  return (
                    <div key={r._rid} className="rounded-lg border border-border bg-muted/20 p-2 space-y-1.5">
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground min-w-0">
                          <span className="shrink-0 opacity-70">{idx === 0 ? 'Where' : match}</span>
                          <span className="font-medium text-foreground/80 normal-case tracking-normal text-xs truncate">{f.label}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => removeRule(r._rid)}
                          aria-label="Remove condition"
                          className={cn('shrink-0 inline-flex items-center justify-center h-6 w-6 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors', RING)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <InlineSelect
                        ariaLabel="Operator"
                        value={r.operator}
                        options={operatorsFor(r.type)}
                        onChange={(op) => changeOperator(r._rid, op)}
                        placeholder="Operator"
                      />
                      {showValue && (
                        <ValueInput
                          field={f}
                          operator={r.operator}
                          value={r.value}
                          value2={r.value2}
                          onChange={(patch) => patchRule(r._rid, patch)}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Searchable field list — click adds a criteria row. */}
            <div className="px-3 pb-1">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  value={fieldQuery}
                  onChange={(e) => setFieldQuery(e.target.value)}
                  placeholder="Search fields…"
                  className={cn('w-full h-8 pl-8 pr-2 text-xs rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground', RING)}
                />
              </div>
            </div>
            <div className="px-2 pb-3 max-h-[38vh] overflow-y-auto">
              {visibleFieldList.length === 0 ? (
                <p className="px-2 py-4 text-center text-xs text-muted-foreground">No fields match</p>
              ) : visibleFieldList.map((f) => {
                const active = activeFieldKeys.has(`${f.source}:${f.field}`);
                return (
                  <button
                    key={`${f.source}:${f.field}`}
                    type="button"
                    onClick={() => addFieldRule(f)}
                    className={cn('group flex w-full items-center gap-2 h-8 px-2 rounded-md text-left text-xs transition-colors hover:bg-muted', RING)}
                  >
                    <Plus className={cn('h-3.5 w-3.5 shrink-0 transition-opacity', active ? 'text-primary opacity-100' : 'text-muted-foreground opacity-0 group-hover:opacity-100')} />
                    <span className={cn('truncate', active ? 'text-foreground font-medium' : 'text-foreground')}>{f.label}</span>
                    {f.source === 'custom' && (
                      <span className="ml-auto shrink-0 text-[9px] text-muted-foreground uppercase tracking-wide">Custom</span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </aside>
  );
}
