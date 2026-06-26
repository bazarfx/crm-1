'use client';

import { useParams } from 'next/navigation';
import RoleGuard from '@/components/layout/RoleGuard';
import RecordForm from '@/components/modules/RecordForm';

export default function NewRecordPage() {
  const { key } = useParams();
  return (
    <RoleGuard allow={['super_admin', 'admin', 'floor_manager', 'schema_editor']}>
      <RecordForm moduleKey={key} />
    </RoleGuard>
  );
}
