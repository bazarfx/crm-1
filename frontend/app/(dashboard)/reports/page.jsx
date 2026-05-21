'use client';

import { useState } from 'react';
import clsx from 'clsx';
import { BarChart3 } from 'lucide-react';
import RoleGuard from '@/components/layout/RoleGuard';
import EmptyState from '@/components/shared/EmptyState';

const TABS = [
  { key: 'leaderboard', label: 'Leaderboard' },
  { key: 'conversion', label: 'Conversion Funnel' },
  { key: 'campaign', label: 'Campaign ROI' },
  { key: 'language', label: 'Language Split' },
  { key: 'status', label: 'Status Distribution' },
  { key: 'ftd', label: 'FTD Trends' },
  { key: 'activity', label: 'Activity Volume' },
];

export default function ReportsPage() {
  const [active, setActive] = useState(TABS[0].key);

  return (
    <RoleGuard allow={['super_admin', 'admin', 'floor_manager', 'senior', 'back_office', 'auditor']}>
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-ink-primary">Reports</h2>
          <p className="text-sm text-ink-secondary mt-0.5">Seven analytical views across the pipeline.</p>
        </div>

        <div className="card p-0 overflow-hidden">
          <div className="flex overflow-x-auto border-b border-slate-100">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setActive(t.key)}
                className={clsx(
                  'px-4 py-3 text-sm whitespace-nowrap transition-colors duration-150 relative',
                  active === t.key
                    ? 'text-ink-primary font-medium'
                    : 'text-ink-secondary hover:text-ink-primary'
                )}
              >
                {t.label}
                {active === t.key && (
                  <span className="absolute inset-x-3 -bottom-px h-0.5 bg-accent rounded-full" />
                )}
              </button>
            ))}
          </div>
          <div className="p-4">
            <EmptyState
              icon={BarChart3}
              title={`${TABS.find((t) => t.key === active)?.label} unavailable`}
              message="Charts render from /api/v1/reports/* once backend is up."
            />
          </div>
        </div>
      </div>
    </RoleGuard>
  );
}
