'use client';
import { useEffect, useState } from 'react';
import { DynamicField } from './DynamicField';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fetchFieldDefinitions, editableFields, groupBySection, useFieldDefinitionsVersion } from '@/lib/dynamic';
import useStore from '@/store/useStore';

export function DynamicForm({ entityType, values = {}, onChange, disabled, hideEmptySections, layout = 'card' }) {
  const { user } = useStore();
  const [definitions, setDefinitions] = useState([]);
  const [loading, setLoading] = useState(true);
  // Bumps whenever the field registry changes. Adding it to the effect
  // deps makes this form re-fetch the moment a schema edit lands —
  // no close-and-reopen required.
  const defsVersion = useFieldDefinitionsVersion();

  useEffect(() => {
    if (!entityType || !user) return;
    setLoading(true);
    fetchFieldDefinitions({ entity_type: entityType, force: true })
      .then(defs => setDefinitions(defs))
      .finally(() => setLoading(false));
  }, [entityType, user?.role, defsVersion]);

  const fields = editableFields(definitions, user?.role);
  const sections = groupBySection(fields);

  if (loading) return <div className="text-xs text-muted-foreground">Loading fields...</div>;
  if (!fields.length) return null;

  const setField = (key, val) => onChange?.({ ...values, [key]: val });

  if (layout === 'inline') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {fields.map(d => (
          <DynamicField
            key={d.id}
            definition={d}
            value={values[d.field_key]}
            onChange={v => setField(d.field_key, v)}
            disabled={disabled}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sections.map(section => {
        const hasValues = section.fields.some(
          f => values[f.field_key] !== undefined && values[f.field_key] !== null
        );
        if (hideEmptySections && !hasValues && disabled) return null;
        return (
          <Card key={section.name}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{section.name}</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {section.fields.map(d => (
                <DynamicField
                  key={d.id}
                  definition={d}
                  value={values[d.field_key]}
                  onChange={v => setField(d.field_key, v)}
                  disabled={disabled}
                />
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
