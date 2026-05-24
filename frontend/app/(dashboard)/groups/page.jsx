'use client';
import { useEffect, useState } from 'react';
import { Plus, X, Search, Crown, Pencil } from 'lucide-react';
import { toast } from 'react-hot-toast';
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { LanguageBadge } from '@/components/shared/LanguageBadge';
import RoleGuard from '@/components/layout/RoleGuard';
import { ManageFieldsButton } from '@/components/dynamic/EditableForm';
import GroupDialog from '@/components/groups/GroupDialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { LANGUAGES } from '@/lib/languages';
import api from '@/lib/api';

export default function GroupsPage() {
  return (
    <RoleGuard allowedRoles={['super_admin', 'admin', 'floor_manager']}>
      <GroupsContent />
    </RoleGuard>
  );
}

function GroupsContent() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addingTo, setAddingTo] = useState(null);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/groups');
      const list = Array.isArray(data.data) ? data.data : (data.data.items || []);
      const withMembers = await Promise.all(list.map(async (g) => {
        try {
          const { data: m } = await api.get(`/groups/${g.id}/members`);
          return { ...g, members: m.data || [] };
        } catch { return { ...g, members: [] }; }
      }));
      setGroups(withMembers);
    } catch (e) {
      toast.error('Failed to load groups');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleRemove = async (groupId, userId, userName) => {
    if (!confirm(`Remove ${userName} from this group?`)) return;
    try {
      await api.delete(`/groups/${groupId}/members/${userId}`);
      toast.success('Removed');
      load();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Groups</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Telesellers can belong to multiple groups
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ManageFieldsButton entityType="group" size="sm" />
          <Button size="sm" onClick={() => setCreatingGroup(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> New group
          </Button>
        </div>
      </div>

      {loading && <p className="text-xs text-muted-foreground">Loading...</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {groups.map((g) => (
          <Card key={g.id}>
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-sm flex items-center gap-2">
                  {g.name}
                  {g.language && <LanguageBadge language={g.language} size="xs" />}
                </CardTitle>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {g.members?.length || 0} member{(g.members?.length || 0) !== 1 ? 's' : ''}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => setEditingGroup(g)}
                  title="Edit group + custom fields"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="outline"
                  className="h-7 w-7 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
                  onClick={() => setAddingTo(g)}
                  title="Add member"
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {(g.members?.length || 0) === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-3">
                  No members yet — click + to add
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {g.members.map((m) => (
                    <div
                      key={m.membership_id}
                      className="inline-flex items-center gap-1.5 px-2 py-1 rounded border bg-background/50 group"
                    >
                      <div className="w-5 h-5 rounded-full bg-purple-500/15 text-purple-300 flex items-center justify-center text-[9px] font-medium">
                        {m.user?.first_name?.[0]}{m.user?.last_name?.[0]}
                      </div>
                      <span className="text-xs">
                        {m.user?.first_name} {m.user?.last_name}
                      </span>
                      {m.is_senior && (
                        <Crown
                          className="h-2.5 w-2.5 text-amber-400"
                          aria-label="Senior"
                        />
                      )}
                      <button
                        onClick={() => handleRemove(g.id, m.user.id, m.user.first_name)}
                        className="text-muted-foreground hover:text-red-400 transition-colors ml-1"
                        title="Remove from group"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <AddMemberDialog
        group={addingTo}
        allGroups={groups}
        onClose={() => setAddingTo(null)}
        onAdded={load}
      />

      <GroupDialog
        open={creatingGroup}
        onOpenChange={setCreatingGroup}
        group={null}
        onSaved={load}
      />
      <GroupDialog
        open={!!editingGroup}
        onOpenChange={(o) => { if (!o) setEditingGroup(null); }}
        group={editingGroup}
        onSaved={load}
      />
    </div>
  );
}

function AddMemberDialog({ group, allGroups = [], onClose, onAdded }) {
  const [candidates, setCandidates] = useState([]);
  const [search, setSearch] = useState('');
  const [language, setLanguage] = useState('');
  const [inGroup, setInGroup] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [adding, setAdding] = useState(false);

  // Reset filters whenever the dialog opens on a different group.
  useEffect(() => {
    if (!group) return;
    setSearch('');
    setLanguage('');
    setInGroup('');
    setRoleFilter('');
  }, [group?.id]);

  useEffect(() => {
    if (!group) return undefined;
    const t = setTimeout(() => {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (language) params.set('language', language);
      if (inGroup) params.set('in_group', inGroup);
      if (roleFilter) params.set('role', roleFilter);
      api
        .get(`/groups/${group.id}/candidates?${params.toString()}`)
        .then(({ data }) => setCandidates(data.data || []))
        .catch(() => {});
    }, 200);
    return () => clearTimeout(t);
  }, [group, search, language, inGroup, roleFilter]);

  const activeFilterCount = [language, inGroup, roleFilter].filter(Boolean).length;
  const clearFilters = () => {
    setLanguage('');
    setInGroup('');
    setRoleFilter('');
  };
  const otherGroups = (allGroups || []).filter((g) => g.id !== group?.id);

  const add = async (userId) => {
    setAdding(true);
    try {
      await api.post(`/groups/${group.id}/members`, { user_id: userId });
      toast.success('Added');
      onAdded?.();
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed');
    } finally {
      setAdding(false);
    }
  };

  if (!group) return null;

  return (
    <Dialog open={!!group} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add member to {group.name}</DialogTitle>
          <DialogDescription className="text-xs">
            Pick a teleseller or senior. They can be in multiple groups.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 text-sm"
              autoFocus
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={language || 'all'}
              onValueChange={(v) => setLanguage(v === 'all' ? '' : v)}
            >
              <SelectTrigger className="h-8 text-xs w-[140px]">
                <SelectValue placeholder="Language" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All languages</SelectItem>
                {LANGUAGES.map((l) => (
                  <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={inGroup || 'all'}
              onValueChange={(v) => setInGroup(v === 'all' ? '' : v)}
            >
              <SelectTrigger className="h-8 text-xs w-[180px]">
                <SelectValue placeholder="In group" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any group</SelectItem>
                {otherGroups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={roleFilter || 'all'}
              onValueChange={(v) => setRoleFilter(v === 'all' ? '' : v)}
            >
              <SelectTrigger className="h-8 text-xs w-[130px]">
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Both</SelectItem>
                <SelectItem value="tele_sales">Telesellers</SelectItem>
                <SelectItem value="senior">Seniors</SelectItem>
              </SelectContent>
            </Select>

            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={clearFilters}
                className="text-[10px] text-muted-foreground hover:text-red-400 inline-flex items-center gap-1"
              >
                <X className="h-2.5 w-2.5" />Clear filters
              </button>
            )}
          </div>

          <p className="text-[10px] text-muted-foreground">
            {candidates.length === 100
              ? 'Showing first 100 matches — narrow with filters above.'
              : `${candidates.length} candidate${candidates.length === 1 ? '' : 's'}`}
          </p>
          <div className="max-h-80 overflow-y-auto divide-y border rounded-md">
            {candidates.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-6">
                No more telesellers or seniors to add. Everyone matching is already a member.
              </p>
            )}
            {candidates.map((u) => (
              <div
                key={u.id}
                className="flex items-center justify-between gap-2 p-2.5 hover:bg-muted/20"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-full bg-purple-500/15 text-purple-300 flex items-center justify-center text-[10px] font-medium">
                    {u.first_name?.[0]}{u.last_name?.[0]}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs">
                      {u.first_name} {u.last_name}{' '}
                      <span className="text-muted-foreground capitalize">
                        · {u.role?.replace(/_/g, ' ')}
                      </span>
                    </p>
                    <div className="flex gap-1 mt-0.5">
                      {(u.languages || []).slice(0, 3).map((l) => (
                        <LanguageBadge key={l} language={l} size="xs" />
                      ))}
                    </div>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  disabled={adding}
                  onClick={() => add(u.id)}
                >
                  <Plus className="h-3 w-3 mr-1" />Add
                </Button>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
