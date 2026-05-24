'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  LayoutDashboard, Users, UserCog, Building2, Megaphone, BarChart3,
  Webhook, Settings, Search, ArrowRight, FileText, Phone, Award,
  Activity, FlaskConical, Shield, Eye, Route, Loader2, Cog, CornerDownLeft,
} from 'lucide-react';
import api, { unwrap } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

const ALL = ['super_admin','admin','floor_manager','senior','tele_sales','back_office','auditor','archive'];
const ADMIN = ['super_admin','admin'];
const FM_UP = ['super_admin','admin','floor_manager'];

const NAV_ACTIONS = [
  { id: 'go-dashboard',  label: 'Go to Dashboard',     keywords: 'home overview kpi', icon: LayoutDashboard, href: '/dashboard',      roles: ALL },
  { id: 'go-leads',      label: 'Go to Leads',         keywords: 'pipeline contacts', icon: Users,           href: '/leads',          roles: ALL },
  { id: 'go-deals',      label: 'Go to Deals',         keywords: 'ftd conversion',    icon: Award,           href: '/deals',          roles: ['super_admin','admin','floor_manager','senior','tele_sales','back_office','auditor'] },
  { id: 'go-users',      label: 'Go to Users',         keywords: 'staff agents',      icon: UserCog,         href: '/users',          roles: ADMIN },
  { id: 'go-groups',     label: 'Go to Groups',        keywords: 'team round robin',  icon: Building2,       href: '/groups',         roles: FM_UP },
  { id: 'go-campaigns',  label: 'Go to Campaigns',     keywords: 'meta ads facebook', icon: Megaphone,       href: '/campaigns',      roles: FM_UP },
  { id: 'go-routing',    label: 'Go to Routing',       keywords: 'rules assignment',  icon: Route,           href: '/routing',        roles: ADMIN },
  { id: 'go-reports',    label: 'Go to Reports',       keywords: 'analytics metrics', icon: BarChart3,       href: '/reports',        roles: ['super_admin','admin','floor_manager','senior'] },
  { id: 'go-activity',   label: 'Go to Sales Activity',keywords: 'audit log saves',   icon: Activity,        href: '/sales-activity', roles: ADMIN },
  { id: 'go-ark',        label: 'Go to ARK Logs',      keywords: 'webhook terminal',  icon: Webhook,         href: '/ark-logs',       roles: ADMIN },
  { id: 'go-trial',      label: 'Go to Trial Leads',   keywords: 'sandbox',           icon: FlaskConical,    href: '/trial-leads',    roles: ['super_admin'] },
  { id: 'go-perms',      label: 'Go to Permissions',   keywords: 'roles matrix acl',  icon: Shield,          href: '/permissions',    roles: ['super_admin'] },
  { id: 'go-admin-audit',label: 'Go to Admin Actions', keywords: 'audit trail',       icon: Eye,             href: '/admin-actions',  roles: ['super_admin'] },
  { id: 'go-settings',   label: 'Go to Settings',      keywords: 'config preferences',icon: Settings,        href: '/settings',       roles: ADMIN },
];

function useDebounced(value, delay = 220) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

