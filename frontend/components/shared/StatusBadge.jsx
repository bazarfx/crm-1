'use client';

import { cn } from '@/lib/utils';

const STATUS_CONFIG = {
  new:            { label: 'New',             cls: 'badge-new' },
  contacted:      { label: 'Contacted',       cls: 'badge-contacted' },
  interested:     { label: 'Interested',      cls: 'badge-interested' },
  not_interested: { label: 'Not Interested',  cls: 'badge-not_interested' },
  call_back:      { label: 'Call Back',       cls: 'badge-call_back' },
  account_opened: { label: 'Account Opened',  cls: 'badge-account_opened' },
  ftd_done:       { label: 'FTD Done',        cls: 'badge-ftd_done' },
  cold:           { label: 'Cold',            cls: 'badge-cold' },
  dnd:            { label: 'DND',             cls: 'badge-dnd' },
  inactive:       { label: 'Inactive',        cls: 'badge-inactive' },
  reactive:       { label: 'Reactive',        cls: 'badge-reactive' },
};

export default function StatusBadge({ status, label, size = 'sm', className }) {
  if (!status && !label) {
    return <span className="text-muted-foreground text-xs">—</span>;
  }
  const key = (status || '').toString().toLowerCase().replace(/\s+/g, '_');
  const config = STATUS_CONFIG[key] || { label: label || status || '—', cls: 'badge-cold' };
  const text = label || config.label;
  const sizing =
    size === 'lg' ? 'px-2.5 py-1 text-xs' : 'px-2 py-0.5 text-[11px]';

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border font-medium',
        sizing,
        config.cls,
        className
      )}
    >
      <span
        className="w-1.5 h-1.5 rounded-full mr-1.5 inline-block bg-current opacity-80"
        aria-hidden
      />
      {text}
    </span>
  );
}
