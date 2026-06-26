'use client';

import { useParams } from 'next/navigation';
import RoleGuard from '@/components/layout/RoleGuard';
import RecordForm from '@/components/modules/RecordForm';

export default function EditRecordPage() {
  const { key, id } = useParams();
  return (
    <RoleGuard allow={['super_admin', 'admin', 'floor_manager', 'schema_editor']}>
      <RecordForm moduleKey={key} recordId={id} />
    </RoleGuard>
  );
}
