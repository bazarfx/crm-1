'use client';

import { cn } from '@/lib/utils';
import { colorsFor, labelFor } from '@/lib/languages';

/**
 * Single language pill. `size="xs"` for compact overflow tags; `primary`
 * bumps font weight when one chip needs to read louder than its siblings.
 */
export function LanguageBadge({ language, size = 'sm', primary = false, className }) {
  if (!language) return <span className="text-muted-foreground text-xs">—</span>;
  const c = colorsFor(language);
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border whitespace-nowrap',
        size === 'xs' ? 'text-[9px] px-1.5 py-0 leading-4' : 'text-[10px] px-2 py-0.5 leading-4',
        c.bg, c.text, c.border,
        primary && 'font-medium',
        className
      )}
    >
      {labelFor(language)}
    </span>
  );
}

/**
 * Row of language chips. Pass the `languages` array (e.g. from
 * user.languages); shows up to `max`, then "+N" overflow.
 */
export function LanguageList({ languages = [], size = 'sm', max = 4, className }) {
  if (!Array.isArray(languages) || languages.length === 0) {
    return <span className="text-muted-foreground text-[10px]">No languages</span>;
  }
  const visible = languages.slice(0, max);
  const hiddenCount = languages.length - visible.length;
  return (
    <div className={cn('inline-flex items-center gap-1 flex-wrap', className)}>
      {visible.map((l) => (
        <LanguageBadge key={l} language={l} size={size} />
      ))}
      {hiddenCount > 0 && (
        <span className="text-[9px] text-muted-foreground">+{hiddenCount}</span>
      )}
    </div>
  );
}

export default LanguageBadge;
