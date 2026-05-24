'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users2, GripVertical, Languages, Building2, Loader2, AlertCircle, Search,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api, { unwrap } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import RoleGuard from '@/components/layout/RoleGuard';
import EmptyState from '@/components/shared/EmptyState';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const ROLE_PILL = {
  tele_sales: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  senior:     'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
};

function memberLabel(u) {
  if (!u) return '';
  return `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email || 'Member';
}

function memberInitials(u) {
  const name = memberLabel(u);
  const parts = name.split(/\s+/);
  return ((parts[0]?.[0] || '?') + (parts[1]?.[0] || '')).toUpperCase();
}

function MemberChip({ member, groupId, canDrag, isDragging, onDragStart, onDragEnd }) {
  return (
    <div
      draggable={canDrag}
      onDragStart={(e) => canDrag && onDragStart(e, member, groupId)}
      onDragEnd={onDragEnd}
      className={cn(
        'group flex items-center gap-2 px-2 py-1.5 rounded-md border bg-background/60',
        'transition-all duration-150',
        canDrag && 'cursor-grab active:cursor-grabbing hover:border-border hover:bg-background',
        isDragging && 'opacity-40 ring-1 ring-blue-400',
      )}
    >
      {canDrag && (
        <GripVertical
          size={12}
          className="text-muted-foreground/50 group-hover:text-muted-foreground flex-shrink-0"
        />
      )}
      <div className="w-6 h-6 rounded-full bg-muted text-foreground flex items-center justify-center text-[10px] font-semibold flex-shrink-0">
        {memberInitials(member)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium truncate">{memberLabel(member)}</p>
        {member.email && (
          <p className="font-mono text-[9px] text-muted-foreground truncate">{member.email}</p>
        )}
      </div>
      {member.role && (
        <span
          className={cn(
            'text-[9px] font-medium px-1.5 py-0.5 rounded border whitespace-nowrap',
            ROLE_PILL[member.role] || 'bg-slate-500/10 text-slate-600 border-slate-500/20',
          )}
        >
          {member.role === 'tele_sales' ? 'tele' : member.role}
        </span>
      )}
    </div>
  );
}

function GroupCard({
  group, canDrag, draggingMemberId, dropTargetId, onDragStart, onDragEnd,
  onDragOver, onDragLeave, onDrop, isMoving,
}) {
  const members = group.members || [];
  const isDropTarget = dropTargetId === group.id;
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
    >
      <Card
        onDragOver={(e) => onDragOver(e, group.id)}
        onDragLeave={(e) => onDragLeave(e, group.id)}
        onDrop={(e) => onDrop(e, group.id)}
        className={cn(
          'transition-all duration-150 relative',
          isDropTarget && 'ring-2 ring-blue-400 border-blue-400/50 bg-blue-500/[0.03]',
        )}
      >
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="text-sm truncate">{group.name}</CardTitle>
              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                {group.type && (
                  <Badge variant="secondary" className="text-[9px] capitalize">
                    <Building2 className="h-2.5 w-2.5 mr-1" />
                    {group.type}
                  </Badge>
                )}
                {group.language && (
                  <Badge variant="secondary" className="text-[9px] capitalize">
                    <Languages className="h-2.5 w-2.5 mr-1" />
                    {group.language}
                  </Badge>
                )}
                {!group.is_active && (
                  <Badge variant="destructive" className="text-[9px]">
                    Inactive
                  </Badge>
                )}
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-lg font-bold tabular-nums leading-none">{members.length}</p>
              <p className="text-[9px] text-muted-foreground mt-0.5 uppercase tracking-wide">
                {members.length === 1 ? 'member' : 'members'}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-1.5 pt-0">
          {isMoving && (
            <div className="absolute inset-0 bg-background/60 backdrop-blur-[1px] rounded-xl flex items-center justify-center z-10">
              <Loader2 size={16} className="animate-spin text-muted-foreground" />
            </div>
          )}
          {members.length === 0 ? (
            <div
              className={cn(
                'text-center py-6 text-[11px] text-muted-foreground border border-dashed rounded-md',
                canDrag && 'border-border/60',
                isDropTarget && 'border-blue-400/50',
              )}
            >
              {canDrag ? 'Drop a member here' : 'No members'}
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {members.map((m) => (
                <motion.div
                  key={m.id}
                  layout
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 4 }}
                  transition={{ duration: 0.15 }}
                >
                  <MemberChip
                    member={m}
                    groupId={group.id}
                    canDrag={canDrag}
                    isDragging={draggingMemberId === `${group.id}:${m.id}`}
                    onDragStart={onDragStart}
                    onDragEnd={onDragEnd}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

function GroupsBoard() {
  const { role } = useAuth();
  const canDrag = role === 'super_admin' || role === 'admin';

  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [search, setSearch] = useState('');

  // Drag state — keep both the source group AND the user so we can call the
  // move endpoint with the right (from, to, user) tuple on drop.
  const [drag, setDrag] = useState(null); // { user, fromGroupId }
  const [dropTargetId, setDropTargetId] = useState(null);
  const [movingGroupId, setMovingGroupId] = useState(null);

  const fetchGroups = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await api.get('/groups', { params: { limit: 100 } });
      const payload = unwrap(res);
      const list = Array.isArray(payload) ? payload : (payload?.data || payload?.items || []);
      setGroups(list);
    } catch (e) {
      setErr(e?.code === 'ERR_NETWORK' ? 'Backend not reachable on :5000' : 'Could not load groups');
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchGroups(); }, [fetchGroups]);

  const onDragStart = useCallback((e, member, fromGroupId) => {
    setDrag({ user: member, fromGroupId });
    // dataTransfer is required for Firefox to fire dragstart; the payload
    // itself is unused — we read from React state on drop.
    try {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', member.id);
    } catch { /* ignore */ }
  }, []);

  const onDragEnd = useCallback(() => {
    setDrag(null);
    setDropTargetId(null);
  }, []);

  const onDragOver = useCallback((e, groupId) => {
    if (!drag || drag.fromGroupId === groupId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dropTargetId !== groupId) setDropTargetId(groupId);
  }, [drag, dropTargetId]);

  const onDragLeave = useCallback((e, groupId) => {
    // Ignore leaves into descendants — only clear when actually leaving the card.
    if (e.currentTarget.contains(e.relatedTarget)) return;
    if (dropTargetId === groupId) setDropTargetId(null);
  }, [dropTargetId]);

  const moveMember = useCallback(async (user, fromGroupId, toGroupId) => {
    // Optimistic update — pop from source, push into destination. Revert on failure.
    const snapshot = groups;
    setGroups((cur) =>
      cur.map((g) => {
        if (g.id === fromGroupId) {
          return { ...g, members: (g.members || []).filter((m) => m.id !== user.id) };
        }
        if (g.id === toGroupId) {
          const already = (g.members || []).some((m) => m.id === user.id);
          return already ? g : { ...g, members: [...(g.members || []), user] };
        }
        return g;
      }),
    );
    setMovingGroupId(toGroupId);
    try {
      await api.post('/groups/move-member', {
        user_id: user.id,
        from_group_id: fromGroupId,
        to_group_id: toGroupId,
      });
      toast.success(`Moved ${memberLabel(user)}`);
    } catch (e) {
      setGroups(snapshot);
      toast.error(e?.response?.data?.message || 'Move failed');
    } finally {
      setMovingGroupId(null);
    }
  }, [groups]);

  const onDrop = useCallback((e, toGroupId) => {
    e.preventDefault();
    const payload = drag;
    setDrag(null);
    setDropTargetId(null);
    if (!payload || payload.fromGroupId === toGroupId) return;
    moveMember(payload.user, payload.fromGroupId, toGroupId);
  }, [drag, moveMember]);

  const filtered = useMemo(() => {
    if (!search.trim()) return groups;
    const q = search.trim().toLowerCase();
    return groups.filter((g) => {
      if ((g.name || '').toLowerCase().includes(q)) return true;
      if ((g.language || '').toLowerCase().includes(q)) return true;
      if ((g.type || '').toLowerCase().includes(q)) return true;
      return (g.members || []).some((m) =>
        memberLabel(m).toLowerCase().includes(q)
        || (m.email || '').toLowerCase().includes(q),
      );
    });
  }, [groups, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div>
          <h2 className="text-lg font-semibold text-ink-primary">Groups</h2>
          <p className="text-sm text-ink-secondary mt-0.5">
            Telesales and Senior groups (one per language).
            {canDrag && (
              <span className="ml-1.5 text-foreground">
                Drag members between groups to reassign.
              </span>
            )}
          </p>
        </div>
        <div className="relative">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search groups or members"
            className="h-8 pl-8 w-64"
          />
        </div>
      </div>

      {err && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-3 text-sm text-amber-700 dark:text-amber-400 flex items-center gap-2">
            <AlertCircle size={14} />
            {err}
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="h-48 animate-pulse">
              <CardContent className="p-4" />
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Users2}
          title={search ? 'No matches' : 'No groups yet'}
          message={search ? 'Try a different search term.' : 'Groups load from /api/v1/groups.'}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((g) => (
            <GroupCard
              key={g.id}
              group={g}
              canDrag={canDrag}
              draggingMemberId={drag ? `${drag.fromGroupId}:${drag.user.id}` : null}
              dropTargetId={dropTargetId}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              isMoving={movingGroupId === g.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function GroupsPage() {
  return (
    <RoleGuard allow={['super_admin', 'admin', 'floor_manager']}>
      <GroupsBoard />
    </RoleGuard>
  );
}