export default function CommandPalette({ open, onClose }) {
  const router = useRouter();
  const { role } = useAuth();
  const [query, setQuery] = useState('');
  const [leads, setLeads] = useState([]);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef(null);
  const debouncedQ = useDebounced(query, 240);

  // Reset on open/close
  useEffect(() => {
    if (open) {
      setQuery('');
      setLeads([]);
      setCursor(0);
      // Defer focus to after the modal mounts
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Filter nav by role + query
  const navResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    return NAV_ACTIONS
      .filter((a) => !role || a.roles.includes(role))
      .filter((a) => !q || a.label.toLowerCase().includes(q) || a.keywords.toLowerCase().includes(q))
      .slice(0, 8);
  }, [query, role]);

  // Lead search via API (only when there's a query)
  useEffect(() => {
    if (!open) return;
    const q = debouncedQ.trim();
    if (!q || q.length < 2) { setLeads([]); return; }
    let alive = true;
    setLeadsLoading(true);
    api.get('/leads', { params: { search: q, limit: 6, page: 1 } })
      .then((res) => {
        if (!alive) return;
        const payload = unwrap(res);
        const list = Array.isArray(payload) ? payload : (payload?.items || payload?.data || []);
        setLeads(list);
      })
      .catch(() => { if (alive) setLeads([]); })
      .finally(() => { if (alive) setLeadsLoading(false); });
    return () => { alive = false; };
  }, [debouncedQ, open]);

  // Flat list for keyboard nav: [navResults..., leads...]
  const flat = useMemo(() => {
    const navItems = navResults.map((n) => ({ kind: 'nav', ...n }));
    const leadItems = leads.map((l) => ({
      kind: 'lead',
      id: `lead-${l.id}`,
      label: l.name || `${l.first_name || ''} ${l.last_name || ''}`.trim() || l.phone || '—',
      sub: [l.phone, l.email].filter(Boolean).join(' · '),
      href: `/leads/${l.id}`,
      icon: Phone,
    }));
    return [...navItems, ...leadItems];
  }, [navResults, leads]);

  // Clamp cursor whenever results change
  useEffect(() => {
    setCursor((c) => (flat.length === 0 ? 0 : Math.min(c, flat.length - 1)));
  }, [flat.length]);

  const select = useCallback((item) => {
    if (!item) return;
    onClose();
    router.push(item.href);
  }, [router, onClose]);

  // Keyboard nav
  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => Math.min(flat.length - 1, c + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      select(flat[cursor]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center pt-[12vh] px-4 bg-black/55 backdrop-blur-md animate-in fade-in duration-150"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div
        className="w-full max-w-xl rounded-2xl border bg-popover text-popover-foreground shadow-2xl shadow-black/30 overflow-hidden animate-modalIn"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 h-12 border-b">
          <Search size={15} className="text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search pages, leads…"
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none border-none"
          />
          <kbd className="hidden sm:inline-flex items-center font-mono text-[10px] text-muted-foreground border rounded px-1.5 py-0.5">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto py-2">
          {/* Pages */}
          {navResults.length > 0 && (
            <Section title="Pages">
              {navResults.map((a, i) => (
                <Row
                  key={a.id}
                  icon={a.icon}
                  label={a.label}
                  selected={cursor === i}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => select({ ...a, kind: 'nav' })}
                />
              ))}
            </Section>
          )}

          {/* Leads */}
          {(leads.length > 0 || leadsLoading) && (
            <Section
              title="Leads"
              right={leadsLoading ? <Loader2 size={11} className="animate-spin text-muted-foreground" /> : null}
            >
              {leads.map((l, i) => {
                const idx = navResults.length + i;
                const name = l.name || `${l.first_name || ''} ${l.last_name || ''}`.trim() || l.phone || '—';
                const sub = [l.phone, l.email].filter(Boolean).join(' · ');
                return (
                  <Row
                    key={`lead-${l.id}`}
                    icon={Phone}
                    label={name}
                    sub={sub}
                    selected={cursor === idx}
                    onMouseEnter={() => setCursor(idx)}
                    onClick={() => select({ kind: 'lead', href: `/leads/${l.id}` })}
                  />
                );
              })}
              {leadsLoading && leads.length === 0 && (
                <p className="px-3 py-3 text-xs text-muted-foreground">Searching…</p>
              )}
            </Section>
          )}

          {/* Empty */}
          {flat.length === 0 && !leadsLoading && (
            <div className="px-4 py-10 text-center">
              <p className="text-sm text-muted-foreground">No results</p>
              <p className="text-[11px] text-muted-foreground mt-1">
                Try a page name (dashboard, deals) or a lead name / phone.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-3 h-9 border-t bg-muted/30 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-3">
            <Hint k="↑↓" label="Navigate" />
            <Hint k={<CornerDownLeft size={10} />} label="Open" />
          </div>
          <span className="hidden sm:flex items-center gap-1.5">
            <Cog size={11} /> Command palette
          </span>
        </div>
      </div>
    </div>
  );
}

function Section({ title, right, children }) {
  return (
    <div className="mb-1 last:mb-0">
      <div className="flex items-center justify-between px-3 pt-2 pb-1">
        <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{title}</p>
        {right}
      </div>
      <ul>{children}</ul>
    </div>
  );
}

function Row({ icon: Icon, label, sub, selected, onClick, onMouseEnter }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        onMouseEnter={onMouseEnter}
        className={cn(
          'w-full flex items-center gap-3 px-3 py-2 text-left text-sm transition-colors',
          selected ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/60 text-foreground'
        )}
      >
        {Icon && (
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-muted text-muted-foreground shrink-0">
            <Icon size={13} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate leading-tight">{label}</p>
          {sub && <p className="text-[11px] text-muted-foreground truncate leading-tight mt-0.5">{sub}</p>}
        </div>
        {selected && <ArrowRight size={12} className="text-muted-foreground shrink-0" />}
      </button>
    </li>
  );
}

function Hint({ k, label }) {
  return (
    <span className="inline-flex items-center gap-1">
      <kbd className="inline-flex items-center font-mono text-[10px] border rounded px-1 py-0.5 min-w-[18px] justify-center">
        {k}
      </kbd>
      <span>{label}</span>
    </span>
  );
}
