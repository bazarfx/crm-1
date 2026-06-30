'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus, Minus, Pencil, Trash2, CornerDownRight, Users, Lock, Loader2,
  GripVertical, Check, X, ChevronRight,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api, { unwrap } from '@/lib/api';
import RoleGuard from '@/components/layout/RoleGuard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { invalidateRoles } from '@/lib/roles';
import { cn } from '@/lib/utils';

export default function RolesPage() {
  return (
    <RoleGuard allow={['super_admin', 'admin']}>
      <RolesContent />
    </RoleGuard>
  );
}

const RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1';

function RolesContent() {
  const router = useRouter();
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(() => new Set());

  // Inline edit state
  const [addUnder, setAddUnder] = useState(null);   // parent id | 'root' | null
  const [draft, setDraft] = useState('');
  const [renameId, setRenameId] = useState(null);
  const [renameVal, setRenameVal] = useState('');
  const [busyId, setBusyId] = useState(null);

  // Drag-to-reparent state
  const [dragId, setDragId] = useState(null);
  const [overId, setOverId] = useState(null);       // id | 'root'

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/roles');
      const list = (unwrap(res) || []).filter((r) => r.show_in_tree);
      setRoles(list);
      setExpanded((prev) => (prev.size ? prev : new Set(list.map((r) => r.id))));
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to load roles');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const { roots, childrenOf } = useMemo(() => {
    const ids = new Set(roles.map((r) => r.id));
    const childrenOf = new Map();
    const roots = [];
    for (const r of roles) {
      if (r.parent_role_id && ids.has(r.parent_role_id)) {
        if (!childrenOf.has(r.parent_role_id)) childrenOf.set(r.parent_role_id, []);
        childrenOf.get(r.parent_role_id).push(r);
      } else {
        roots.push(r);
      }
    }
    return { roots, childrenOf };
  }, [roles]);

  const byId = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles]);

  const toggle = (id) => setExpanded((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const expandAll = () => setExpanded(new Set(roles.map((r) => r.id)));
  const collapseAll = () => setExpanded(new Set());

  // Is `candidateId` inside the subtree rooted at `ancestorId`? (drop guard)
  const isDescendant = (candidateId, ancestorId) => {
    const stack = [...(childrenOf.get(ancestorId) || [])];
    while (stack.length) {
      const n = stack.pop();
      if (n.id === candidateId) return true;
      for (const c of childrenOf.get(n.id) || []) stack.push(c);
    }
    return false;
  };

  const reparent = async (id, parentId) => {
    if (!id || id === parentId) return;
    const role = byId.get(id);
    if (parentId && parentId !== 'root' && isDescendant(parentId, id)) {
      toast.error("Can't move a role beneath one of its own sub-roles");
      return;
    }
    if (role?.key === 'super_admin' && parentId && parentId !== 'root') {
      toast.error('Super Admin must stay at the top of the hierarchy');
      return;
    }
    setBusyId(id);
    try {
      await api.patch(`/roles/${id}`, { parent_role_id: parentId === 'root' ? null : parentId });
      invalidateRoles();
      if (parentId && parentId !== 'root') setExpanded((p) => new Set(p).add(parentId));
      toast.success('Hierarchy updated');
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Move failed');
    } finally {
      setBusyId(null);
    }
  };

  const submitAdd = async (parentId) => {
    const name = draft.trim();
    if (!name) { setAddUnder(null); setDraft(''); return; }
    setBusyId(parentId);
    try {
      await api.post('/roles', { name, parent_role_id: parentId === 'root' ? null : parentId });
      invalidateRoles();
      if (parentId && parentId !== 'root') setExpanded((p) => new Set(p).add(parentId));
      toast.success(`Role “${name}” created`);
      setAddUnder(null); setDraft('');
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Create failed');
    } finally {
      setBusyId(null);
    }
  };

  const submitRename = async (role) => {
    const name = renameVal.trim();
    if (!name || name === role.name) { setRenameId(null); return; }
    setBusyId(role.id);
    try {
      await api.patch(`/roles/${role.id}`, { name });
      invalidateRoles();
      toast.success('Role renamed');
      setRenameId(null);
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Rename failed');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (role) => {
    if (role.is_system) { toast.error('System roles cannot be deleted'); return; }
    if (role.user_count > 0) {
      toast.error(`${role.user_count} user${role.user_count === 1 ? '' : 's'} still use this role. Reassign them first.`);
      return;
    }
    if (!confirm(`Delete role “${role.name}”? Any sub-roles move up to its parent.`)) return;
    setBusyId(role.id);
    try {
      await api.delete(`/roles/${role.id}`);
      invalidateRoles();
      toast.success('Role deleted');
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Delete failed');
    } finally {
      setBusyId(null);
    }
  };

  const startAdd = (parentId) => {
    if (parentId && parentId !== 'root') setExpanded((p) => new Set(p).add(parentId));
    setRenameId(null);
    setDraft('');
    setAddUnder(parentId);
  };
  const startRename = (role) => {
    setAddUnder(null);
    setRenameVal(role.name);
    setRenameId(role.id);
  };

  const dnd = {
    dragId, overId, setOverId, setDragId, isDescendant, reparent, byId,
  };
  const inline = {
    addUnder, draft, setDraft, submitAdd, setAddUnder,
    renameId, renameVal, setRenameVal, submitRename, startRename, startAdd, busyId,
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Roles &amp; hierarchy</h1>
          <p className="text-sm text-muted-foreground mt-0.5 max-w-2xl">
            Define how data is shared among users based on your role hierarchy. Drag any
            role onto another to re-parent it, double-click to rename, or add sub-roles inline.
          </p>
        </div>
        <Button size="sm" onClick={() => router.push('/settings/roles/new')}>
          <Plus className="h-3.5 w-3.5 mr-1.5" /> New role
        </Button>
      </div>

      <div className="flex items-center gap-3 text-xs">
        <button type="button" onClick={expandAll} className={cn('text-primary hover:underline', RING)}>Expand all</button>
        <span className="text-border">|</span>
        <button type="button" onClick={collapseAll} className={cn('text-primary hover:underline', RING)}>Collapse all</button>
        <button
          type="button"
          onClick={() => startAdd('root')}
          className={cn('ml-auto inline-flex items-center gap-1 text-muted-foreground hover:text-foreground', RING)}
        >
          <CornerDownRight className="h-3 w-3" /> Add top-level role
        </button>
      </div>

      <div className="rounded-xl border bg-card shadow-card">
        {loading ? (
          <div className="py-20 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : roots.length === 0 && addUnder !== 'root' ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            No roles defined yet.
            <button type="button" onClick={() => startAdd('root')} className="ml-1 text-primary hover:underline">Create the first one.</button>
          </div>
        ) : (
          <div
            className={cn(
              'p-3 sm:p-4 rounded-xl transition-colors',
              overId === 'root' && dragId ? 'ring-2 ring-inset ring-primary/40 bg-primary/[0.03]' : '',
            )}
            onDragOver={(e) => { if (dragId) { e.preventDefault(); setOverId('root'); } }}
            onDrop={(e) => { e.preventDefault(); if (dragId) reparent(dragId, 'root'); setDragId(null); setOverId(null); }}
          >
            {roots.map((root) => (
              <RoleNode key={root.id} role={root} depth={0} childrenOf={childrenOf}
                expanded={expanded} onToggle={toggle}
                onEdit={(r) => router.push(`/settings/roles/${r.id}`)}
                onDelete={remove} dnd={dnd} inline={inline} />
            ))}
            {addUnder === 'root' && (
              <AddInput value={draft} onChange={setDraft} onSubmit={() => submitAdd('root')} onCancel={() => { setAddUnder(null); setDraft(''); }} placeholder="New top-level role name…" />
            )}
            {dragId && (
              <p className="mt-2 pt-2 border-t border-dashed text-[11px] text-muted-foreground text-center">
                Drop here to make “{byId.get(dragId)?.name}” a top-level role
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* One role + its subtree. Children are rendered with classic dashed tree
 * connectors (vertical spine + horizontal stub per child) to match the spec. */
function RoleNode({ role, depth, childrenOf, expanded, onToggle, onEdit, onDelete, dnd, inline }) {
  const kids = childrenOf.get(role.id) || [];
  const hasKids = kids.length > 0;
  const isOpen = expanded.has(role.id);
  const showChildren = (hasKids && isOpen) || inline.addUnder === role.id;

  return (
    <div>
      <RoleRow role={role} hasKids={hasKids} isOpen={isOpen} onToggle={onToggle}
        onEdit={onEdit} onDelete={onDelete} dnd={dnd} inline={inline} />

      {showChildren && (
        <ul className="list-none m-0 p-0">
          {(isOpen ? kids : []).map((child, idx) => {
            const last = idx === kids.length - 1 && !(inline.addUnder === role.id);
            return (
              <li key={child.id} className="relative pl-6">
                {/* vertical spine */}
                <span aria-hidden className={cn('absolute left-[11px] top-0 w-px border-l border-dashed border-border', last ? 'h-[19px]' : 'h-full')} />
                {/* horizontal stub */}
                <span aria-hidden className="absolute left-[11px] top-[19px] h-px w-[13px] border-t border-dashed border-border" />
                <RoleNode role={child} depth={depth + 1} childrenOf={childrenOf}
                  expanded={expanded} onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} dnd={dnd} inline={inline} />
              </li>
            );
          })}
          {inline.addUnder === role.id && (
            <li className="relative pl-6">
              <span aria-hidden className="absolute left-[11px] top-0 h-[19px] w-px border-l border-dashed border-border" />
              <span aria-hidden className="absolute left-[11px] top-[19px] h-px w-[13px] border-t border-dashed border-border" />
              <AddInput value={inline.draft} onChange={inline.setDraft}
                onSubmit={() => inline.submitAdd(role.id)}
                onCancel={() => { inline.setAddUnder(null); inline.setDraft(''); }}
                placeholder={`Sub-role under ${role.name}…`} />
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

function RoleRow({ role, hasKids, isOpen, onToggle, onEdit, onDelete, dnd, inline }) {
  const { dragId, overId, setOverId, setDragId, reparent } = dnd;
  const isDragging = dragId === role.id;
  const isOver = overId === role.id && dragId && dragId !== role.id;
  const renaming = inline.renameId === role.id;
  const busy = inline.busyId === role.id;

  return (
    <div
      draggable={!renaming}
      onDragStart={(e) => { e.stopPropagation(); setDragId(role.id); e.dataTransfer.effectAllowed = 'move'; }}
      onDragEnd={() => { setDragId(null); setOverId(null); }}
      onDragOver={(e) => { if (dragId && dragId !== role.id) { e.preventDefault(); e.stopPropagation(); setOverId(role.id); } }}
      onDragLeave={(e) => { e.stopPropagation(); setOverId((o) => (o === role.id ? null : o)); }}
      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); if (dragId) reparent(dragId, role.id); setDragId(null); setOverId(null); }}
      className={cn(
        'group/row relative flex items-center gap-1.5 rounded-lg pr-2 h-[38px] transition-colors',
        isOver ? 'bg-primary/10 ring-1 ring-primary/40' : 'hover:bg-muted/50',
        isDragging && 'opacity-40',
      )}
    >
      {/* drag handle */}
      <span className="w-4 flex-shrink-0 flex justify-center text-muted-foreground/40 group-hover/row:text-muted-foreground cursor-grab active:cursor-grabbing" title="Drag to re-parent">
        <GripVertical className="h-3.5 w-3.5" />
      </span>

      {/* expand box (square [-]/[+]) or leaf stub */}
      {hasKids ? (
        <button
          type="button"
          onClick={() => onToggle(role.id)}
          className={cn('h-4 w-4 flex-shrink-0 inline-flex items-center justify-center rounded-[4px] border border-border bg-card text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors', RING)}
          aria-label={isOpen ? 'Collapse' : 'Expand'}
        >
          {isOpen ? <Minus className="h-2.5 w-2.5" strokeWidth={3} /> : <Plus className="h-2.5 w-2.5" strokeWidth={3} />}
        </button>
      ) : (
        <span className="h-4 w-4 flex-shrink-0" />
      )}

      {/* colour dot */}
      <span className="h-2.5 w-2.5 rounded-full flex-shrink-0 ring-2 ring-background" style={{ background: role.color || '#64748B' }} />

      {/* name (inline rename on double-click) */}
      {renaming ? (
        <input
          autoFocus
          value={inline.renameVal}
          onChange={(e) => inline.setRenameVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') inline.submitRename(role); if (e.key === 'Escape') inline.setRenameId(null); }}
          onBlur={() => inline.submitRename(role)}
          className={cn('h-7 px-2 text-sm rounded-md border border-primary/40 bg-background min-w-0 w-48', RING)}
        />
      ) : (
        <button
          type="button"
          onDoubleClick={() => inline.startRename(role)}
          onClick={() => (hasKids ? onToggle(role.id) : onEdit(role))}
          className="min-w-0 flex items-center text-left"
          title="Double-click to rename"
        >
          <span className="text-sm font-medium truncate">{role.name}</span>
        </button>
      )}

      {role.is_system && (
        <Badge variant="outline" className="text-[9px] h-4 px-1.5 gap-0.5 text-muted-foreground">
          <Lock className="h-2.5 w-2.5" /> System
        </Badge>
      )}
      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground" title={`${role.user_count ?? 0} users`}>
        <Users className="h-3 w-3" />{role.user_count ?? 0}
      </span>

      {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}

      {/* hover actions */}
      <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover/row:opacity-100 focus-within:opacity-100 transition-opacity">
        <ActionBtn title="Add sub-role" onClick={() => inline.startAdd(role.id)}><CornerDownRight className="h-3.5 w-3.5" /></ActionBtn>
        <ActionBtn title="Rename" onClick={() => inline.startRename(role)}><Pencil className="h-3.5 w-3.5" /></ActionBtn>
        <ActionBtn title="Edit permissions" onClick={() => onEdit(role)}><ChevronRight className="h-3.5 w-3.5" /></ActionBtn>
        {!role.is_system && (
          <ActionBtn title="Delete role" danger onClick={() => onDelete(role)}><Trash2 className="h-3.5 w-3.5" /></ActionBtn>
        )}
      </div>
    </div>
  );
}

function ActionBtn({ title, onClick, danger, children }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={cn(
        'h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground transition-colors',
        danger ? 'hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/10' : 'hover:text-foreground hover:bg-muted',
        RING,
      )}
    >
      {children}
    </button>
  );
}

function AddInput({ value, onChange, onSubmit, onCancel, placeholder }) {
  return (
    <div className="flex items-center gap-1.5 h-[38px]">
      <span className="w-4" />
      <CornerDownRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') onSubmit(); if (e.key === 'Escape') onCancel(); }}
        placeholder={placeholder}
        className={cn('h-7 px-2 text-sm rounded-md border border-primary/40 bg-background w-56 min-w-0', RING)}
      />
      <button type="button" onClick={onSubmit} aria-label="Create role" className={cn('h-7 w-7 inline-flex items-center justify-center rounded-md text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10', RING)}>
        <Check className="h-3.5 w-3.5" />
      </button>
      <button type="button" onClick={onCancel} aria-label="Cancel" className={cn('h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted', RING)}>
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
