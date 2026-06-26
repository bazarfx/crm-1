'use client';

import RoleGuard from '@/components/layout/RoleGuard';
import GroupForm from '@/components/groups/GroupForm';

export default function NewGroupPage() {
  return (
    <RoleGuard allow={['super_admin', 'admin', 'floor_manager']}>
      <GroupForm />
    </RoleGuard>
  );
}
