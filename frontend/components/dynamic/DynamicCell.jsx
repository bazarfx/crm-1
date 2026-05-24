'use client';
import { Badge } from '@/components/ui/badge';
import { formatValue } from '@/lib/dynamic';
import { cn } from '@/lib/utils';

export function DynamicCell({ definition, value }) {
  // Boolean false is a real value; only treat null/undefined/'' as empty.
  // (typeof check avoids `0` and `false` collapsing into the empty branch.)
  if (value === null || value === undefined || value === '') {
    if (definition.field_type === 'boolean') {
      return (
        <Badge variant="outline" className="text-[10px] text-amber-600 dark:text-amber-400 border-amber-500/30">
          Not set
        </Badge>
      );
    }
    return <span className="text-muted-foreground">—</span>;
  }
  const formatted = formatValue(definition, value);

  switch (definition.field_type) {
    case 'boolean':
      return (
        <Badge
          variant="outline"
          className={cn(
            'text-[10px]',
            value === true
              ? 'text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
              : 'text-slate-600 dark:text-slate-400 border-slate-500/30',
          )}
        >
          {formatted}
        </Badge>
      );

    case 'dropdown':
      return <Badge variant="outline" className="text-[10px] capitalize">{formatted}</Badge>;

    case 'multiselect':
    case 'tags':
      return (
        <div className="flex flex-wrap gap-1">
          {(value || []).slice(0, 3).map(v => (
            <Badge key={v} variant="outline" className="text-[9px]">{v}</Badge>
          ))}
          {(value || []).length > 3 && (
            <span className="text-[9px] text-muted-foreground">+{value.length - 3}</span>
          )}
        </div>
      );

    case 'currency':
      return <span className="font-mono text-emerald-400">{formatted}</span>;

    default:
      return <span className="text-xs">{formatted}</span>;
  }
}
