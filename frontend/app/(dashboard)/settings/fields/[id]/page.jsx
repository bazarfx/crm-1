'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import RoleGuard from '@/components/layout/RoleGuard';
import api, { unwrap } from '@/lib/api';
import { FieldEditor } from '../FieldEditorDialog';

export default function EditFieldPage() {
  return (
    <RoleGuard allowedRoles={['super_admin', 'schema_editor']}>
      <EditFieldContent />
    </RoleGuard>
  );
}

function EditFieldContent() {
  const { id } = useParams();
  const router = useRouter();
  const [field, setField] = useState(null);
  const [loading, setLoading] = useState(true);
  const back = () => router.push('/settings/fields');

  useEffect(() => {
    let alive = true;
    api.get(`/field-definitions/${id}`)
      .then((r) => { if (alive) setField(unwrap(r)); })
      .catch(() => {
        toast.error('Field not found');
        router.push('/settings/fields');
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [id, router]);

  if (loading) {
    return (
      <div className="py-24 flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }
  if (!field) return null;

  return (
    <div className="-mt-1">
      <FieldEditor
        field={field}
        entityType={field.entity_type}
        onCancel={back}
        onSaved={back}
      />
    </div>
  );
}
