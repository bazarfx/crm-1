'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Network, Save, Loader2, Check, Lock, ShieldCheck, GitBranch, Copy, Share2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api, { unwrap } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  FormPageHeader, FormPageBody, FormSection, Field,
} from '@/components/shared/FormShell';
import { invalidateRoles } from '@/lib/roles';
import { cn } from '@/lib/utils';

const SWATCHES = [
  '#EF4444', '#F97316', '#F59E0B', '#10B981', '#14B8A6',
  '#3B82F6', '#4F8EF7', '#6366F1', '#8B5CF6', '#EC4899', '#64748B', '#6B7280',
];

const NONE = '__none__';

/** roleId = null → create. Otherwise edit that role. */
export default function RoleForm({ roleId = null }) {
  const router = useRouter();
  const sp = useSearchParams();
  const isEdit = !!roleId;

  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '', description: '', color: '#4F8EF7',
    parent_role_id: NONE, share_data_with_peers: false, copy_permissions_from: NONE,
  });
  const [isSystem, setIsSystem] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await api.get('/roles');
        const list = unwrap(res) || [];
        if (!alive) return;
        setRoles(list);

        if (isEdit) {
          const role = list.find((r) => r.id === roleId) || unwrap(await api.get(`/roles/${roleId}`));
          if (role) {
            setIsSystem(!!role.is_system);
            setForm({
              name: role.name || '',
              description: role.description || '',
              color: role.color || '#4F8EF7',
              parent_role_id: role.parent_role_id || NONE,
              share_data_with_peers: !!role.share_data_with_peers,
              copy_permissions_from: NONE,
            });
          }
        } else {
          const parentParam = sp.get('parent');
          if (parentParam && list.some((r) => r.id === parentParam)) {
            setForm((f) => ({ ...f, parent_role_id: parentParam }));
          }
        }
      } catch (e) {
        toast.error(e?.response?.data?.message || 'Failed to load roles');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [roleId, isEdit]); // eslint-disable-line react-hooks/exhaustive-deps

  // Descendants of the role being edited can't become its parent (cycle).
  const blockedParentIds = useMemo(() => {
    if (!isEdit) return new Set();
    const childrenOf = new Map();
    for (const r of roles) {
      if (!childrenOf.has(r.parent_role_id)) childrenOf.set(r.parent_role_id, []);
      childrenOf.get(r.parent_role_id).push(r);
    }
    const blocked = new Set([roleId]);
    const walk = (id) => {
      for (const c of childrenOf.get(id) || []) { blocked.add(c.id); walk(c.id); }
    };
    walk(roleId);
    return blocked;
  }, [roles, roleId, isEdit]);

  const parentOptions = roles.filter((r) => r.show_in_tree && !blockedParentIds.has(r.id));
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const save = async () => {
    if (!form.name.trim()) { toast.error('Role name is required'); return; }
    const payload = {
      name: form.name.trim(),
      description: form.description || null,
      color: form.color,
      parent_role_id: form.parent_role_id === NONE ? null : form.parent_role_id,
      share_data_with_peers: form.share_data_with_peers,
    };
    if (!isEdit && form.copy_permissions_from !== NONE) {
      payload.copy_permissions_from = form.copy_permissions_from;
    }
    setSaving(true);
    try {
      if (isEdit) await api.patch(`/roles/${roleId}`, payload);
      else await api.post('/roles', payload);
      invalidateRoles();
      toast.success(isEdit ? 'Role updated' : 'Role created');
      router.push('/settings/roles');
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="-mt-4 lg:-mt-6">
      <FormPageHeader
        icon={Network}
        title={isEdit ? (form.name || 'Edit role') : 'New role'}
        parent="Roles"
        parentHref="/settings/roles"
        backHref="/settings/roles"
        badge={isSystem && (
          <Badge variant="outline" className="text-[9px] h-4 px-1.5 gap-0.5 text-muted-foreground">
            <Lock className="h-2.5 w-2.5" /> System
          </Badge>
        )}
        actions={(
          <>
            <Button variant="outline" size="sm" onClick={() => router.push('/settings/roles')} disabled={saving}>
              Cancel
            </Button>
            <Button size="sm" onClick={save} disabled={saving || loading}>
              {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
              {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create role'}
            </Button>
          </>
        )}
      />

      {loading ? (
        <div className="py-24 flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : (
        <FormPageBody width="max-w-3xl">
          <FormSection icon={ShieldCheck} title="Identity" description="What this role is called and how it reads in the hierarchy.">
            <div className="space-y-4">
              <Field label="Role name" required>
                <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Regional Head" />
              </Field>
              <Field label="Description" hint="Optional">
                <Input value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="What this role is responsible for" />
              </Field>
              <Field label="Colour">
                <div className="flex flex-wrap gap-1.5">
                  {SWATCHES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => set('color', c)}
                      className={cn(
                        'h-7 w-7 rounded-md border transition-transform hover:scale-110 inline-flex items-center justify-center',
                        form.color === c ? 'ring-2 ring-offset-2 ring-offset-background ring-foreground/40' : 'border-border',
                      )}
                      style={{ background: c }}
                      aria-label={c}
                    >
                      {form.color === c && <Check className="h-3.5 w-3.5 text-white" />}
                    </button>
                  ))}
                </div>
              </Field>
            </div>
          </FormSection>

          <FormSection icon={GitBranch} title="Hierarchy" description="Where this role sits in the reporting tree.">
            <Field label="Reports to (parent role)">
              <Select value={form.parent_role_id} onValueChange={(v) => set('parent_role_id', v)}>
                <SelectTrigger className="h-10 max-w-md"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— None (top level) —</SelectItem>
                  {parentOptions.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <div className="mt-4 flex items-center justify-between gap-4 rounded-lg border bg-card px-4 py-3">
              <div className="flex items-start gap-2.5 min-w-0">
                <Share2 className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-medium">Share data with peers</p>
                  <p className="text-[11px] text-muted-foreground">
                    Let users at this same level see each other&apos;s records (used by hierarchy-based sharing).
                  </p>
                </div>
              </div>
              <Switch
                checked={form.share_data_with_peers}
                onCheckedChange={(v) => set('share_data_with_peers', v)}
              />
            </div>
          </FormSection>

          {!isEdit && (
            <FormSection icon={Copy} title="Starting permissions" description="Copy an existing role's permission levels as a starting point.">
              <Field label="Copy permissions from">
                <Select value={form.copy_permissions_from} onValueChange={(v) => set('copy_permissions_from', v)}>
                  <SelectTrigger className="h-10 max-w-md"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Start with no access</SelectItem>
                    {roles.filter((r) => r.key !== 'super_admin').map((r) => (
                      <SelectItem key={r.id} value={r.key}>{r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <p className="text-[11px] text-muted-foreground mt-2">
                You can fine-tune every permission afterwards on the <span className="font-medium text-foreground">Permissions</span> page.
              </p>
            </FormSection>
          )}
        </FormPageBody>
      )}
    </div>
  );
}
