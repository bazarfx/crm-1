'use client';

import { cn } from '@/lib/utils';
import { colorsFor, labelFor } from '@/lib/languages';

/**
 * Single language pill. `primary` bumps the weight; `size="xs"` is for the
 * "+ other languages" overflow tags so they read as secondary.
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
 * Compound: primary language + optional list of additional languages.
 * Hides the "+" separator if there's nothing on either side.
 */
export function LanguageList({ primary, additional = [], size = 'sm', className }) {
  const extras = (additional || []).filter((l) => l && l !== primary);
  if (!primary && extras.length === 0) {
    return <span className="text-muted-foreground text-xs">—</span>;
  }
  return (
    <div className={cn('inline-flex items-center gap-1 flex-wrap', className)}>
      {primary && <LanguageBadge language={primary} primary size={size} />}
      {extras.length > 0 && (
        <>
          {primary && <span className="text-muted-foreground text-[9px]">+</span>}
          {extras.map((l) => (
            <LanguageBadge key={l} language={l} size="xs" />
          ))}
        </>
      )}
    </div>
  );
}

export default LanguageBadge;
