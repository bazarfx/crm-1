'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Check, ChevronsUpDown, Search, AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { LanguageBadge } from '@/components/shared/LanguageBadge';
import { labelFor } from '@/lib/languages';
import { cn } from '@/lib/utils';
import api, { unwrap } from '@/lib/api';

/**
 * Assignee picker that groups users by language, sorts each group by current
 * open-lead count (lightest first), and surfaces a mismatch warning when the
 * caller is about to assign a lead to someone who doesn't speak its language.
 *
 * Props:
 *   value           - currently selected user id (string | '' | null)
 *   onChange        - (userId: string) => void
 *   leadLanguage    - lead's language for grouping / mismatch detection
 *   role            - 'tele_sales' | 'senior' (which pool to pull)
 *   placeholder     - trigger button text when nothing is selected
 *   size            - 'sm' | 'default'
 *   disabled
 */
export function AssigneeDropdown({
  value,
  onChange,
  leadLanguage,
  role = 'tele_sales',
  disabled = false,
  placeholder = 'Choose assignee',
  size = 'default',
}) {
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState([]);
  const [workload, setWorkload] = useState({});
  const [showAll, setShowAll] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Fetch the active-user pool + workload counts. One round-trip each — both
  // cached at the browser level by the api layer, so opening the same picker
  // again is cheap.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([
      api.get('/users', { params: { role, limit: 200, is_active: true } })
        .then((r) => {
          const p = unwrap(r);
          return Array.isArray(p) ? p : (p?.items || p?.data || []);
        })
        .catch(() => []),
      api.get('/users/workload', { params: { role } })
        .then((r) => unwrap(r) || [])
        .catch(() => []),
    ]).then(([list, wl]) => {
      if (!alive) return;
      setUsers(list);
      const map = {};
      for (const row of wl) map[row.user_id] = row.open_lead_count;
      setWorkload(map);
    }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [role]);

  // Group users by language. If a lead language is set, prefer users who
  // speak it; everyone else lives behind a "Show all" toggle so the picker
  // doesn't drown the language-aware options.
  const grouped = useMemo(() => {
    let pool = users;
    if (leadLanguage && !showAll) {
      pool = users.filter((u) => Array.isArray(u.languages) && u.languages.includes(leadLanguage));
    }

    const q = search.trim().toLowerCase();
    if (q) {
      pool = pool.filter((u) => {
        const name = `${u.first_name || ''} ${u.last_name || ''} ${u.email || ''}`.toLowerCase();
        return name.includes(q);
      });
    }

    const byLanguage = {};
    for (const u of pool) {
      const langs = Array.isArray(u.languages) && u.languages.length > 0
        ? u.languages
        : ['unspecified'];
      const bucket = leadLanguage && langs.includes(leadLanguage) ? leadLanguage : langs[0];
      if (!byLanguage[bucket]) byLanguage[bucket] = [];
      byLanguage[bucket].push(u);
    }

    return Object.keys(byLanguage)
      .sort((a, b) => {
        if (a === leadLanguage) return -1;
        if (b === leadLanguage) return 1;
        return a.localeCompare(b);
      })
      .map((lang) => ({
        language: lang,
        // Lightest-loaded first — admins triaging an unassigned queue almost
        // always want to spread work evenly rather than alphabetically.
        users: byLanguage[lang].sort((a, b) => (workload[a.id] || 0) - (workload[b.id] || 0)),
      }));
  }, [users, workload, leadLanguage, showAll, search]);

  const selected = users.find((u) => u.id === value);
  const totalUsers = users.length;
  const matchingLangCount = leadLanguage
    ? users.filter((u) => (u.languages || []).includes(leadLanguage)).length
    : totalUsers;
  const hiddenCount = totalUsers - matchingLangCount;

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSearch(''); }}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'justify-between font-normal',
            size === 'sm' ? 'h-7 text-[11px] px-2' : 'h-9 text-sm',
            !selected && 'text-muted-foreground',
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {selected ? (
            <span className="flex items-center gap-1.5 truncate min-w-0">
              <span className="truncate">{selected.first_name} {selected.last_name}</span>
              {leadLanguage && !(selected.languages || []).includes(leadLanguage) && (
                <AlertCircle
                  className="h-3 w-3 text-amber-500 dark:text-amber-400 flex-shrink-0"
                  title={`Assignee doesn't speak ${labelFor(leadLanguage)}`}
                />
              )}
            </span>
          ) : (
            <span className="truncate">{placeholder}</span>
          )}
          <ChevronsUpDown className="h-3.5 w-3.5 opacity-50 ml-1.5 flex-shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-72 p-0"
        align="start"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${role.replace(/_/g, ' ')}s…`}
              className="h-9 pl-8 border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </div>
        </div>

        <div className="max-h-72 overflow-y-auto">
          {loading && (
            <div className="p-3 text-xs text-muted-foreground">Loading…</div>
          )}
          {!loading && grouped.length === 0 && (
            <div className="p-3 text-xs text-muted-foreground">
              No matching {role.replace(/_/g, ' ')}s.
            </div>
          )}

          {grouped.map((group) => (
            <div key={group.language} className="py-1">
              <div className="px-2 py-1 flex items-center gap-1.5">
                <LanguageBadge language={group.language} size="xs" />
                <span className="text-[10px] text-muted-foreground">
                  {group.users.length} {group.users.length === 1 ? 'person' : 'people'}
                </span>
              </div>
              {group.users.map((u) => {
                const userLangs = u.languages || [];
                const isLangMatch = !leadLanguage || userLangs.includes(leadLanguage);
                const openCount = workload[u.id] ?? 0;
                const isSelected = value === u.id;
                return (
                  <button
                    type="button"
                    key={u.id}
                    onClick={() => { onChange?.(u.id); setOpen(false); }}
                    className={cn(
                      'w-full flex items-start gap-2 px-2 py-1.5 text-left text-xs',
                      'hover:bg-muted/70 transition-colors',
                      isSelected && 'bg-muted/40',
                    )}
                  >
                    <Check
                      className={cn(
                        'h-3.5 w-3.5 mt-0.5 flex-shrink-0',
                        isSelected ? 'opacity-100 text-emerald-500' : 'opacity-0',
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="truncate font-medium">
                        {u.first_name} {u.last_name}
                      </p>
                      <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                        <span className="text-[9px] text-muted-foreground tabular-nums">
                          {openCount} open
                        </span>
                        {userLangs.slice(0, 2).map((l) => (
                          <LanguageBadge key={l} language={l} size="xs" />
                        ))}
                        {userLangs.length > 2 && (
                          <span className="text-[9px] text-muted-foreground">
                            +{userLangs.length - 2}
                          </span>
                        )}
                        {!isLangMatch && (
                          <AlertCircle
                            className="h-2.5 w-2.5 text-amber-500 dark:text-amber-400"
                            title="Mismatch"
                          />
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {leadLanguage && hiddenCount > 0 && !showAll && (
          <div className="border-t p-2">
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline w-full text-left"
            >
              Show all {totalUsers} {role.replace(/_/g, ' ')}s
              {' '}({hiddenCount} don&apos;t speak {labelFor(leadLanguage)})
            </button>
          </div>
        )}
        {showAll && leadLanguage && (
          <div className="border-t p-2">
            <button
              type="button"
              onClick={() => setShowAll(false)}
              className="text-[10px] text-muted-foreground hover:underline w-full text-left"
            >
              Show only {labelFor(leadLanguage)} speakers
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export default AssigneeDropdown;
