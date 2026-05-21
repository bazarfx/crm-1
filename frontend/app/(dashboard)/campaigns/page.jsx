'use client';

import { Plus, Megaphone } from 'lucide-react';
import RoleGuard from '@/components/layout/RoleGuard';
import EmptyState from '@/components/shared/EmptyState';

export default function CampaignsPage() {
  return (
    <RoleGuard allow={['super_admin', 'admin', 'floor_manager']}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-ink-primary">Campaigns</h2>
            <p className="text-sm text-ink-secondary mt-0.5">
              Meta Ads campaigns, language assignment, and group routing.
            </p>
          </div>
          <button className="btn-primary text-sm" disabled>
            <Plus size={14} /> New Campaign
          </button>
        </div>
        <EmptyState
          icon={Megaphone}
          title="Campaigns unavailable"
          message="Loads from /api/v1/campaigns once backend is up."
        />
      </div>
    </RoleGuard>
  );
}
