'use client';

/**
 * Lightweight Dialog — no Radix. Mirrors shadcn API:
 *   <Dialog open={x} onOpenChange={setX}>
 *     <DialogContent>
 *       <DialogHeader><DialogTitle>…</DialogTitle><DialogDescription>…</DialogDescription></DialogHeader>
 *       …body…
 *       <DialogFooter>…</DialogFooter>
 *     </DialogContent>
 *   </Dialog>
 */

import * as React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

const DialogCtx = React.createContext(null);

function Dialog({ open, onOpenChange, children }) {
  // Close on Escape
  React.useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onOpenChange?.(false);
    };
    document.addEventListener('keydown', onKey);
    // Lock body scroll
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onOpenChange]);

  return (
    <DialogCtx.Provider value={{ open, onOpenChange }}>
      {children}
    </DialogCtx.Provider>
  );
}

function DialogContent({ className, children, hideClose = false }) {
  const ctx = React.useContext(DialogCtx);
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {ctx.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Overlay — plain darker fill instead of `backdrop-blur-sm`.
              Chromium re-blurs the backdrop on every paint, which makes
              scrolling inside a long dialog body visibly judder. A
              slightly opaquer black gives the same "panel is on top of
              dimmed page" read without the per-frame GPU cost. */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/70"
            onClick={() => ctx.onOpenChange?.(false)}
          />
          {/* Panel */}
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 4 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              'relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border bg-card text-card-foreground p-6 shadow-lg',
              className
            )}
          >
            {!hideClose && (
              <button
                onClick={() => ctx.onOpenChange?.(false)}
                aria-label="Close dialog"
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
    document.body
  );
}

function DialogHeader({ className, ...props }) {
  return (
    <div
      className={cn('flex flex-col space-y-1.5 text-left mb-4', className)}
      {...props}
    />
  );
}

function DialogTitle({ className, ...props }) {
  return (
    <h2
      className={cn('text-lg font-semibold leading-none tracking-tight', className)}
      {...props}
    />
  );
}

function DialogDescription({ className, ...props }) {
  return (
    <p className={cn('text-xs text-muted-foreground', className)} {...props} />
  );
}

function DialogFooter({ className, ...props }) {
  return (
    <div
      className={cn(
        'mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:space-x-2',
        className
      )}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
};
