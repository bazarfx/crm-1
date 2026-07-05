'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import RoleGuard from '@/components/layout/RoleGuard';
import { FieldEditor } from '../FieldEditorDialog';

export default function NewFieldPage() {
  return (
    <RoleGuard allowedRoles={['super_admin', 'schema_editor']}>
      <Suspense
        fallback={(
          <div className="py-24 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}
      >
        <NewFieldContent />
      </Suspense>
    </RoleGuard>
  );
}

function NewFieldContent() {
  const router = useRouter();
  const sp = useSearchParams();
  const entity = sp.get('entity') || 'lead';
  const type = sp.get('type');
  const section = sp.get('section');
  const back = () => router.push(`/settings/fields?entity=${entity}`);

  return (
    <div className="-mt-1">
      <FieldEditor entityType={entity} initialType={type} initialSection={section} onCancel={back} onSaved={back} />
    </div>
  );
}
