'use client';
import { useEffect, useState } from 'react';
import { DynamicField } from './DynamicField';
import { fetchFieldDefinitions, editableFields, useFieldDefinitionsVersion } from '@/lib/dynamic';
import { isFieldVisible } from '@/lib/conditions';
import useStore from '@/store/useStore';

// Flat custom-field renderer. We dropped section grouping — fields just sit
// in display_order in a single responsive grid. `hideEmptySections` is kept
// for prop compatibility but now means "hide the whole form when read-only
// and no values are filled in" (useful for sparse detail panels).
// `layout` is accepted but ignored; every caller renders inline now.
export function DynamicForm({
  entityType, values = {}, onChange, disabled, hideEmptySections,
  // eslint-disable-next-line no-unused-vars
  layout,
}) {
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

  // editableFields already applies role-based visibility + edit filtering.
  // Sort by display_order so the form mirrors what the schema editor sees
  // in the reorder UI.
  const roleFields = editableFields(definitions, user?.role)
    .slice()
    .sort((a, b) => (a.display_order || 100) - (b.display_order || 100));

  // Conditional visibility (Zoho "basic conditions"). Evaluate each field's
  // `visibility_condition` against the LIVE form values so the form reacts the
  // instant a driving field changes — a field whose condition is unmet is not
  // rendered AND not treated as required (it never reaches DynamicField, so it
  // can't block submit). `values` is the merged form state the parent lifts;
  // conditions can key on another custom field OR a native column present in it.
  const fields = roleFields.filter((d) => isFieldVisible(d, values));

  if (loading) return <div className="text-xs text-muted-foreground">Loading fields...</div>;
  if (!fields.length) return null;

  // Read-only mode + no values to show → caller asked us to hide the whole
  // form, so render nothing rather than an empty grid.
  if (hideEmptySections && disabled) {
    const hasAny = fields.some(
      (f) => values[f.field_key] !== undefined && values[f.field_key] !== null && values[f.field_key] !== '',
    );
    if (!hasAny) return null;
  }

  const setField = (key, val) => onChange?.({ ...values, [key]: val });

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {fields.map((d) => (
        <DynamicField
          key={d.id}
          definition={d}
          value={values[d.field_key]}
          onChange={(v) => setField(d.field_key, v)}
          disabled={disabled}
        />
      ))}
    </div>
  );
}
