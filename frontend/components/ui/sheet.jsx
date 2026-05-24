'use client';

/**
 * Lightweight Sheet — right-side slide-in panel. No Radix; mirrors the
 * shadcn API surface so consumers can drop it in without changing imports:
 *
 *   <Sheet open={x} onOpenChange={setX}>
 *     <SheetContent side="right" className="sm:max-w-md">
 *       <SheetHeader>
 *         <SheetTitle>…</SheetTitle>
 *         <SheetDescription>…</SheetDescription>
 *       </SheetHeader>
 *       …body…
 *       <SheetFooter>…</SheetFooter>
 *     </SheetContent>
 *   </Sheet>
 *
 * Built on the same portal + framer-motion + body-scroll-lock pattern as
 * `Dialog` so behaviour is consistent across the app.
 */

import * as React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

const SheetCtx = React.createContext(null);

function Sheet({ open, onOpenChange, children }) {
  React.useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onOpenChange?.(false);
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onOpenChange]);

  return (
    <SheetCtx.Provider value={{ open, onOpenChange }}>
      {children}
    </SheetCtx.Provider>
  );
}

const SIDE_STYLES = {
  right:  { container: 'justify-end',    panel: 'h-full', from: { x: '100%' },  to: { x: 0 } },
  left:   { container: 'justify-start',  panel: 'h-full', from: { x: '-100%' }, to: { x: 0 } },
  top:    { container: 'items-start',    panel: 'w-full', from: { y: '-100%' }, to: { y: 0 } },
  bottom: { container: 'items-end',      panel: 'w-full', from: { y: '100%' },  to: { y: 0 } },
};

function SheetContent({ className, children, side = 'right', hideClose = false }) {
  const ctx = React.useContext(SheetCtx);
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const cfg = SIDE_STYLES[side] || SIDE_STYLES.right;

  return createPortal(
    <AnimatePresence>
      {ctx.open && (
        <div className={cn('fixed inset-0 z-50 flex', cfg.container)}>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => ctx.onOpenChange?.(false)}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={cfg.from}
            animate={cfg.to}
            exit={cfg.from}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              'relative z-10 bg-card text-card-foreground border shadow-lg flex flex-col',
              side === 'right' || side === 'left'
                ? 'h-full w-full max-w-md p-6'
                : 'w-full max-h-[90vh] p-6',
              className,
            )}
          >
            {!hideClose && (
              <button
                onClick={() => ctx.onOpenChange?.(false)}
                aria-label="Close panel"
                className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            )}
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function SheetHeader({ className, ...props }) {
  return (
    <div
      className={cn('flex flex-col space-y-1.5 text-left mb-4 pr-6', className)}
      {...props}
    />
  );
}

function SheetTitle({ className, ...props }) {
  return (
    <h2
      className={cn('text-lg font-semibold leading-none tracking-tight', className)}
      {...props}
    />
  );
}

function SheetDescription({ className, ...props }) {
  return (
    <p
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

function SheetFooter({ className, ...props }) {
  return (
    <div
      className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 mt-4', className)}
      {...props}
    />
  );
}

// shadcn parity — these aren't used by our hand-rolled Sheet (we render
// the content directly via the open prop) but exporting them as no-ops
// keeps an `import { SheetTrigger, SheetClose } from '@/components/ui/sheet'`
// from blowing up if a future caller follows shadcn idioms.
const SheetTrigger = ({ children }) => children ?? null;
const SheetClose = ({ children }) => children ?? null;

export {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetTrigger,
  SheetClose,
};
