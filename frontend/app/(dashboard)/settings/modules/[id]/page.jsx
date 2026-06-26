'use client';

import { useParams } from 'next/navigation';
import RoleGuard from '@/components/layout/RoleGuard';
import ModuleForm from '@/components/modules/ModuleForm';

export default function EditModulePage() {
  const { id } = useParams();
  return (
    <RoleGuard allow={['super_admin', 'admin', 'schema_editor']}>
      <ModuleForm moduleId={id} />
    </RoleGuard>
  );
}
