'use client';

import { ServerCrash } from 'lucide-react';

export default function EmptyState({
  icon: Icon = ServerCrash,
  title = 'Backend not connected',
  message = 'Connect the API on :5000 to load real data.',
  action,
}) {
  return (
    <div className="card flex flex-col items-center justify-center text-center py-14 px-6">
      <div className="w-12 h-12 rounded-full bg-accent/10 text-accent flex items-center justify-center mb-4">
        <Icon size={22} />
      </div>
      <h3 className="text-base font-semibold text-ink-primary">{title}</h3>
      <p className="text-sm text-ink-secondary mt-1 max-w-sm">{message}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
