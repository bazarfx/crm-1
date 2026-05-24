'use client';

import { useState } from 'react';
import { Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DynamicForm } from './DynamicForm';
import { SchemaSidePanel } from './SchemaSidePanel';
import { cn } from '@/lib/utils';
import useStore from '@/store/useStore';

// Roles that can manage the schema for an entity. Centralised so the inline
// fields, the page-level button, and the side panel all agree.
const EDITOR_ROLES = new Set(['super_admin', 'admin', 'schema_editor']);

export function canManageFields(role) {
  return EDITOR_ROLES.has(role);
}

/**
 * Inline custom-field renderer. Drops the cf inputs straight into a parent
 * grid — no Card, no header, no edit affordances. Use this when you want
 * custom fields to sit next to native ones inside an existing section card.
 *
 * Pair with <ManageFieldsButton entityType={...} /> at the page level for
 * admins to add/edit the schema.
 */
export function DynamicFields({ entityType, values, onChange, disabled, hideEmptySections }) {
  return (
    <DynamicForm
      entityType={entityType}
      values={values}
      onChange={onChange}
      disabled={disabled}
      layout="inline"
      hideEmptySections={hideEmptySections}
    />
  );
}

/**
 * Always-visible "Manage fields" button. Shown to super_admin / admin /
 * schema_editor; renders nothing for anyone else. Opens the SchemaSidePanel
 * scoped to the entity. One button per page covers the whole form — no more
 * per-card hover affordances to hunt for.
 */
export function ManageFieldsButton({ entityType, label = 'Manage fields', className, size = 'sm' }) {
  const { user } = useStore();
  const [open, setOpen] = useState(false);
  if (!canManageFields(user?.role)) return null;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size={size}
        className={cn('gap-1.5', className)}
        onClick={() => setOpen(true)}
      >
        <Settings2 className="h-3.5 w-3.5" />
        {label}
      </Button>
      <SchemaSidePanel
        entityType={entityType}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}

/**
 * Back-compat alias. Old call sites use <EditableForm ... /> — keep the
 * import path stable but render the simplified inline fields with no
 * surrounding card. Any caller that wants the schema-editor entry point
 * should add <ManageFieldsButton /> at the page header alongside Save.
 */
export function EditableForm({
  entityType, values, onChange, disabled, hideEmptySections,
  // title/description/layout/children retained for prop compatibility but
  // intentionally ignored — there is no card anymore.
  // eslint-disable-next-line no-unused-vars
  title, description, layout, children,
}) {
  return (
    <DynamicFields
      entityType={entityType}
      values={values}
      onChange={onChange}
      disabled={disabled}
      hideEmptySections={hideEmptySections}
    />
  );
}

export default EditableForm;
