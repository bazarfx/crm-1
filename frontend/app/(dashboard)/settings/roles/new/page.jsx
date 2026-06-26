'use client';

import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import RoleGuard from '@/components/layout/RoleGuard';
import RoleForm from '@/components/roles/RoleForm';

export default function NewRolePage() {
  return (
    <RoleGuard allow={['super_admin', 'admin']}>
      <Suspense
        fallback={(
          <div className="py-24 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}
      >
        <RoleForm />
      </Suspense>
    </RoleGuard>
  );
}
