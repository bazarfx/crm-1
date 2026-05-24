'use client';

import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { X, Filter } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { useAuth } from '@/hooks/useAuth';
import { statusColor } from '@/lib/charts';

const EMPTY = {
  status: [], language: [], source: [], campaign: '',
  date_from: '', date_to: '',
  has_ark: false, has_ftd: false,
};

// Role → which lead sources should appear in the filter drawer.
//   tele_sales: every public-ad source, but NEVER direct_ark (those go
//               straight to seniors and a teleseller will never own one).
//   senior:     only direct_ark — that's the entire scope of their pipeline.
//   everyone else: no restriction.
//
// `allowed === null` means "show every source from config" — used for admins
// and read-only roles.
const SOURCE_RULES = {
  tele_sales:    { exclude: ['direct_ark'], only: null },
  senior:        { exclude: [],             only: ['direct_ark'] },
  super_admin:   { exclude: [],             only: null },
  admin:         { exclude: [],             only: null },
  floor_manager: { exclude: [],             only: null },
  back_office:   { exclude: [],             only: null },
  auditor:       { exclude: [],             only: null },
  archive:       { exclude: [],             only: null },
};

// Build a [{ value, label, color? }] list from either grouped config rows
// or a hardcoded fallback. Tolerates both `{key, label}` (Config table shape)
// and `{value, label}` (already-normalized) inputs.
function normalizeOptions(rows, fallback) {
  if (Array.isArray(rows) && rows.length > 0) {
    return rows
      .filter((r) => r && (r.key || r.value))
      .map((r) => ({
        value: r.value ?? r.key,
        label: r.label || r.key || r.value,
        color: r.color || null,
      }));
  }
  return fallback;
}

const STATUS_FALLBACK = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'interested', label: 'Interested' },
  { value: 'not_interested', label: 'Not Interested' },
  { value: 'call_back', label: 'Call Back' },
  { value: 'account_opened', label: 'Account Opened' },
  { value: 'ftd_done', label: 'FTD Done' },
  { value: 'cold', label: 'Cold' },
  { value: 'dnd', label: 'DND' },
];

const LANGUAGE_FALLBACK = ['English', 'Hindi', 'Tamil', 'Telugu', 'Kannada', 'Marathi', 'Gujarati']
  .map((v) => ({ value: v.toLowerCase(), label: v }));

const SOURCE_FALLBACK = [
  { value: 'facebook_ads',  label: 'Facebook Ads' },
  { value: 'instagram_ads', label: 'Instagram Ads' },
  { value: 'google_ads',    label: 'Google Ads' },
  { value: 'website',       label: 'Website' },
  { value: 'referral',      label: 'Referral' },
  { value: 'manual',        label: 'Manual' },
  { value: 'direct_ark',    label: 'Direct ARK Signup' },
];

