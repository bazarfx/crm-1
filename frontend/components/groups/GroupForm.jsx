'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Building2, Workflow, SlidersHorizontal, Save, Loader2, Power,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api, { unwrap } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { LANGUAGES } from '@/lib/languages';
import { DynamicFields, ManageFieldsButton } from '@/components/dynamic/EditableForm';
import {
  FormPageHeader, FormPageBody, FormSection, Field,
} from '@/components/shared/FormShell';

const EMPTY = {
  name: '', type: 'telesales', language: '', description: '',
  is_active: true, custom_fields: {},
};

/** groupId = null → create. Otherwise edit that group. */
export default function GroupForm({ groupId = null }) {
  const router = useRouter();
  const isEdit = !!groupId;
  const [form, setForm] = useState(isEdit ? null : EMPTY);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isEdit) return;
    let alive = true;
    api.get(`/groups/${groupId}`)
      .then((r) => {
        if (!alive) return;
        const g = unwrap(r) || {};
        setForm({
          name: g.name || '',
          type: g.type || 'telesales',
          language: g.language || '',
          description: g.description || '',
          is_active: g.is_active !== false,
          custom_fields: g.custom_fields || {},
        });
      })
      .catch((e) => {
        toast.error(e?.response?.data?.message || 'Failed to load group');
        router.push('/groups');
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [groupId, isEdit, router]);

  const setF = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const save = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      if (isEdit) await api.patch(`/groups/${groupId}`, form);
      else { const res = await api.post('/groups', form); unwrap(res); }
      toast.success(isEdit ? 'Group updated' : 'Group created');
      router.push('/groups');
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="-mt-4 lg:-mt-6">
      <FormPageHeader
        icon={Building2}
        title={isEdit ? (form?.name || 'Edit group') : 'New group'}
        parent="Groups"
        parentHref="/groups"
        backHref="/groups"
        badge={form && !form.is_active && (
          <Badge variant="outline" className="text-[9px] h-4 px-1.5 text-muted-foreground">Inactive</Badge>
        )}
        actions={(
          <>
            <ManageFieldsButton entityType="group" label="Fields" size="sm" />
            <Button variant="outline" size="sm" onClick={() => router.push('/groups')} disabled={saving}>
              Cancel
            </Button>
            <Button size="sm" onClick={save} disabled={saving || loading}>
              {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
              {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create group'}
            </Button>
          </>
        )}
      />

      {loading || !form ? (
        <div className="py-24 flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : (
        <FormPageBody width="max-w-3xl">
          <FormSection icon={Building2} title="Identity" description="What this group is called and what it's for.">
            <div className="space-y-4">
              <Field label="Name" required>
                <Input value={form.name} onChange={(e) => setF('name', e.target.value)} placeholder="Tamil Team" />
              </Field>
              <Field label="Description" hint="Optional">
                <Textarea
                  value={form.description}
                  onChange={(e) => setF('description', e.target.value)}
                  rows={2}
                  placeholder="Who's in this group? What's it for?"
                  className="text-sm"
                />
              </Field>
            </div>
          </FormSection>

          <FormSection icon={Workflow} title="Routing" description="How language-tagged leads round-robin into this group.">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">
              <Field label="Type">
                <Select value={form.type} onValueChange={(v) => setF('type', v)}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="telesales">Telesales (lead handlers)</SelectItem>
                    <SelectItem value="senior">Senior (direct-ARK)</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Language">
                <Select value={form.language || undefined} onValueChange={(v) => setF('language', v)}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    {LANGUAGES.map((l) => (
                      <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <div className="mt-4 flex items-center justify-between gap-4 rounded-lg border bg-card px-4 py-3">
              <div className="flex items-start gap-2.5 min-w-0">
                <Power className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-medium">Active</p>
                  <p className="text-[11px] text-muted-foreground">
                    Inactive groups keep their members but are skipped by round-robin.
                  </p>
                </div>
              </div>
              <Switch checked={!!form.is_active} onCheckedChange={(v) => setF('is_active', v)} />
            </div>
          </FormSection>

          <FormSection icon={SlidersHorizontal} title="Custom fields" description="Organisation-specific fields defined by your admins.">
            <DynamicFields
              entityType="group"
              values={form.custom_fields || {}}
              onChange={(cf) => setF('custom_fields', cf)}
              hideEmptySections
            />
          </FormSection>
        </FormPageBody>
      )}
    </div>
  );
}
