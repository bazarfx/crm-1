'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Network, Plus, ChevronRight, ChevronDown, Pencil, Trash2, CornerDownRight,
  Users, Lock, Loader2,
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

function RolesContent() {
  const router = useRouter();
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(() => new Set());

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/roles');
      const list = (unwrap(res) || []).filter((r) => r.show_in_tree);
      setRoles(list);
      setExpanded(new Set(list.map((r) => r.id))); // default: fully expanded
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to load roles');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Build the tree: roots are roles whose parent isn't in the visible set.
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

  const toggle = (id) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const expandAll = () => setExpanded(new Set(roles.map((r) => r.id)));
  const collapseAll = () => setExpanded(new Set());

  const remove = async (role) => {
    if (role.user_count > 0) {
      toast.error(`${role.user_count} user${role.user_count === 1 ? '' : 's'} still use this role. Reassign them first.`);
      return;
    }
    if (!confirm(`Delete role "${role.name}"? Any child roles move up to its parent.`)) return;
    try {
      await api.delete(`/roles/${role.id}`);
      invalidateRoles();
      toast.success('Role deleted');
      load();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Delete failed');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Roles &amp; hierarchy</h1>
          <p className="text-sm text-muted-foreground mt-0.5 max-w-xl">
            Define your organisation hierarchy and how data is shared between users.
            Drag roles into shape by changing each role&apos;s parent.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={expandAll} className="text-muted-foreground">Expand all</Button>
          <span className="text-border">|</span>
          <Button variant="ghost" size="sm" onClick={collapseAll} className="text-muted-foreground">Collapse all</Button>
          <Button size="sm" onClick={() => router.push('/settings/roles/new')}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> New role
          </Button>
        </div>
      </div>

      <div className="rounded-xl border bg-card shadow-sm">
        {loading ? (
          <div className="py-20 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : roots.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">No roles defined.</div>
        ) : (
          <div className="p-3 sm:p-4">
            {roots.map((root) => (
              <RoleNode
                key={root.id}
                role={root}
                depth={0}
                childrenOf={childrenOf}
                expanded={expanded}
                onToggle={toggle}
                onEdit={(r) => router.push(`/settings/roles/${r.id}`)}
                onAddChild={(r) => router.push(`/settings/roles/new?parent=${r.id}`)}
                onDelete={remove}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RoleNode({ role, depth, childrenOf, expanded, onToggle, onEdit, onAddChild, onDelete }) {
  const kids = childrenOf.get(role.id) || [];
  const hasKids = kids.length > 0;
  const isOpen = expanded.has(role.id);

  return (
    <div>
      <div
        className="group flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-muted/50 transition-colors"
        style={{ marginLeft: depth ? 8 : 0 }}
      >
        {/* expand toggle */}
        {hasKids ? (
          <button
            type="button"
            onClick={() => onToggle(role.id)}
            className="h-5 w-5 inline-flex items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground flex-shrink-0"
            aria-label={isOpen ? 'Collapse' : 'Expand'}
          >
            {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        ) : (
          <span className="h-5 w-5 inline-flex items-center justify-center flex-shrink-0">
            <span className="h-1 w-1 rounded-full bg-border" />
          </span>
        )}

        {/* colour dot */}
        <span
          className="h-2.5 w-2.5 rounded-full flex-shrink-0 ring-2 ring-background"
          style={{ background: role.color || '#64748B' }}
        />

        {/* name + meta */}
        <button
          type="button"
          onClick={() => onEdit(role)}
          className="min-w-0 flex items-center gap-2 text-left"
        >
          <span className="text-sm font-medium truncate group-hover:underline">{role.name}</span>
        </button>

        {role.is_system && (
          <Badge variant="outline" className="text-[9px] h-4 px-1.5 gap-0.5 text-muted-foreground">
            <Lock className="h-2.5 w-2.5" /> System
          </Badge>
        )}
        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <Users className="h-3 w-3" />
          {role.user_count ?? 0}
        </span>

        {/* hover actions */}
        <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button variant="ghost" size="icon" className="h-7 w-7" title="Add sub-role" onClick={() => onAddChild(role)}>
            <CornerDownRight className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit role" onClick={() => onEdit(role)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          {!role.is_system && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-red-600 dark:hover:text-red-400"
              title="Delete role"
              onClick={() => onDelete(role)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {hasKids && isOpen && (
        <div className="ml-[18px] pl-3 border-l border-dashed border-border">
          {kids.map((child) => (
            <RoleNode
              key={child.id}
              role={child}
              depth={depth + 1}
              childrenOf={childrenOf}
              expanded={expanded}
              onToggle={onToggle}
              onEdit={onEdit}
              onAddChild={onAddChild}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
