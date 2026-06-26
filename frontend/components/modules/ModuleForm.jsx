'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Boxes, Save, Loader2, Check, Lock, Palette, Type, Power,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api, { unwrap } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  FormPageHeader, FormPageBody, FormSection, Field,
} from '@/components/shared/FormShell';
import { ICON_SET, iconByName } from '@/lib/moduleIcons';
import { invalidateModules } from '@/lib/modules';
import { cn } from '@/lib/utils';

const SWATCHES = [
  '#EF4444', '#F97316', '#F59E0B', '#10B981', '#14B8A6',
  '#3B82F6', '#4F8EF7', '#6366F1', '#8B5CF6', '#EC4899', '#64748B', '#6B7280',
];

export default function ModuleForm({ moduleId = null }) {
  const router = useRouter();
  const isEdit = !!moduleId;
  const [form, setForm] = useState({
    label_singular: '', label_plural: '', icon: 'Boxes', color: '#4F8EF7',
    description: '', is_active: true,
  });
  const [isSystem, setIsSystem] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const pluralEdited = useRef(isEdit);

  useEffect(() => {
    if (!isEdit) return;
    let alive = true;
    api.get(`/modules/${moduleId}`)
      .then((r) => {
        if (!alive) return;
        const m = unwrap(r) || {};
        setIsSystem(!!m.is_system);
        setForm({
          label_singular: m.label_singular || '',
          label_plural: m.label_plural || '',
          icon: m.icon || 'Boxes',
          color: m.color || '#4F8EF7',
          description: m.description || '',
          is_active: m.is_active !== false,
        });
      })
      .catch((e) => { toast.error(e?.response?.data?.message || 'Failed to load module'); router.push('/settings/modules'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [moduleId, isEdit, router]);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const onSingular = (v) => {
    setForm((p) => {
      const next = { ...p, label_singular: v };
      if (!pluralEdited.current) next.label_plural = v ? `${v}s` : '';
      return next;
    });
  };

  const save = async () => {
    if (!form.label_singular.trim()) { toast.error('Singular label is required'); return; }
    if (!form.label_plural.trim()) { toast.error('Plural label is required'); return; }
    setSaving(true);
    try {
      if (isEdit) await api.patch(`/modules/${moduleId}`, form);
      else await api.post('/modules', form);
      invalidateModules();
      toast.success(isEdit ? 'Module updated' : 'Module created');
      router.push('/settings/modules');
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const HeaderIcon = iconByName(form.icon);

  return (
    <div className="-mt-4 lg:-mt-6">
      <FormPageHeader
        icon={HeaderIcon}
        title={isEdit ? (form.label_plural || 'Edit module') : 'New module'}
        parent="Modules"
        parentHref="/settings/modules"
        backHref="/settings/modules"
        badge={isSystem && (
          <Badge variant="outline" className="text-[9px] h-4 px-1.5 gap-0.5 text-muted-foreground">
            <Lock className="h-2.5 w-2.5" /> System
          </Badge>
        )}
        actions={(
          <>
            <Button variant="outline" size="sm" onClick={() => router.push('/settings/modules')} disabled={saving}>Cancel</Button>
            <Button size="sm" onClick={save} disabled={saving || loading}>
              {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
              {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create module'}
            </Button>
          </>
        )}
      />

      {loading ? (
        <div className="py-24 flex items-center justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : (
        <FormPageBody width="max-w-3xl">
          <FormSection icon={Type} title="Identity" description="How this module is named across the CRM.">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">
              <Field label="Singular label" required>
                <Input value={form.label_singular} onChange={(e) => onSingular(e.target.value)} placeholder="Property" />
              </Field>
              <Field label="Plural label" required>
                <Input
                  value={form.label_plural}
                  onChange={(e) => { pluralEdited.current = true; set('label_plural', e.target.value); }}
                  placeholder="Properties"
                />
              </Field>
              <Field label="Description" hint="Optional" className="sm:col-span-2">
                <Textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={2} className="text-sm" placeholder="What does this module track?" />
              </Field>
            </div>
          </FormSection>

          <FormSection icon={Palette} title="Appearance" description="Icon and colour for nav and lists.">
            <Field label="Icon">
              <div className="flex flex-wrap gap-1.5">
                {ICON_SET.map(({ name, Icon }) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => set('icon', name)}
                    aria-label={name}
                    className={cn(
                      'h-9 w-9 rounded-lg border inline-flex items-center justify-center transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                      form.icon === name ? 'border-foreground/40 bg-muted text-foreground' : 'border-border text-muted-foreground hover:bg-muted',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Colour" className="mt-4">
              <div className="flex flex-wrap gap-1.5">
                {SWATCHES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => set('color', c)}
                    aria-label={c}
                    className={cn(
                      'h-7 w-7 rounded-md border inline-flex items-center justify-center transition-transform hover:scale-110',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                      form.color === c ? 'ring-2 ring-offset-2 ring-offset-background ring-foreground/40' : 'border-border',
                    )}
                    style={{ background: c }}
                  >
                    {form.color === c && <Check className="h-3.5 w-3.5 text-white" />}
                  </button>
                ))}
              </div>
            </Field>
          </FormSection>

          {!isSystem && (
            <div className="flex items-center justify-between gap-4 rounded-lg border bg-card px-4 py-3">
              <div className="flex items-start gap-2.5 min-w-0">
                <Power className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-medium">Active</p>
                  <p className="text-[11px] text-muted-foreground">Inactive modules are hidden from navigation but keep their data.</p>
                </div>
              </div>
              <Switch checked={!!form.is_active} onCheckedChange={(v) => set('is_active', v)} />
            </div>
          )}
        </FormPageBody>
      )}
    </div>
  );
}