export default function FilterDrawer({ open, onClose, value, onApply, campaigns = [] }) {
  const config = useStore((s) => s.config);
  const { user, role } = useAuth();
  const [state, setState] = useState({ ...EMPTY, ...(value || {}) });

  useEffect(() => { setState({ ...EMPTY, ...(value || {}) }); }, [value, open]);

  const toggle = (key, item) => {
    setState((s) => {
      const arr = new Set(s[key] || []);
      arr.has(item) ? arr.delete(item) : arr.add(item);
      return { ...s, [key]: Array.from(arr) };
    });
  };

  const statuses  = useMemo(() => normalizeOptions(config?.lead_status, STATUS_FALLBACK), [config]);
  const allLanguages = useMemo(() => normalizeOptions(config?.language, LANGUAGE_FALLBACK), [config]);
  const allSources   = useMemo(() => normalizeOptions(config?.lead_source, SOURCE_FALLBACK), [config]);

  // Restrict the source list to what makes sense for the caller's role. Apply
  // BOTH the exclude blacklist and the optional `only` whitelist so seniors
  // see exactly one option and never get tempted to pick a paid-ad source
  // that they'll never actually own.
  const sources = useMemo(() => {
    const rule = SOURCE_RULES[role] || { exclude: [], only: null };
    let list = allSources;
    if (rule.only) list = list.filter((s) => rule.only.includes(s.value));
    if (rule.exclude.length) list = list.filter((s) => !rule.exclude.includes(s.value));
    return list;
  }, [allSources, role]);

  // For tele_sales / senior, the filter only needs to show the languages
  // they actually speak — leads outside that set will never be theirs.
  // Admins / floor managers keep the full list since they triage across all.
  const userLangs = useMemo(
    () => (Array.isArray(user?.languages) ? user.languages.map((l) => (l || '').toLowerCase()) : []),
    [user?.languages],
  );
  const languages = useMemo(() => {
    if (!['tele_sales', 'senior'].includes(role)) return allLanguages;
    if (userLangs.length === 0) return allLanguages;
    const allowed = new Set(userLangs);
    const filtered = allLanguages.filter((l) => allowed.has(l.value.toLowerCase()));
    return filtered.length ? filtered : allLanguages;
  }, [allLanguages, role, userLangs]);

  // Same idea for campaigns: telesellers + seniors only see campaigns whose
  // language is one they speak.
  const visibleCampaigns = useMemo(() => {
    if (!['tele_sales', 'senior'].includes(role)) return campaigns;
    if (userLangs.length === 0) return campaigns;
    const allowed = new Set(userLangs);
    return campaigns.filter((c) => !c.language || allowed.has(c.language.toLowerCase()));
  }, [campaigns, role, userLangs]);

  // Hide whole sections that would only ever present a single forced choice —
  // a one-option "filter" is just noise.
  const showLanguageSection = languages.length > 1;
  const showSourceSection = sources.length > 1;

  return (
    <>
      <div
        className={clsx(
          'fixed inset-0 bg-black/30 backdrop-blur-sm z-40 transition-opacity duration-150',
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        onClick={onClose}
        aria-hidden
      />
      <aside
        className={clsx(
          'fixed inset-y-0 right-0 w-full sm:w-80 z-50 bg-background border-l shadow-lg flex flex-col',
          'transition-transform duration-200 ease-out',
          open ? 'translate-x-0' : 'translate-x-full'
        )}
        role="dialog"
        aria-modal="true"
      >
        <div className="h-14 px-5 flex items-center justify-between border-b shrink-0">
          <div className="flex items-center gap-2">
            <Filter size={14} className="text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Filters</h3>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-muted transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <Section label="Status">
            <div className="flex flex-wrap gap-1.5">
              {statuses.map((s) => {
                const active = state.status.includes(s.value);
                const color = s.color || statusColor(s.value);
                return (
                  <Pill
                    key={s.value}
                    active={active}
                    onClick={() => toggle('status', s.value)}
                    accent={color}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: color }}
                    />
                    {s.label}
                  </Pill>
                );
              })}
            </div>
          </Section>

          {showLanguageSection && (
            <Section label="Language">
              <div className="flex flex-wrap gap-1.5">
                {languages.map((l) => (
                  <Pill
                    key={l.value}
                    active={state.language.includes(l.value)}
                    onClick={() => toggle('language', l.value)}
                  >
                    {l.label}
                  </Pill>
                ))}
              </div>
            </Section>
          )}

          {showSourceSection && (
            <Section label="Source">
              <div className="flex flex-wrap gap-1.5">
                {sources.map((s) => (
                  <Pill
                    key={s.value}
                    active={state.source.includes(s.value)}
                    onClick={() => toggle('source', s.value)}
                  >
                    {s.label}
                  </Pill>
                ))}
              </div>
            </Section>
          )}

          <Section label="Campaign">
            <select
              value={state.campaign}
              onChange={(e) => setState((s) => ({ ...s, campaign: e.target.value }))}
              className="w-full h-9 rounded-md border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow"
            >
              <option value="">All campaigns</option>
              {visibleCampaigns.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Section>

          <Section label="Date Range">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wide text-muted-foreground">From</label>
                <input
                  type="date"
                  value={state.date_from}
                  onChange={(e) => setState((s) => ({ ...s, date_from: e.target.value }))}
                  className="w-full h-9 rounded-md border bg-background px-2.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wide text-muted-foreground">To</label>
                <input
                  type="date"
                  value={state.date_to}
                  onChange={(e) => setState((s) => ({ ...s, date_to: e.target.value }))}
                  className="w-full h-9 rounded-md border bg-background px-2.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow"
                />
              </div>
            </div>
          </Section>

          <Section label="ARK & FTD">
            <div className="grid grid-cols-2 gap-2">
              <TogglePill
                label="Has ARK"
                checked={state.has_ark}
                onChange={() => setState((s) => ({ ...s, has_ark: !s.has_ark }))}
              />
              <TogglePill
                label="Has FTD"
                checked={state.has_ftd}
                onChange={() => setState((s) => ({ ...s, has_ftd: !s.has_ftd }))}
              />
            </div>
          </Section>
        </div>

        <div className="p-4 border-t flex items-center gap-2 shrink-0">
          <button
            className="inline-flex items-center justify-center flex-1 h-9 rounded-md border bg-background text-sm font-medium hover:bg-muted transition-colors"
            onClick={() => { setState(EMPTY); onApply(EMPTY); }}
          >
            Clear all
          </button>
          <button
            className="inline-flex items-center justify-center flex-1 h-9 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            onClick={() => { onApply(state); onClose(); }}
          >
            Apply
          </button>
        </div>
      </aside>
    </>
  );
}

function Section({ label, children }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">{label}</p>
      {children}
    </div>
  );
}

// Compact toggle chip used for multi-select filters (Status, Language, Source).
// Replaces the old vertical checkbox column — a wrapping pill row reads as a
// single visual block and scans much faster than a stack of labels.
//
// `accent` tints the active state with the status color; falls back to the
// neutral foreground/background pair when not provided.
function Pill({ active, onClick, children, accent }) {
  const activeStyle = active && accent
    ? { backgroundColor: `${accent}1A`, color: accent, borderColor: `${accent}55` }
    : undefined;
  return (
    <button
      type="button"
      onClick={onClick}
      style={activeStyle}
      className={clsx(
        'inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-xs font-medium border transition-colors duration-150 whitespace-nowrap',
        active
          ? (accent
              ? '' // inline style takes over
              : 'bg-foreground text-background border-foreground')
          : 'border-border text-muted-foreground bg-background hover:bg-muted hover:text-foreground'
      )}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}

// Boolean toggle styled as a full-width pill — used for ARK / FTD switches.
// Replaces the old labeled-row layout so they sit side-by-side in a 2-col grid.
function TogglePill({ label, checked, onChange }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={clsx(
        'inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-md text-xs font-medium border transition-colors duration-150',
        checked
          ? 'bg-primary text-primary-foreground border-primary'
          : 'border-border text-muted-foreground bg-background hover:bg-muted hover:text-foreground'
      )}
      aria-pressed={checked}
    >
      <span
        className={clsx(
          'w-1.5 h-1.5 rounded-full shrink-0',
          checked ? 'bg-primary-foreground' : 'bg-muted-foreground/40'
        )}
      />
      {label}
    </button>
  );
}
