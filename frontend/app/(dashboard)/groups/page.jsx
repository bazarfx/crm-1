'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus, Search, Building2, LayoutGrid, List, X, Loader2,
  Network, Languages, CircleDot,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import RoleGuard from '@/components/layout/RoleGuard';
import { ManageFieldsButton } from '@/components/dynamic/EditableForm';
import GroupCard from '@/components/groups/GroupCard';
import GroupsTable from '@/components/groups/GroupsTable';
import AddMemberDialog from '@/components/groups/AddMemberDialog';
import ManageMembersDialog from '@/components/groups/ManageMembersDialog';
import FilterRail from '@/components/shared/FilterRail';
import { DynamicFilterBar } from '@/components/dynamic/DynamicFilterBar';
import { useStore } from '@/store/useStore';
import { LANGUAGES } from '@/lib/languages';
import api, { unwrap } from '@/lib/api';
import { cn } from '@/lib/utils';

export default function GroupsPage() {
  return (
    <RoleGuard allowedRoles={['super_admin', 'admin', 'floor_manager']}>
      <GroupsContent />
    </RoleGuard>
  );
}

function GroupsContent() {
  const router = useRouter();
  const config = useStore((s) => s.config);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('cards');

  // Single consolidated filter state (mirrors leads/page.jsx). `applyFilters`
  // is the live-apply callback wired into both FilterRail and DynamicFilterBar.
  // Keys map straight onto the backend GET /groups params, except `status`
  // which is translated to the boolean `is_active` at fetch time.
  const [filters, setFilters] = useState({});
  const applyFilters = useCallback((next) => { setFilters(next); }, []);

  const [addingTo, setAddingTo] = useState(null);
  const [managing, setManaging] = useState(null);

  // Build the GET /groups query from the filter object. Preserves the exact
  // backend param names: search, type, language, is_active. Custom-field
  // chips arrive as cf_* keys and are forwarded verbatim.
  const buildParams = useCallback(() => {
    const params = { limit: 200 };
    if (filters.search) params.search = filters.search;
    if (filters.type) params.type = filters.type;
    if (filters.language) params.language = filters.language;
    if (filters.status) params.is_active = filters.status === 'active';
    for (const k of Object.keys(filters)) {
      if (k.startsWith('cf_') && filters[k] !== '' && filters[k] != null) {
        params[k] = filters[k];
      }
    }
    return params;
  }, [filters]);

  const hasActiveFilters = useMemo(
    () => Object.values(filters).some((v) => (Array.isArray(v) ? v.length : v)),
    [filters],
  );

  // Language options for the rail — config-driven with a static fallback.
  const languageOptions = useMemo(() => {
    const rows = config?.language;
    if (Array.isArray(rows) && rows.length) {
      return rows
        .filter((r) => r && (r.key || r.value))
        .map((r) => ({ value: r.value ?? r.key, label: r.label || r.key || r.value }));
    }
    return LANGUAGES;
  }, [config]);

  const filterSpec = useMemo(() => [
    {
      key: 'type', label: 'Type', kind: 'single', glyph: Network, tint: 'bg-violet-500/40',
      allLabel: 'All types', options: [
        { value: 'telesales', label: 'Telesales' },
        { value: 'senior', label: 'Senior' },
        { value: 'other', label: 'Other' },
      ],
    },
    {
      key: 'language', label: 'Language', kind: 'single', glyph: Languages, tint: 'bg-indigo-500/40',
      allLabel: 'All languages', options: languageOptions,
    },
    {
      key: 'status', label: 'Status', kind: 'single', glyph: CircleDot, tint: 'bg-blue-500/40',
      allLabel: 'All statuses', capitalize: false, options: [
        { value: 'active', label: 'Active' },
        { value: 'inactive', label: 'Inactive' },
      ],
    },
  ], [languageOptions]);

  // Debounced server-side load. Uses the members include from GET /groups —
  // no per-group N+1 fetch.
  useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.get('/groups', { params: buildParams() });
        const payload = unwrap(res);
        const list = Array.isArray(payload) ? payload : (payload?.items || []);
        if (alive) setGroups(list);
      } catch {
        if (alive) toast.error('Failed to load groups');
      } finally {
        if (alive) setLoading(false);
      }
    }, 200);
    return () => { alive = false; clearTimeout(t); };
  }, [buildParams]);

  const refresh = async () => {
    try {
      const res = await api.get('/groups', { params: buildParams() });
      const payload = unwrap(res);
      setGroups(Array.isArray(payload) ? payload : (payload?.items || []));
    } catch { /* keep current */ }
  };

  const clearFilters = () => setFilters({});

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Groups</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Round-robin teams. Telesellers and seniors can belong to multiple groups.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ManageFieldsButton entityType="group" size="sm" />
          <Button size="sm" onClick={() => router.push('/groups/new')}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> New group
          </Button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={filters.search || ''}
            onChange={(e) => applyFilters({ ...filters, search: e.target.value })}
            placeholder="Search groups…"
            className="pl-9 h-9"
          />
        </div>
        {/* Horizontal filter rail — native group filters (Type, Language,
            Status) as inline popover-chips, followed by custom-field chips.
            Everything live-applies; no Apply button. */}
        <FilterRail spec={filterSpec} filters={filters} onChange={applyFilters} />
        <DynamicFilterBar entityType="group" filters={filters} onChange={applyFilters} />
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" className="h-9 text-muted-foreground" onClick={clearFilters}>
            <X className="h-3.5 w-3.5 mr-1" /> Clear
          </Button>
        )}
        <div className="ml-auto flex items-center gap-0.5 border rounded-md p-0.5">
          <ViewToggle active={view === 'cards'} onClick={() => setView('cards')} icon={LayoutGrid} label="Cards" />
          <ViewToggle active={view === 'table'} onClick={() => setView('table')} icon={List} label="Table" />
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="py-20 flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : groups.length === 0 ? (
        <EmptyState hasFilters={hasActiveFilters} onClear={clearFilters} onCreate={() => router.push('/groups/new')} />
      ) : view === 'cards' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {groups.map((g) => (
            <GroupCard key={g.id} group={g} onAddMember={setAddingTo} onManage={setManaging} />
          ))}
        </div>
      ) : (
        <GroupsTable groups={groups} onAddMember={setAddingTo} onManage={setManaging} />
      )}

      {addingTo && (
        <AddMemberDialog
          group={addingTo}
          allGroups={groups}
          onClose={() => setAddingTo(null)}
          onAdded={refresh}
        />
      )}
      {managing && (
        <ManageMembersDialog
          group={managing}
          allGroups={groups}
          onClose={() => setManaging(null)}
          onChanged={refresh}
        />
      )}
    </div>
  );
}

function ViewToggle({ active, onClick, icon: Icon, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'h-7 px-2.5 rounded text-xs font-medium inline-flex items-center gap-1.5 transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
        active ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/60',
      )}
      aria-pressed={active}
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );
}

function EmptyState({ hasFilters, onClear, onCreate }) {
  return (
    <div className="rounded-xl border bg-card py-16 px-6 text-center">
      <div className="h-12 w-12 rounded-xl bg-muted mx-auto flex items-center justify-center">
        <Building2 className="h-6 w-6 text-muted-foreground" />
      </div>
      {hasFilters ? (
        <>
          <p className="text-sm font-medium mt-4">No groups match your filters</p>
          <p className="text-sm text-muted-foreground mt-1">Try widening or clearing them.</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={onClear}>
            <X className="h-3.5 w-3.5 mr-1.5" /> Clear filters
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm font-medium mt-4">No groups yet</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
            Groups pool telesellers and seniors so language-tagged leads round-robin to the right people.
          </p>
          <Button size="sm" className="mt-4" onClick={onCreate}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Create your first group
          </Button>
        </>
      )}
    </div>
  );
}
