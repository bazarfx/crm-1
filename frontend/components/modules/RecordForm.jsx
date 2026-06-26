'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save, Loader2, ListTree } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { unwrap } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { DynamicFields, ManageFieldsButton } from '@/components/dynamic/EditableForm';
import {
  FormPageHeader, FormPageBody, FormSection,
} from '@/components/shared/FormShell';
import { moduleByKey, iconForModule, fetchModules } from '@/lib/modules';

/** Generic create/edit form for a custom module's record. */
export default function RecordForm({ moduleKey, recordId = null }) {
  const router = useRouter();
  const isEdit = !!recordId;
  const [mod, setMod] = useState(() => moduleByKey(moduleKey));
  const singular = mod?.label_singular || 'Record';
  const plural = mod?.label_plural || 'Records';
  const Icon = iconForModule(mod || moduleKey);

  const [customFields, setCustomFields] = useState({});
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);

  // Resolve the module (for label/icon) on a hard load / deep link where the
  // registry cache isn't warm yet.
  useEffect(() => {
    if (mod) return;
    fetchModules().then((list) => setMod(list.find((m) => m.key === moduleKey) || null)).catch(() => {});
  }, [moduleKey, mod]);

  useEffect(() => {
    if (!isEdit) return;
    let alive = true;
    api.get(`/modules/${moduleKey}/records/${recordId}`)
      .then((r) => { if (alive) setCustomFields(unwrap(r)?.custom_fields || {}); })
      .catch((e) => { toast.error(e?.response?.data?.message || 'Failed to load record'); router.push(`/m/${moduleKey}`); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [moduleKey, recordId, isEdit, router]);

  const save = async () => {
    setSaving(true);
    try {
      if (isEdit) await api.patch(`/modules/${moduleKey}/records/${recordId}`, { custom_fields: customFields });
      else await api.post(`/modules/${moduleKey}/records`, { custom_fields: customFields });
      toast.success(isEdit ? `${singular} updated` : `${singular} created`);
      router.push(`/m/${moduleKey}`);
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="-mt-4 lg:-mt-6">
      <FormPageHeader
        icon={Icon}
        title={isEdit ? `Edit ${singular}` : `New ${singular}`}
        parent={plural}
        parentHref={`/m/${moduleKey}`}
        backHref={`/m/${moduleKey}`}
        actions={(
          <>
            <ManageFieldsButton entityType={moduleKey} label="Fields" size="sm" />
            <Button variant="outline" size="sm" onClick={() => router.push(`/m/${moduleKey}`)} disabled={saving}>Cancel</Button>
            <Button size="sm" onClick={save} disabled={saving || loading}>
              {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
              {saving ? 'Saving…' : isEdit ? 'Save changes' : `Create ${singular}`}
            </Button>
          </>
        )}
      />

      {loading ? (
        <div className="py-24 flex items-center justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : (
        <FormPageBody width="max-w-3xl">
          <FormSection icon={ListTree} title={`${singular} details`} description={`Fields defined for the ${plural} module.`}>
            <DynamicFields
              entityType={moduleKey}
              values={customFields}
              onChange={setCustomFields}
            />
          </FormSection>
        </FormPageBody>
      )}
    </div>
  );
}
