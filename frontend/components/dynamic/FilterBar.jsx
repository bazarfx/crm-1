'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  fetchFieldDefinitions, visibleFields, useFieldDefinitionsVersion,
} from '@/lib/dynamic';
import { activeChips, clearAllCustom } from '@/lib/dynamicFilters';
import useStore from '@/store/useStore';
import { cn } from '@/lib/utils';
import { FilterChip } from './FilterChip';
import { AddFilterMenu } from './AddFilterMenu';

/**
 * Best-in-class inline filter bar (Linear/Airtable): editable filter chips +
 * a "+ Filter" property menu. Drop-in for the old DynamicFilterBar — same
 * props {entityType, filters, onChange} — and it renders its own chips, so the
 * separate DynamicFilterChips strip is no longer needed.
 */
export function FilterBar({ entityType, filters, onChange }) {
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
  const chips = useMemo(() => activeChips(filterable, filters), [filterable, filters]);
  const byKey = useMemo(() => new Map(filterable.map((d) => [d.field_key, d])), [filterable]);

  if (!filterable.length) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map((c) => {
        const def = byKey.get(c.key);
        return def ? <FilterChip key={c.key} definition={def} filters={filters} onChange={onChange} /> : null;
      })}
      <AddFilterMenu fields={filterable} filters={filters} onChange={onChange} hasChips={chips.length > 0} />
      {chips.length >= 2 && (
        <button
          type="button"
          onClick={() => onChange(clearAllCustom(filters))}
          className={cn(
            'inline-flex items-center h-8 px-2 text-xs text-muted-foreground hover:text-foreground rounded-md hover:bg-muted/60 transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
          )}
        >
          Clear all
        </button>
      )}
    </div>
  );
}

export default FilterBar;
