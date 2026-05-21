'use client';

import { Webhook, RefreshCw } from 'lucide-react';
import RoleGuard from '@/components/layout/RoleGuard';
import EmptyState from '@/components/shared/EmptyState';
import DataTable from '@/components/shared/DataTable';

export default function ArkLogsPage() {
  const columns = [
    { accessorKey: 'received_at', header: 'Received', cell: (c) => <span className="mono text-xs">{c.getValue() || '—'}</span> },
    { accessorKey: 'event_type', header: 'Event' },
    { accessorKey: 'ark_username', header: 'Username', cell: (c) => <span className="mono">{c.getValue() || '—'}</span> },
    { accessorKey: 'matched_lead', header: 'Matched Lead' },
    { accessorKey: 'status', header: 'Status' },
  ];

  return (
    <RoleGuard allow={['super_admin', 'admin', 'floor_manager', 'back_office', 'auditor']}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-ink-primary">ARK Webhook Logs</h2>
            <p className="text-sm text-ink-secondary mt-0.5">
              Incoming events from the ARK terminal. Auto-refresh 30s when live.
            </p>
          </div>
          <button className="btn-ghost text-sm" disabled>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
        <DataTable
          columns={columns}
          data={[]}
          searchPlaceholder="Search by username, event, status…"
          emptyState={
            <EmptyState
              icon={Webhook}
              title="No webhook logs"
              message="Logs stream from /api/v1/ark-logs once backend is up."
            />
          }
        />
      </div>
    </RoleGuard>
  );
}
