'use client';
import { useEffect, useState } from 'react';
import { Filter, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { DynamicField } from './DynamicField';
import { fetchFieldDefinitions, visibleFields, useFieldDefinitionsVersion } from '@/lib/dynamic';
import useStore from '@/store/useStore';

export function DynamicFilterBar({ entityType, filters, onChange }) {
  const { user } = useStore();
  const [definitions, setDefinitions] = useState([]);
  const [open, setOpen] = useState(false);
  const defsVersion = useFieldDefinitionsVersion();

  useEffect(() => {
    fetchFieldDefinitions({ entity_type: entityType, force: true }).then(setDefinitions);
  }, [entityType, defsVersion]);

  const filterable = visibleFields(definitions, user?.role).filter(d => d.is_filterable);
  const activeCount = Object.entries(filters || {}).filter(
    ([k]) => k.startsWith('cf_') && filters[k] !== '' && filters[k] != null
  ).length;

  const setField = (def, val) => {
    const key = `cf_${def.field_key}`;
    const next = { ...filters };
    if (
      val === null ||
      val === undefined ||
      val === '' ||
      (Array.isArray(val) && val.length === 0)
    ) {
      delete next[key];
    } else {
      next[key] = Array.isArray(val) ? val.join(',') : val;
    }
    onChange(next);
  };

  const clear = () => {
    const next = { ...filters };
    for (const k of Object.keys(next)) if (k.startsWith('cf_')) delete next[k];
    onChange(next);
  };

  if (!filterable.length) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-1.5">
          <Filter className="h-3.5 w-3.5" />
          Custom field filters
          {activeCount > 0 && (
            <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{activeCount}</Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 max-h-[60vh] overflow-y-auto">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Filter by custom fields</p>
            {activeCount > 0 && (
              <Button size="sm" variant="ghost" onClick={clear} className="h-6 text-[10px]">
                <X className="h-3 w-3 mr-1" />Clear
              </Button>
            )}
          </div>
          {filterable.map(def => {
            const key = `cf_${def.field_key}`;
            const raw = filters?.[key] ?? '';
            const value =
              ['multiselect', 'tags'].includes(def.field_type) && typeof raw === 'string'
                ? (raw ? raw.split(',') : [])
                : raw;
            return (
              <DynamicField
                key={def.id}
                definition={def}
                value={value}
                onChange={v => setField(def, v)}
                compact
              />
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
