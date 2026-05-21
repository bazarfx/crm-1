'use client';

/**
 * Lightweight DropdownMenu — no Radix. Mirrors shadcn API:
 *   <DropdownMenu>
 *     <DropdownMenuTrigger asChild><Button>…</Button></DropdownMenuTrigger>
 *     <DropdownMenuContent align="end">
 *       <DropdownMenuLabel>…</DropdownMenuLabel>
 *       <DropdownMenuSeparator />
 *       <DropdownMenuItem onClick={…}>…</DropdownMenuItem>
 *     </DropdownMenuContent>
 *   </DropdownMenu>
 *
 * - Click outside the panel closes it.
 * - Escape closes it.
 * - Items close the menu when clicked (unless preventDefault is called).
 */

import * as React from 'react';
import { cn } from '@/lib/utils';

const Ctx = React.createContext(null);

function DropdownMenu({ children, open: controlledOpen, onOpenChange }) {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = React.useCallback(
    (v) => {
      if (controlledOpen === undefined) setInternalOpen(v);
      onOpenChange?.(v);
    },
    [controlledOpen, onOpenChange]
  );
  const rootRef = React.useRef(null);

  React.useEffect(() => {
    if (!open) return undefined;
    const onClick = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, setOpen]);

  return (
    <Ctx.Provider value={{ open, setOpen }}>
      <div ref={rootRef} className="relative inline-block">
        {children}
      </div>
    </Ctx.Provider>
  );
}

const DropdownMenuTrigger = React.forwardRef(({ asChild, children, ...props }, ref) => {
  const ctx = React.useContext(Ctx);
  const onClick = (e) => {
    children?.props?.onClick?.(e);
    if (!e.defaultPrevented) ctx.setOpen(!ctx.open);
  };
  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children, { ref, onClick, 'aria-expanded': ctx.open, ...props });
  }
  return (
    <button ref={ref} type="button" onClick={onClick} aria-expanded={ctx.open} {...props}>
      {children}
    </button>
  );
});
DropdownMenuTrigger.displayName = 'DropdownMenuTrigger';

function DropdownMenuContent({ className, align = 'start', sideOffset = 4, children, ...props }) {
  const ctx = React.useContext(Ctx);
  if (!ctx.open) return null;
  return (
    <div
      role="menu"
      style={{ marginTop: sideOffset }}
      className={cn(
        'absolute z-50 min-w-[12rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md',
        'animate-modalIn',
        align === 'end' && 'right-0',
        align === 'start' && 'left-0',
        align === 'center' && 'left-1/2 -translate-x-1/2',
        className
      )}
      {...props}
    >
      <div className="p-1">{children}</div>
    </div>
  );
}

const DropdownMenuItem = React.forwardRef(
  ({ className, onClick, disabled, children, ...props }, ref) => {
    const ctx = React.useContext(Ctx);
    const handle = (e) => {
      if (disabled) {
        e.preventDefault();
        return;
      }
      onClick?.(e);
      if (!e.defaultPrevented) ctx.setOpen(false);
    };
    return (
      <button
        ref={ref}
        type="button"
        role="menuitem"
        disabled={disabled}
        onClick={handle}
        className={cn(
          'relative flex w-full cursor-pointer select-none items-center rounded-sm px-2.5 py-1.5 text-xs',
          'outline-none transition-colors',
          'hover:bg-accent hover:text-accent-foreground',
          'focus-visible:bg-accent focus-visible:text-accent-foreground',
          disabled && 'pointer-events-none opacity-50',
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);
DropdownMenuItem.displayName = 'DropdownMenuItem';

function DropdownMenuSeparator({ className, ...props }) {
  return <div className={cn('-mx-1 my-1 h-px bg-border', className)} {...props} />;
}

function DropdownMenuLabel({ className, ...props }) {
  return (
    <div
      className={cn('px-2 py-1.5 text-xs font-semibold text-muted-foreground', className)}
      {...props}
    />
  );
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
};
