'use client';

/**
 * Lightweight Popover — no Radix. Mirrors shadcn API:
 *   <Popover open={x} onOpenChange={setX}>
 *     <PopoverTrigger asChild><Button>…</Button></PopoverTrigger>
 *     <PopoverContent align="end">…</PopoverContent>
 *   </Popover>
 *
 * - Controlled (open/onOpenChange) or uncontrolled.
 * - asChild on trigger clones the child to attach the handler/ref.
 * - Closes on outside click + Escape.
 */

import * as React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

const PopoverCtx = React.createContext(null);

function Popover({ open, onOpenChange, children }) {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : internalOpen;
  const setOpen = React.useCallback(
    (next) => {
      if (!isControlled) setInternalOpen(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange]
  );
  const triggerRef = React.useRef(null);
  return (
    <PopoverCtx.Provider value={{ open: isOpen, setOpen, triggerRef }}>
      {children}
    </PopoverCtx.Provider>
  );
}

function PopoverTrigger({ children, asChild }) {
  const ctx = React.useContext(PopoverCtx);
  const onClick = (e) => {
    children?.props?.onClick?.(e);
    ctx.setOpen(!ctx.open);
  };
  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children, {
      ref: (node) => {
        ctx.triggerRef.current = node;
        const ref = children.ref;
        if (typeof ref === 'function') ref(node);
        else if (ref && typeof ref === 'object') ref.current = node;
      },
      onClick,
      'aria-expanded': ctx.open,
    });
  }
  return (
    <button ref={ctx.triggerRef} type="button" onClick={onClick} aria-expanded={ctx.open}>
      {children}
    </button>
  );
}

function PopoverContent({ className, align = 'start', sideOffset = 6, children }) {
  const ctx = React.useContext(PopoverCtx);
  const [mounted, setMounted] = React.useState(false);
  const [pos, setPos] = React.useState({ top: 0, left: 0 });
  const panelRef = React.useRef(null);

  React.useEffect(() => setMounted(true), []);

  const reposition = React.useCallback(() => {
    const trigger = ctx.triggerRef.current;
    const panel = panelRef.current;
    if (!trigger || !panel) return;
    const r = trigger.getBoundingClientRect();
    const pw = panel.offsetWidth;
    let left = r.left;
    if (align === 'end') left = r.right - pw;
    else if (align === 'center') left = r.left + r.width / 2 - pw / 2;
    // clamp to viewport
    left = Math.max(8, Math.min(left, window.innerWidth - pw - 8));
    const top = r.bottom + sideOffset;
    setPos({ top: top + window.scrollY, left: left + window.scrollX });
  }, [align, sideOffset, ctx.triggerRef]);

  React.useLayoutEffect(() => {
    if (!ctx.open) return undefined;
    reposition();
    const onScroll = () => reposition();
    const onResize = () => reposition();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [ctx.open, reposition]);

  React.useEffect(() => {
    if (!ctx.open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') ctx.setOpen(false); };
    const onClick = (e) => {
      const t = e.target;
      if (panelRef.current?.contains(t)) return;
      if (ctx.triggerRef.current?.contains(t)) return;
      ctx.setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [ctx]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {ctx.open && (
        <motion.div
          ref={panelRef}
          role="dialog"
          initial={{ opacity: 0, y: -4, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -2, scale: 0.98 }}
          transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
          style={{ position: 'absolute', top: pos.top, left: pos.left, zIndex: 60 }}
          className={cn(
            'min-w-[12rem] rounded-md border bg-popover text-popover-foreground p-4 shadow-lg outline-none',
            className
          )}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

export { Popover, PopoverTrigger, PopoverContent };
