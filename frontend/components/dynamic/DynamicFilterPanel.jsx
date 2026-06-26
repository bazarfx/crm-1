'use client';

import { useEffect, useMemo, useState } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DynamicFilterField } from './DynamicFilterField';
import {
  fetchFieldDefinitions, visibleFields, useFieldDefinitionsVersion,
} from '@/lib/dynamic';
import {
  emptyDraft, isDraftEmpty, fromQueryParams, toQueryParams,
} from '@/lib/dynamicFilters';
import useStore from '@/store/useStore';

/**
 * Full-height filter panel for an entity's custom fields. Renders the right
 * control per field type, groups fields by section, and applies all at once so
 * typing in a text filter doesn't refetch on every keystroke.
 */
export function DynamicFilterPanel({ entityType, filters, onApply, open, onOpenChange }) {
  const { user } = useStore();
  const [definitions, setDefinitions] = useState([]);
  const defsVersion = useFieldDefinitionsVersion();

  useEffect(() => {
    fetchFieldDefinitions({ entity_type: entityType, force: true }).then(setDefinitions);
  }, [entityType, defsVersion]);

  const filterable = useMemo(
    () => visibleFields(definitions, user?.role).filter((d) => d.is_filterable),
    [definitions, user?.role],
  );

  const [drafts, setDrafts] = useState({});

  // Reseed local drafts from the live filters each time the panel opens — and
  // again once the field definitions finish loading while it's open, so a cold
  // first-open doesn't seed empty drafts. `filters` is intentionally excluded
  // so live filter changes don't clobber in-progress edits.
  useEffect(() => {
    if (open) setDrafts(fromQueryParams(filterable, filters));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, filterable]);

  const groups = useMemo(() => {
    const m = new Map();
    for (const def of filterable) {
      const section = def.section || 'Custom';
      if (!m.has(section)) m.set(section, []);
      m.get(section).push(def);
    }
    return Array.from(m.entries());
  }, [filterable]);

  const activeDraftCount = filterable.filter((d) => !isDraftEmpty(d, drafts[d.field_key])).length;

  const setDraft = (key, v) => setDrafts((p) => ({ ...p, [key]: v }));
  const clearField = (def) => setDraft(def.field_key, emptyDraft(def));
  const clearAll = () => {
    const next = {};
    for (const d of filterable) next[d.field_key] = emptyDraft(d);
    setDrafts(next);
  };
  const apply = () => {
    onApply(toQueryParams(filterable, drafts, filters));
    onOpenChange(false);
  };

  if (!filterable.length) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col gap-0">
        <SheetHeader className="px-5 py-4 border-b text-left space-y-1">
          <SheetTitle className="flex items-center gap-2 text-base">
            <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
            Custom field filters
            {activeDraftCount > 0 && (
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{activeDraftCount}</Badge>
            )}
          </SheetTitle>
          <SheetDescription className="text-xs">
            Narrow this list by your organisation&apos;s custom fields.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
          {groups.map(([section, defs]) => (
            <div key={section} className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {section}
              </p>
              <div className="space-y-4">
                {defs.map((def) => {
                  const draft = drafts[def.field_key];
                  const dirty = !isDraftEmpty(def, draft);
                  return (
                    <div key={def.id} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <label className="text-xs font-medium text-foreground/80">{def.label}</label>
                        {dirty && (
                          <button
                            type="button"
                            onClick={() => clearField(def)}
                            className="text-[10px] text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5"
                          >
                            <X className="h-2.5 w-2.5" /> Clear
                          </button>
                        )}
                      </div>
                      <DynamicFilterField
                        definition={def}
                        value={draft}
                        onChange={(v) => setDraft(def.field_key, v)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="border-t px-5 py-3 flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={clearAll} disabled={activeDraftCount === 0}>
            Clear all
          </Button>
          <Button size="sm" onClick={apply}>
            Apply{activeDraftCount > 0 ? ` (${activeDraftCount})` : ''}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
