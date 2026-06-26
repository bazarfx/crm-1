'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

/**
 * Shared chrome for full-page forms (the converted-from-modal pages).
 *
 * `FormPageHeader` is a sticky toolbar that parks just under the global
 * Topbar. It carries the back affordance, a breadcrumb (parent → current),
 * and the primary actions — so Save stays reachable no matter how far the
 * user has scrolled. It deliberately renders the crumb at a lighter weight
 * than the global Topbar h1 so the two bars read as toolbar + title, not two
 * competing headings. The negative inline margins cancel the <main> padding
 * so the bar spans edge-to-edge.
 *
 * `FormSection` / `Field` mirror the visual language the FieldEditorDialog
 * established (icon chip + uppercase micro-label + description), so every
 * converted page reads as one family.
 */
export function FormPageHeader({
  title, parent, parentHref, badge, backHref, onBack, actions, icon: Icon,
}) {
  const router = useRouter();
  const goBack = () => {
    if (onBack) return onBack();
    if (backHref) return router.push(backHref);
    return router.back();
  };

  return (
    <div className="sticky top-[57px] z-10 -mx-4 lg:-mx-6 px-4 lg:px-6 py-2.5 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/65 border-b">
      <div className="mx-auto max-w-5xl flex items-center gap-2.5">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 flex-shrink-0"
          onClick={goBack}
          aria-label="Go back"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        {Icon && (
          <div className="hidden sm:flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary flex-shrink-0">
            <Icon className="h-3.5 w-3.5" />
          </div>
        )}
        <div className="min-w-0 flex-1 flex items-center gap-1.5 text-[13px]">
          {parent && (
            <>
              <button
                type="button"
                onClick={() => (parentHref ? router.push(parentHref) : goBack())}
                className="text-muted-foreground hover:text-foreground transition-colors truncate"
              >
                {parent}
              </button>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60 flex-shrink-0" />
            </>
          )}
          <span className="font-medium text-foreground truncate">{title}</span>
          {badge}
        </div>
        {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
      </div>
    </div>
  );
}

/** Centered body column for a form page. */
export function FormPageBody({ children, className, width = 'max-w-5xl' }) {
  return (
    <div className={cn('mx-auto py-6 space-y-6', width, className)}>{children}</div>
  );
}

/** Titled section with an icon chip, uppercase micro-label and description. */
export function FormSection({ icon: Icon, title, description, children, className }) {
  return (
    <section className={cn('rounded-xl border bg-card shadow-sm', className)}>
      <div className="flex items-start gap-3 px-5 sm:px-6 pt-5">
        {Icon && (
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground flex-shrink-0">
            <Icon className="h-4 w-4" />
          </div>
        )}
        <div className="min-w-0">
          <h2 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-foreground/90">
            {title}
          </h2>
          {description && (
            <p className="text-[12px] text-muted-foreground mt-0.5">{description}</p>
          )}
        </div>
      </div>
      <div className="px-5 sm:px-6 py-5">{children}</div>
    </section>
  );
}

/** Label + optional hint above an input. */
export function Field({ label, hint, htmlFor, required, children, className }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <label
          htmlFor={htmlFor}
          className="text-[12px] font-medium text-foreground/80"
        >
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
        {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
