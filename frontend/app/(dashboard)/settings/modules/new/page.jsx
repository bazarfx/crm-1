'use client';

import RoleGuard from '@/components/layout/RoleGuard';
import ModuleForm from '@/components/modules/ModuleForm';

export default function NewModulePage() {
  return (
    <RoleGuard allow={['super_admin', 'admin', 'schema_editor']}>
      <ModuleForm />
    </RoleGuard>
  );
}
