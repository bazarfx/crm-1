'use client';

import { useParams } from 'next/navigation';
import RoleGuard from '@/components/layout/RoleGuard';
import GroupForm from '@/components/groups/GroupForm';

export default function EditGroupPage() {
  const { id } = useParams();
  return (
    <RoleGuard allow={['super_admin', 'admin', 'floor_manager']}>
      <GroupForm groupId={id} />
    </RoleGuard>
  );
}
