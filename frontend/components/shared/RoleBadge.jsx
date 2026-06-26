'use client';

import { roleLabel, roleColor } from '@/lib/roles';
import { cn } from '@/lib/utils';

/**
 * Compact, scannable role indicator: a colour dot + human label. Colours and
 * labels come from the dynamic roles registry (lib/roles), falling back to the
 * built-in system roles before the registry loads — so custom roles render
 * with their real name/colour too.
 */
export function RoleBadge({ role, className }) {
  if (!role) return <span className="text-muted-foreground text-xs">—</span>;
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs whitespace-nowrap', className)}>
      <span className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ background: roleColor(role) }} />
      <span className="text-foreground/90">{roleLabel(role)}</span>
    </span>
  );
}

export default RoleBadge;
