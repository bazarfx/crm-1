'use client';

import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { X, Filter } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { statusColor } from '@/lib/charts';

const EMPTY = {
  status: [], language: [], source: [], campaign: '',
  date_from: '', date_to: '',
  has_ark: false, has_ftd: false,
};

export default function FilterDrawer({ open, onClose, value, onApply, campaigns = [] }) {
  const config = useStore((s) => s.config);
  const [state, setState] = useState({ ...EMPTY, ...(value || {}) });

  useEffect(() => { setState({ ...EMPTY, ...(value || {}) }); }, [value, open]);

  const toggle = (key, item) => {
    setState((s) => {
      const arr = new Set(s[key] || []);
      arr.has(item) ? arr.delete(item) : arr.add(item);
      return { ...s, [key]: Array.from(arr) };
    });
  };

  const statuses = config?.statuses || config?.lead_statuses || [
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

  const languages = config?.languages || [
    'English', 'Hindi', 'Tamil', 'Telugu', 'Kannada', 'Marathi', 'Gujarati',
  ].map((v) => ({ value: v.toLowerCase(), label: v }));

  const sources = config?.sources || [
    { value: 'meta', label: 'Meta Ads' },
    { value: 'organic', label: 'Organic' },
    { value: 'referral', label: 'Referral' },
    { value: 'manual', label: 'Manual' },
  ];

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
          'fixed inset-y-0 right-0 w-full sm:w-80 z-50 bg-white shadow-lg flex flex-col',
          'transition-transform duration-200 ease-out',
          open ? 'translate-x-0' : 'translate-x-full'
        )}
        role="dialog"
        aria-modal="true"
      >
        <div className="h-14 px-5 flex items-center justify-between border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2">
            <Filter size={14} className="text-accent" />
            <h3 className="text-sm font-semibold text-ink-primary">Filters</h3>
          </div>
          <button onClick={onClose} className="text-ink-muted hover:text-ink-primary p-1 rounded-md hover:bg-surface-alt">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          <Section label="Status">
            <div className="space-y-1.5">
              {statuses.map((s) => (
                <Checkbox
                  key={s.value}
                  label={
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ background: s.color || statusColor(s.value) }} />
                      {s.label}
                    </span>
                  }
                  checked={state.status.includes(s.value)}
                  onChange={() => toggle('status', s.value)}
                />
              ))}
            </div>
          </Section>

          <Section label="Language">
            <div className="space-y-1.5">
              {languages.map((l) => (
                <Checkbox
                  key={l.value}
                  label={l.label}
                  checked={state.language.includes(l.value)}
                  onChange={() => toggle('language', l.value)}
                />
              ))}
            </div>
          </Section>

          <Section label="Source">
            <div className="space-y-1.5">
              {sources.map((s) => (
                <Checkbox
                  key={s.value}
                  label={s.label}
                  checked={state.source.includes(s.value)}
                  onChange={() => toggle('source', s.value)}
                />
              ))}
            </div>
          </Section>

          <Section label="Campaign">
            <select
              value={state.campaign}
              onChange={(e) => setState((s) => ({ ...s, campaign: e.target.value }))}
              className="input"
            >
              <option value="">All campaigns</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Section>

          <Section label="Date Range">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] text-ink-muted">From</label>
                <input
                  type="date"
                  value={state.date_from}
                  onChange={(e) => setState((s) => ({ ...s, date_from: e.target.value }))}
                  className="input text-xs"
                />
              </div>
              <div>
                <label className="text-[11px] text-ink-muted">To</label>
                <input
                  type="date"
                  value={state.date_to}
                  onChange={(e) => setState((s) => ({ ...s, date_to: e.target.value }))}
                  className="input text-xs"
                />
              </div>
            </div>
          </Section>

          <Section label="ARK & FTD">
            <Toggle label="Has ARK account" checked={state.has_ark}
              onChange={() => setState((s) => ({ ...s, has_ark: !s.has_ark }))} />
            <Toggle label="Has FTD" checked={state.has_ftd}
              onChange={() => setState((s) => ({ ...s, has_ftd: !s.has_ftd }))} />
          </Section>
        </div>

        <div className="p-4 border-t border-slate-100 flex items-center gap-2 shrink-0">
          <button
            className="btn-ghost text-sm flex-1"
            onClick={() => { setState(EMPTY); onApply(EMPTY); }}
          >
            Clear All
          </button>
          <button
            className="btn-primary text-sm flex-1"
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
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted mb-2">{label}</p>
      {children}
    </div>
  );
}

function Checkbox({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer text-sm text-ink-secondary hover:text-ink-primary py-1 rounded-md hover:bg-surface-alt px-1.5 -mx-1.5 transition-colors duration-150">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="w-4 h-4 rounded border-slate-300 text-accent focus:ring-accent/40 cursor-pointer"
      />
      <span className="flex-1">{label}</span>
    </label>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="flex items-center justify-between py-2 cursor-pointer text-sm text-ink-secondary hover:text-ink-primary">
      <span>{label}</span>
      <button
        type="button"
        onClick={onChange}
        className={clsx(
          'relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-150',
          checked ? 'bg-accent' : 'bg-slate-200'
        )}
        aria-pressed={checked}
      >
        <span
          className={clsx(
            'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-150',
            checked ? 'translate-x-4' : 'translate-x-0.5'
          )}
        />
      </button>
    </label>
  );
}
