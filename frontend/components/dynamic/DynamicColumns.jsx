'use client';

import { useEffect, useState } from 'react';
import { Columns3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import {
  fetchFieldDefinitions, visibleFields, useFieldDefinitionsVersion,
} from '@/lib/dynamic';
import { DynamicCell } from './DynamicCell';
import useStore from '@/store/useStore';

/**
 * Hook + picker for rendering dynamic custom-field columns on a list page.
 *
 * Returns:
 *   customDefs       — visible-to-this-role field definitions for the entity
 *   visibleColumns   — { field_key: boolean } toggle map
 *   toggleColumn     — helper to flip one
 *   cfColumnDefs     — array of tanstack-table column objects (drop into your useMemo)
 *   PickerButton     — JSX <Popover> with checkboxes; render in your filter row
 *
 * Live-updates via `useFieldDefinitionsVersion` so newly-added fields appear
 * immediately after the schema editor saves.
 *
 * Usage:
 *   const dyn = useDynamicColumns('user');
 *   const columns = useMemo(() => [...nativeColumns, ...dyn.cfColumnDefs],
 *                            [nativeColumns, dyn.cfColumnDefs]);
 *   ... <dyn.PickerButton />
 */
export function useDynamicColumns(entityType) {
  const { user } = useStore();
  const role = user?.role;
  const [customDefs, setCustomDefs] = useState([]);
  const [visibleColumns, setVisibleColumns] = useState({});
  const defsVersion = useFieldDefinitionsVersion();

  useEffect(() => {
    if (!role || !entityType) return;
    fetchFieldDefinitions({ entity_type: entityType, force: true })
      .then((defs) => {
        const vis = visibleFields(defs, role);
        setCustomDefs(vis);
        // Seed the toggle map from each definition's is_visible_in_list
        // flag — admins picked these as "show by default" in the editor.
        // Preserve any user toggles from the previous render so a refetch
        // doesn't clobber what they had open.
        setVisibleColumns((prev) => {
          const seeded = { ...prev };
          for (const d of vis) {
            if (!(d.field_key in seeded)) seeded[d.field_key] = !!d.is_visible_in_list;
          }
          return seeded;
        });
      })
      .catch(() => { /* silent — page works without custom fields */ });
  }, [entityType, role, defsVersion]);

  const toggleColumn = (key, checked) =>
    setVisibleColumns((prev) => ({ ...prev, [key]: checked }));

  // tanstack-table column defs — render conditionally based on toggle map.
  // Drop the whole array into a parent useMemo and concat with native columns.
  const cfColumnDefs = customDefs
    .filter((d) => visibleColumns[d.field_key])
    .map((def) => ({
      id: `cf_${def.field_key}`,
      header: def.label,
      cell: ({ row }) => (
        <DynamicCell
          definition={def}
          value={row.original?.custom_fields?.[def.field_key]}
        />
      ),
      enableSorting: false,
    }));

  const PickerButton = () => {
    if (!customDefs.length) return null;
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-9 gap-1.5">
            <Columns3 size={14} /> Columns
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 max-h-[60vh] overflow-y-auto">
          <p className="text-xs font-medium mb-2">Custom field columns</p>
          <div className="space-y-1.5">
            {customDefs.map((def) => (
              <label
                key={def.field_key}
                className="flex items-center gap-2 text-xs cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={!!visibleColumns[def.field_key]}
                  onChange={(e) => toggleColumn(def.field_key, e.target.checked)}
                />
                <span>{def.label}</span>
              </label>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    );
  };

  return { customDefs, visibleColumns, toggleColumn, cfColumnDefs, PickerButton };
}
