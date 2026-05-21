'use client';

/**
 * Lightweight Tabs — no Radix. Mirrors shadcn API:
 *   <Tabs defaultValue="x" value={controlled?} onValueChange={fn} className="">
 *     <TabsList>
 *       <TabsTrigger value="x">Label</TabsTrigger>
 *     </TabsList>
 *     <TabsContent value="x">…</TabsContent>
 *   </Tabs>
 */

import * as React from 'react';
import { cn } from '@/lib/utils';

const TabsCtx = React.createContext(null);

function Tabs({ defaultValue, value, onValueChange, className, children }) {
  const [internal, setInternal] = React.useState(defaultValue);
  const v = value !== undefined ? value : internal;
  const setV = React.useCallback(
    (next) => {
      if (value === undefined) setInternal(next);
      onValueChange?.(next);
    },
    [value, onValueChange]
  );
  return (
    <TabsCtx.Provider value={{ value: v, setValue: setV }}>
      <div className={className}>{children}</div>
    </TabsCtx.Provider>
  );
}

const TabsList = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    role="tablist"
    className={cn(
      'inline-flex items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground',
      className
    )}
    {...props}
  />
));
TabsList.displayName = 'TabsList';

const TabsTrigger = React.forwardRef(({ className, value, ...props }, ref) => {
  const ctx = React.useContext(TabsCtx);
  const active = ctx.value === value;
  return (
    <button
      ref={ref}
      type="button"
      role="tab"
      aria-selected={active}
      data-state={active ? 'active' : 'inactive'}
      onClick={() => ctx.setValue(value)}
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-all',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'disabled:pointer-events-none disabled:opacity-50',
        active
          ? 'bg-background text-foreground shadow-sm'
          : 'hover:bg-background/50 hover:text-foreground',
        className
      )}
      {...props}
    />
  );
});
TabsTrigger.displayName = 'TabsTrigger';

const TabsContent = React.forwardRef(({ className, value, ...props }, ref) => {
  const ctx = React.useContext(TabsCtx);
  if (ctx.value !== value) return null;
  return (
    <div
      ref={ref}
      role="tabpanel"
      data-state="active"
      className={cn(
        'mt-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className
      )}
      {...props}
    />
  );
});
TabsContent.displayName = 'TabsContent';

export { Tabs, TabsList, TabsTrigger, TabsContent };
