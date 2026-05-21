'use client';

import { Plus, Users2 } from 'lucide-react';
import RoleGuard from '@/components/layout/RoleGuard';
import EmptyState from '@/components/shared/EmptyState';

export default function GroupsPage() {
  return (
    <RoleGuard allow={['super_admin', 'admin', 'floor_manager']}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-ink-primary">Groups</h2>
            <p className="text-sm text-ink-secondary mt-0.5">
              Telesales and Senior groups (one per language). Round-robin pointer per group + campaign.
            </p>
          </div>
          <button className="btn-primary text-sm" disabled>
            <Plus size={14} /> New Group
          </button>
        </div>
        <EmptyState
          icon={Users2}
          title="Group cards unavailable"
          message="Group roster, RR index, and member management load from /api/v1/groups."
        />
      </div>
    </RoleGuard>
  );
}
