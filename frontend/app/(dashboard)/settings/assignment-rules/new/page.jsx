'use client';

import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import RoleGuard from '@/components/layout/RoleGuard';
import AssignmentRuleForm from '@/components/assignment/AssignmentRuleForm';

export default function NewAssignmentRulePage() {
  return (
    <RoleGuard allow={['super_admin', 'admin', 'floor_manager']}>
      <Suspense
        fallback={(
          <div className="py-24 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}
      >
        <AssignmentRuleForm />
      </Suspense>
    </RoleGuard>
  );
}
