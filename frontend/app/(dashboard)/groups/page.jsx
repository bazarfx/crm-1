'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus, Search, Building2, LayoutGrid, List, X, Loader2,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import RoleGuard from '@/components/layout/RoleGuard';
import { ManageFieldsButton } from '@/components/dynamic/EditableForm';
import GroupCard from '@/components/groups/GroupCard';
import GroupsTable from '@/components/groups/GroupsTable';
import AddMemberDialog from '@/components/groups/AddMemberDialog';
import ManageMembersDialog from '@/components/groups/ManageMembersDialog';
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
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('cards');

  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [language, setLanguage] = useState('');
  const [status, setStatus] = useState('');

  const [addingTo, setAddingTo] = useState(null);
  const [managing, setManaging] = useState(null);

  const hasActiveFilters = !!(search || type || language || status);

  // Debounced server-side load. Uses the members include from GET /groups —
  // no per-group N+1 fetch.
  useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const params = { limit: 200 };
        if (search) params.search = search;
        if (type) params.type = type;
        if (language) params.language = language;
        if (status) params.is_active = status === 'active';
        const res = await api.get('/groups', { params });
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
  }, [search, type, language, status]);

  const refresh = async () => {
    try {
      const params = { limit: 200 };
      if (search) params.search = search;
      if (type) params.type = type;
      if (language) params.language = language;
      if (status) params.is_active = status === 'active';
      const res = await api.get('/groups', { params });
      const payload = unwrap(res);
      setGroups(Array.isArray(payload) ? payload : (payload?.items || []));
    } catch { /* keep current */ }
  };

  const clearFilters = () => { setSearch(''); setType(''); setLanguage(''); setStatus(''); };

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
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search groups…"
            className="pl-9 h-9"
          />
        </div>
        <Filter value={type} onChange={setType} placeholder="Type" options={[
          { value: 'telesales', label: 'Telesales' },
          { value: 'senior', label: 'Senior' },
          { value: 'other', label: 'Other' },
        ]} />
        <Filter value={language} onChange={setLanguage} placeholder="Language" options={LANGUAGES} />
        <Filter value={status} onChange={setStatus} placeholder="Status" options={[
          { value: 'active', label: 'Active' },
          { value: 'inactive', label: 'Inactive' },
        ]} />
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

function Filter({ value, onChange, placeholder, options }) {
  return (
    <Select value={value || 'all'} onValueChange={(v) => onChange(v === 'all' ? '' : v)}>
      <SelectTrigger className="h-9 text-xs w-[130px]"><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All {placeholder.toLowerCase()}</SelectItem>
        {options.map((o) => (<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>))}
      </SelectContent>
    </Select>
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
