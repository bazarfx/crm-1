'use client';

/**
 * Lightweight Select — no Radix. Mirrors shadcn API:
 *   <Select value={v} onValueChange={fn} disabled>
 *     <SelectTrigger><SelectValue placeholder="..."/></SelectTrigger>
 *     <SelectContent><SelectItem value="x">Label</SelectItem></SelectContent>
 *   </Select>
 *
 * Items can be plain children OR nested <SelectItem> — children are walked.
 */

import * as React from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

const SelectCtx = React.createContext(null);

function Select({ value, defaultValue, onValueChange, disabled, children }) {
  const [open, setOpen] = React.useState(false);
  const [internal, setInternal] = React.useState(defaultValue ?? '');
  const v = value !== undefined ? value : internal;
  const setV = React.useCallback(
    (next) => {
      if (value === undefined) setInternal(next);
      onValueChange?.(next);
      setOpen(false);
    },
    [value, onValueChange]
  );
  const rootRef = React.useRef(null);

  // Build label map by walking children for <SelectItem> nodes
  const itemLabels = React.useMemo(() => {
    const map = new Map();
    const walk = (nodes) => {
      React.Children.forEach(nodes, (child) => {
        if (!React.isValidElement(child)) return;
        if (child.type?.displayName === 'SelectItem' || child.type === SelectItem) {
          map.set(child.props.value, child.props.children);
        } else if (child.props?.children) {
          walk(child.props.children);
        }
      });
    };
    walk(children);
    return map;
  }, [children]);

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
  }, [open]);

  return (
    <SelectCtx.Provider
      value={{ value: v, setValue: setV, open, setOpen, disabled, itemLabels }}
    >
      <div ref={rootRef} className="relative inline-block w-full">
        {children}
      </div>
    </SelectCtx.Provider>
  );
}

const SelectTrigger = React.forwardRef(({ className, children, ...props }, ref) => {
  const ctx = React.useContext(SelectCtx);
  return (
    <button
      ref={ref}
      type="button"
      onClick={() => !ctx.disabled && ctx.setOpen(!ctx.open)}
      disabled={ctx.disabled}
      aria-expanded={ctx.open}
      aria-haspopup="listbox"
      className={cn(
        'flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm',
        'placeholder:text-muted-foreground',
        'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    >
      {children}
      <ChevronDown
        className={cn('h-4 w-4 opacity-50 transition-transform', ctx.open && 'rotate-180')}
      />
    </button>
  );
});
SelectTrigger.displayName = 'SelectTrigger';

function SelectValue({ placeholder, children }) {
  const ctx = React.useContext(SelectCtx);
  const label = ctx.itemLabels.get(ctx.value);
  if (children) return <span className="truncate">{children}</span>;
  if (label !== undefined && label !== '') return <span className="truncate">{label}</span>;
  return <span className="truncate text-muted-foreground">{placeholder ?? 'Select…'}</span>;
}

function SelectContent({ className, children }) {
  const ctx = React.useContext(SelectCtx);
  if (!ctx.open) return null;
  return (
    <div
      role="listbox"
      className={cn(
        'absolute z-50 mt-1 w-full max-h-[280px] overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-lg',
        'animate-modalIn',
        className
      )}
    >
      <div className="p-1">{children}</div>
    </div>
  );
}

const SelectItem = React.forwardRef(({ className, value, children, disabled, ...props }, ref) => {
  const ctx = React.useContext(SelectCtx);
  const isSelected = ctx.value === value;
  return (
    <div
      ref={ref}
      role="option"
      aria-selected={isSelected}
      data-disabled={disabled || undefined}
      onClick={() => !disabled && ctx.setValue(value)}
      className={cn(
        'relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-7 pr-2 text-sm outline-none',
        'hover:bg-accent hover:text-accent-foreground',
        isSelected && 'bg-accent text-accent-foreground',
        disabled && 'pointer-events-none opacity-50',
        className
      )}
      {...props}
    >
      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
        {isSelected && <Check className="h-3.5 w-3.5" />}
      </span>
      {children}
    </div>
  );
});
SelectItem.displayName = 'SelectItem';

export { Select, SelectTrigger, SelectValue, SelectContent, SelectItem };
