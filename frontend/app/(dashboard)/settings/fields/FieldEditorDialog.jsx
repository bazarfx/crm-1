'use client';
import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Plus, X, Eye, ListOrdered, AlertCircle, Check, ChevronDown, Search,
  Sparkles, Settings2, Shield, Wand2, Tag, Archive, RotateCcw, Trash2,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { DynamicField } from '@/components/dynamic/DynamicField';
import api from '@/lib/api';
import { invalidateFieldDefinitions } from '@/lib/dynamic';
import { cn } from '@/lib/utils';

const TYPES = [
  'text', 'long_text', 'number', 'currency', 'percent',
  'date', 'datetime', 'boolean', 'dropdown', 'multiselect',
  'tags', 'phone', 'email', 'url', 'file_link',
];

const ROLES = [
  'super_admin', 'admin', 'schema_editor', 'floor_manager',
  'senior', 'tele_sales', 'back_office', 'auditor',
];

export function FieldEditorDialog({ field, entityType, open, onOpenChange, onSaved }) {
  const isEdit = !!field?.id;
  const [form, setForm] = useState({});
  const [usage, setUsage] = useState(null);
  const [saving, setSaving] = useState(false);

  // Post-save backfill prompt. The save() flow captures the resulting
  // field id + a preview count, then this state opens an irreversible-
  // action confirmation. Null means no prompt is showing.
  const [backfillPrompt, setBackfillPrompt] = useState(null);
  const [backfilling, setBackfilling] = useState(false);

  // Snapshot of the field's options when the dialog opened — so we can
  // diff against the in-progress edits and detect removals when save
  // fires. Empty array for new-field flows.
  const [originalOptions, setOriginalOptions] = useState([]);
  // Migration prompt for orphaned option values. Pops up after the user
  // clicks Save if they've removed options that are still in use.
  const [migrationPrompt, setMigrationPrompt] = useState(null);
  const [migrating, setMigrating] = useState(false);

  // Tracks whether the user has manually edited field_key. Until they do,
  // every label keystroke regenerates the slug — so the key tracks the
  // label naturally instead of getting stuck on the first letter typed.
  const keyManuallyEditedRef = useRef(false);

  // Local preview value — drives the live preview's interactivity. Decoupled
  // from default_value so typing in the preview doesn't accidentally edit
  // the field's default; only the explicit "Default value" editor does that.
  const [previewValue, setPreviewValue] = useState(null);

  useEffect(() => {
    if (!open) return;
    // Re-seed the preview value to the current default whenever the dialog
    // opens. After that, it floats independently.
    setPreviewValue(isEdit ? (field?.default_value ?? null) : null);
    // When editing, the key already exists — treat it as user-owned so we
    // never overwrite it. New fields start with the auto-track on.
    keyManuallyEditedRef.current = !!isEdit;
    if (isEdit) {
      setForm(field);
      // Snapshot options so save() can diff and detect removals. Stored
      // as plain {value, label} pairs — the editor's _value_edited flag
      // shouldn't survive the snapshot.
      setOriginalOptions(
        (field.options || []).map(({ value, label }) => ({ value, label })),
      );
      api
        .get(`/field-definitions/${field.id}/usage-count`)
        .then(({ data }) => setUsage(data.data.count))
        .catch(() => setUsage(0));
    } else {
      setOriginalOptions([]);
      setForm({
        entity_type: entityType,
        field_key: '',
        label: '',
        field_type: 'text',
        options: [],
        validation: {},
        default_value: null,
        helper_text: '',
        section: 'Custom',
        is_required: false,
        is_filterable: true,
        is_visible_in_list: false,
        visible_to_roles: [
          'super_admin', 'admin', 'schema_editor', 'floor_manager',
          'senior', 'tele_sales', 'back_office', 'auditor',
        ],
        editable_by_roles: [
          'super_admin', 'admin', 'floor_manager', 'senior', 'tele_sales',
        ],
      });
      setUsage(null);
    }
  }, [open, field, entityType, isEdit]);

  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // Label → value slug. Mirrors the field_key autogen so users only have to
  // type readable labels; the under-the-hood `value` (what gets stored on the
  // lead's custom_fields blob) fills itself in. They can still click to edit
  // it if they want a custom value.
  const slugify = (s) =>
    String(s || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 50);

  // Pick a sensible new field_type and, if it's a choice type, immediately
  // seed two empty option rows so the editor sees what to fill in instead
  // of an empty section.
  const setFieldType = (next) => {
    setForm((p) => {
      const isChoice = ['dropdown', 'multiselect'].includes(next);
      const hasOpts = Array.isArray(p.options) && p.options.length > 0;
      // Reset the default value when the type changes — a string default
      // makes no sense for a boolean, a boolean for a date, etc.
      return {
        ...p,
        field_type: next,
        default_value: p.field_type === next ? p.default_value : null,
        options: isChoice && !hasOpts
          ? [{ value: '', label: '' }, { value: '', label: '' }]
          : (p.options || []),
      };
    });
  };

  const addOption = () => setF('options', [...(form.options || []), { value: '', label: '' }]);
  const updateOption = (i, k, v) => {
    setF(
      'options',
      (form.options || []).map((o, idx) => {
        if (idx !== i) return o;
        const next = { ...o, [k]: v };
        // Auto-fill the underlying `value` from the label until the user
        // manually edits the value. `_value_edited` is an editor-only flag
        // that's stripped before save.
        if (k === 'label' && !o._value_edited) next.value = slugify(v);
        if (k === 'value') next._value_edited = true;
        return next;
      }),
    );
  };
  const removeOption = (i) => setF('options', (form.options || []).filter((_, idx) => idx !== i));
  // Enter on the last row's label = quick add another row, so editors can
  // hammer through 10 options without reaching for the mouse.
  const onOptionKeyDown = (e, i) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const last = (form.options || []).length - 1;
    if (i === last) addOption();
  };

  // Loading flags for the destructive footer actions. Disabling individual
  // buttons (rather than the whole dialog) so the operator can recover from
  // a failed request without losing in-progress edits.
  const [archiving, setArchiving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const archiveCurrent = async () => {
    if (!isEdit || !field?.id) return;
    if (!confirm(`Archive "${form.label}"? Existing data is preserved but the field hides from forms and filters. You can restore later.`)) return;
    setArchiving(true);
    try {
      await api.post(`/field-definitions/${field.id}/archive`);
      invalidateFieldDefinitions();
      toast.success('Archived');
      onSaved?.();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Archive failed');
    } finally {
      setArchiving(false);
    }
  };

  const restoreCurrent = async () => {
    if (!isEdit || !field?.id) return;
    setArchiving(true);
    try {
      await api.post(`/field-definitions/${field.id}/restore`);
      invalidateFieldDefinitions();
      toast.success('Restored');
      onSaved?.();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Restore failed');
    } finally {
      setArchiving(false);
    }
  };

  // Hard delete — backend refuses with 409 if any record holds a value.
  // We pre-check usage so the confirm prompt can be honest about whether
  // the operation will actually go through.
  const deleteCurrent = async () => {
    if (!isEdit || !field?.id) return;
    // Use the freshly-loaded usage count if we already have one; fall back
    // to a server check otherwise.
    let count = usage;
    if (count === null) {
      try {
        const { data } = await api.get(`/field-definitions/${field.id}/usage-count`);
        count = data?.data?.count ?? 0;
      } catch (_) { count = 0; }
    }
    if (count > 0) {
      toast.error(
        `${count.toLocaleString('en-IN')} record${count === 1 ? '' : 's'} still hold a value for "${form.field_key}". Archive it instead, or migrate the data first.`,
      );
      return;
    }
    if (!confirm(
      `Permanently delete "${form.label}"? This cannot be undone.\n\n` +
      `The field has no data in any record. Archive is safer if you might want it back.`,
    )) return;
    setDeleting(true);
    try {
      await api.delete(`/field-definitions/${field.id}`);
      invalidateFieldDefinitions();
      toast.success('Deleted permanently');
      onSaved?.();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  const save = async () => {
    if (!form.label || !form.field_key || !form.field_type) {
      toast.error('Label, key, and type are required');
      return;
    }
    if (['dropdown', 'multiselect'].includes(form.field_type)) {
      // Filter empty rows (an editor might have seeded 2 and only filled 1)
      // before the count + completeness checks.
      const filled = (form.options || []).filter((o) => (o.label || '').trim() && (o.value || '').trim());
      if (filled.length === 0) {
        toast.error('Add at least one option for the dropdown');
        return;
      }
      const dupes = filled.map((o) => o.value).filter((v, i, arr) => arr.indexOf(v) !== i);
      if (dupes.length) {
        toast.error(`Duplicate option values: ${[...new Set(dupes)].join(', ')}`);
        return;
      }
      // eslint-disable-next-line no-param-reassign
      form.options = filled.map(({ _value_edited, ...rest }) => rest);
    }
    // Detect removed options on an existing dropdown/multiselect — the
    // schema editor may have just deleted "Conservative" from a Risk
    // Tolerance field that 47 leads still hold. Block the save until the
    // user picks a migration strategy for each affected option.
    if (
      isEdit
      && ['dropdown', 'multiselect'].includes(form.field_type)
      && originalOptions.length > 0
    ) {
      const newValues = new Set((form.options || []).map((o) => o.value).filter(Boolean));
      const removed = originalOptions.filter((o) => o.value && !newValues.has(o.value));

      if (removed.length > 0) {
        // Look up live record counts for each removed option in parallel.
        const counts = await Promise.all(
          removed.map((o) =>
            api
              .get(`/field-definitions/${field.id}/option-usage`, { params: { value: o.value } })
              .then((r) => r.data?.data?.count ?? 0)
              .catch(() => 0),
          ),
        );
        const orphaned = removed
          .map((o, i) => ({ ...o, count: counts[i] }))
          .filter((o) => o.count > 0);

        if (orphaned.length > 0) {
          // Show the migration prompt and bail out of save() — user has
          // to pick a strategy per option before the PATCH can fire.
          setMigrationPrompt({
            removed: orphaned,
            // Strategy per removed value: 'keep' | 'empty' | 'replace'
            strategies: Object.fromEntries(orphaned.map((o) => [o.value, 'keep'])),
            // Replacement value per option, only used when strategy='replace'
            replacements: Object.fromEntries(orphaned.map((o) => [o.value, ''])),
          });
          return;
        }
      }
    }

    setSaving(true);
    try {
      let savedId;
      if (isEdit) {
        const { entity_type, field_key, field_type, id, createdAt, updatedAt, ...patch } = form;
        await api.patch(`/field-definitions/${field.id}`, patch);
        savedId = field.id;
      } else {
        const { data } = await api.post('/field-definitions', form);
        savedId = data?.data?.id;
      }
      // Bumps the global registry version — every open DynamicForm /
      // DynamicFilterBar re-fetches immediately. No close-and-reopen.
      invalidateFieldDefinitions();
      toast.success(isEdit ? 'Updated' : 'Created');

      // If the editor set a default value AND we have an id to act on,
      // ask whether to backfill it across existing records before closing.
      const hasDefault =
        form.default_value !== null
        && form.default_value !== undefined
        && form.default_value !== '';

      if (savedId && hasDefault) {
        try {
          const { data } = await api.get(`/field-definitions/${savedId}/backfill-preview`);
          const preview = data?.data;
          if (preview && preview.affected_count > 0) {
            setBackfillPrompt({ ...preview, savedId });
            return; // wait for user to confirm or skip before closing
          }
        } catch (_) { /* preview failed → just close, user can run later */ }
      }

      onSaved?.();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const confirmBackfill = async () => {
    if (!backfillPrompt?.savedId) return;
    setBackfilling(true);
    try {
      const { data } = await api.post(`/field-definitions/${backfillPrompt.savedId}/backfill-default`);
      const count = data?.data?.affected_count ?? 0;
      toast.success(`Backfilled default to ${count} record${count === 1 ? '' : 's'}`);
      // Custom-field values changed in the DB → re-fetch any open forms.
      invalidateFieldDefinitions();
      setBackfillPrompt(null);
      onSaved?.();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Backfill failed');
    } finally {
      setBackfilling(false);
    }
  };

  const skipBackfill = () => {
    setBackfillPrompt(null);
    onSaved?.();
  };

  // Apply the option-removal migration the user just configured, then
  // proceed with the regular PATCH to persist the new options. Two
  // round-trips so each endpoint stays idempotent and small.
  const confirmMigration = async () => {
    if (!migrationPrompt) return;
    // Build the payload backend wants. Skip 'keep' rows — they're no-ops
    // server-side anyway but sending them inflates the audit row.
    const payload = migrationPrompt.removed
      .map((o) => ({
        removed_value: o.value,
        strategy: migrationPrompt.strategies[o.value],
        replacement_value: migrationPrompt.strategies[o.value] === 'replace'
          ? migrationPrompt.replacements[o.value]
          : undefined,
      }))
      .filter((m) => m.strategy && m.strategy !== 'keep');

    // Validate replacements before firing the migration.
    for (const m of payload) {
      if (m.strategy === 'replace' && !m.replacement_value) {
        toast.error('Pick a replacement value for every "Replace" row');
        return;
      }
    }

    setMigrating(true);
    try {
      if (payload.length > 0) {
        await api.post(`/field-definitions/${field.id}/migrate-options`, { migrations: payload });
      }
      // Now persist the new field definition (the options that the user
      // edited). Clearing migrationPrompt before save() so the re-entry
      // skips the orphan check (we just resolved it).
      setMigrationPrompt(null);
      // Snapshot the new options as the baseline so a second edit pass
      // diffs against the post-migration state, not the pre-migration one.
      setOriginalOptions((form.options || []).map(({ value, label }) => ({ value, label })));
      await save();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Migration failed');
    } finally {
      setMigrating(false);
    }
  };

  const cancelMigration = () => {
    setMigrationPrompt(null);
    // Don't close the dialog — let the user fix their options. They
    // probably want to put a removed option back or pick differently.
  };

  const setMigrationStrategy = (val, strategy) =>
    setMigrationPrompt((p) => ({
      ...p,
      strategies: { ...p.strategies, [val]: strategy },
    }));
  const setMigrationReplacement = (val, replacement) =>
    setMigrationPrompt((p) => ({
      ...p,
      replacements: { ...p.replacements, [val]: replacement },
    }));

  const showOptions = ['dropdown', 'multiselect'].includes(form.field_type);

  const entityLabel = (entityType || form.entity_type || 'record').replace(/_/g, ' ');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-5xl w-[95vw] max-h-[90vh] overflow-hidden p-0 gap-0 border-border/60 flex flex-col"
        hideClose
      >
        {/* Header — title + entity badge + tagline. Sits on a thin gradient
            tint so the dialog reads as "premium tool" rather than generic form.
            flex-shrink-0 keeps it pinned at the top of the flex column. */}
        <div className="relative flex-shrink-0 px-7 py-5 border-b border-border/60 bg-gradient-to-b from-accent/[0.04] to-transparent">
          <DialogHeader className="text-left space-y-1.5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#4F8EF7]/10 text-[#4F8EF7]">
                {isEdit ? <Settings2 className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
              </div>
              <DialogTitle className="text-base font-semibold">
                {isEdit ? 'Edit field' : 'New custom field'}
              </DialogTitle>
              <Badge variant="outline" className="text-[10px] font-medium uppercase tracking-wider border-border/60">
                {entityLabel}
              </Badge>
              {isEdit && usage !== null && usage > 0 && (
                <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-600 dark:text-amber-300 bg-amber-500/5">
                  {usage.toLocaleString('en-IN')} in use
                </Badge>
              )}
            </div>
            <DialogDescription className="text-xs text-muted-foreground">
              {isEdit
                ? <>Editing <span className="font-medium text-foreground">{form.label}</span>. Type and key are locked — everything else takes effect instantly across the CRM.</>
                : <>Define a new field on <span className="font-medium text-foreground">{entityLabel}</span>. It appears across forms, filters, and detail pages the moment you save.</>}
            </DialogDescription>
          </DialogHeader>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Close dialog"
            className="absolute right-3 top-3 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body — one outer scrollable region so the whole popup scrolls
            uniformly (no surprise per-column scroll boxes). The preview rail
            uses `position: sticky` inside it so it stays in view on desktop
            while the form scrolls. On mobile, everything stacks and scrolls
            together.
            `contain: layout paint` isolates the scroll container so the
            browser doesn't recompute layout/painting outside the dialog on
            every scroll frame — was the main source of scroll judder. */}
        <div
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain"
          style={{ contain: 'layout paint', willChange: 'scroll-position' }}
        >
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px]">
            {/* Form column */}
            <div className="px-7 py-6 space-y-7">
            <FormSection
              icon={Sparkles}
              title="Basics"
              description="What people see and how the value is stored."
            >
              <Field label="Label">
                <Input
                  value={form.label || ''}
                  onChange={e => {
                    const nextLabel = e.target.value;
                    setForm(p => {
                      const next = { ...p, label: nextLabel };
                      if (!isEdit && !keyManuallyEditedRef.current) {
                        next.field_key = nextLabel
                          .toLowerCase()
                          .replace(/[^a-z0-9]+/g, '_')
                          .replace(/^_+|_+$/g, '')
                          .slice(0, 50);
                      }
                      return next;
                    });
                  }}
                  className="h-10 text-sm"
                  placeholder="e.g. Risk Tolerance"
                />
              </Field>

              <Field
                label="Field key"
                hint={!isEdit ? 'Auto-filled from label · snake_case · permanent once saved' : 'Locked after creation'}
              >
                <Input
                  value={form.field_key || ''}
                  disabled={isEdit}
                  onChange={e => {
                    keyManuallyEditedRef.current = true;
                    setF('field_key', e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'));
                  }}
                  className="h-10 text-sm font-mono"
                  placeholder="risk_tolerance"
                />
              </Field>

              <Field
                label="Type"
                hint={isEdit ? 'Locked after creation' : 'How values are stored & validated'}
              >
                <Select
                  value={form.field_type}
                  onValueChange={(v) => setFieldType(v)}
                  disabled={isEdit}
                >
                  <SelectTrigger className="h-10 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TYPES.map(t => (
                      <SelectItem key={t} value={t}>{t.replace(/_/g, ' ')}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field
                label={<>Helper text <span className="text-muted-foreground/70 font-normal">· Optional</span></>}
                hint="Shown under the field as a one-line nudge"
              >
                <Input
                  value={form.helper_text || ''}
                  onChange={e => setF('helper_text', e.target.value)}
                  className="h-10 text-sm"
                  placeholder="e.g. Rough monthly trading volume"
                />
              </Field>
            </FormSection>

            {showOptions && (
              <FormSection
                icon={ListOrdered}
                title="Choices"
                description={`The picker users will see for this ${form.field_type === 'dropdown' ? 'dropdown' : 'multi-select'}.`}
              >
                <OptionsEditor
                  form={form}
                  addOption={addOption}
                  updateOption={updateOption}
                  removeOption={removeOption}
                  onOptionKeyDown={onOptionKeyDown}
                />
              </FormSection>
            )}

            <FormSection
              icon={Wand2}
              title="Default value"
              description="Pre-fills the field when a new record is created."
            >
              <DefaultValueEditor form={form} setF={setF} />
            </FormSection>

            <FormSection
              icon={Settings2}
              title="Behavior"
              description="Where this field shows up across the CRM."
            >
              <div className="rounded-xl border border-border/60 divide-y divide-border/60 bg-card">
                <ToggleRow
                  title="Required"
                  description="Users must fill this before saving the record."
                  checked={!!form.is_required}
                  onCheckedChange={v => setF('is_required', v)}
                />
                <ToggleRow
                  title="Filterable"
                  description="Appears in the filter bar on list views."
                  checked={!!form.is_filterable}
                  onCheckedChange={v => setF('is_filterable', v)}
                />
                <ToggleRow
                  title="Show as table column"
                  description="Becomes a column on the main list view by default."
                  checked={!!form.is_visible_in_list}
                  onCheckedChange={v => setF('is_visible_in_list', v)}
                />
              </div>
            </FormSection>

            <FormSection
              icon={Shield}
              title="Permissions"
              description="Restrict who can see or edit this field by role."
            >
              <Field label="Visible to roles">
                <RoleCheckboxDropdown
                  roles={ROLES}
                  selected={form.visible_to_roles || []}
                  onChange={(next) => setF('visible_to_roles', next)}
                  accent="blue"
                  emptyHint="No roles selected — field will be hidden from everyone"
                />
              </Field>
              <Field label="Editable by roles">
                <RoleCheckboxDropdown
                  roles={ROLES}
                  selected={form.editable_by_roles || []}
                  onChange={(next) => setF('editable_by_roles', next)}
                  accent="amber"
                  emptyHint="No roles selected — field will be read-only for everyone"
                />
              </Field>
            </FormSection>
          </div>

            {/* Right: sticky preview rail — stays in view as the form scrolls. */}
            <PreviewRail
              form={form}
              entityLabel={entityLabel}
              previewValue={previewValue}
              setPreviewValue={setPreviewValue}
              isEdit={isEdit}
              usage={usage}
            />
          </div>
        </div>

        {/* Footer — actions + status line. flex-shrink-0 keeps it pinned at
            the bottom of the dialog regardless of body scroll position.
            Destructive actions (Archive / Restore / Delete) only render in
            edit mode and live on the left so they're visually separated
            from the primary Save action on the right. */}
        <div className="flex-shrink-0 border-t border-border/60 px-7 py-4 bg-muted/20 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            {!isEdit && (
              <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <Sparkles className="h-3 w-3" />
                Live on every {entityLabel} form the moment you save.
              </p>
            )}
            {isEdit && (form.is_archived ? (
              <Button
                variant="outline"
                size="sm"
                onClick={restoreCurrent}
                disabled={archiving || deleting || saving}
                className="text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                {archiving ? 'Restoring…' : 'Restore'}
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={archiveCurrent}
                disabled={archiving || deleting || saving}
                className="text-amber-600 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/10"
              >
                <Archive className="h-3.5 w-3.5 mr-1.5" />
                {archiving ? 'Archiving…' : 'Archive'}
              </Button>
            ))}
            {isEdit && (
              <Button
                variant="outline"
                size="sm"
                onClick={deleteCurrent}
                disabled={archiving || deleting || saving}
                className="text-red-600 dark:text-red-400 border-red-500/30 hover:bg-red-500/10"
                title={usage > 0 ? 'Field has data — archive instead' : 'Permanently delete'}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                {deleting ? 'Deleting…' : 'Delete'}
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button
              onClick={save}
              disabled={saving || archiving || deleting}
              className="bg-[#4F8EF7] hover:bg-[#3B7CE8] text-white shadow-sm"
            >
              {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create field'}
            </Button>
          </div>
        </div>

        {/* Option-migration prompt — fires when an edit removed dropdown
            options that some existing records still hold. User picks per
            option: Keep / Empty / Replace (with substitute). */}
        {migrationPrompt && (
          <MigrationConfirm
            prompt={migrationPrompt}
            availableReplacements={(form.options || [])
              .filter((o) => o.value)
              .map((o) => ({ value: o.value, label: o.label || o.value }))}
            saving={migrating}
            fieldType={form.field_type}
            entityLabel={(form.entity_type || '').replace(/_/g, ' ')}
            onStrategyChange={setMigrationStrategy}
            onReplacementChange={setMigrationReplacement}
            onConfirm={confirmMigration}
            onCancel={cancelMigration}
          />
        )}

        {/* Backfill confirmation — only renders after a successful save when
            the new field has a default value AND there are records without
            it set. The action is irreversible; the affected count and
            sample value are surfaced clearly before the user confirms. */}
        {backfillPrompt && (
          <BackfillConfirm
            preview={backfillPrompt}
            entityType={form.entity_type || form.entityType}
            saving={backfilling}
            onConfirm={confirmBackfill}
            onSkip={skipBackfill}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// Inline migration prompt — one row per removed option, each with a
// per-option strategy (keep / empty / replace) and a replacement picker
// when relevant. The whole panel is gated behind a single Apply button so
// the schema editor sees the full impact before anything runs.
function MigrationConfirm({
  prompt, availableReplacements, saving, fieldType,
  entityLabel, onStrategyChange, onReplacementChange,
  onConfirm, onCancel,
}) {
  const totalAffected = prompt.removed.reduce((a, o) => a + o.count, 0);
  const isMulti = fieldType === 'multiselect';

  return (
    <div className="mt-4 rounded-lg border border-red-500/40 bg-red-500/5 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <AlertCircle className="h-5 w-5 text-red-500 dark:text-red-400 flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-sm font-semibold text-red-800 dark:text-red-200">
            You removed {prompt.removed.length} option{prompt.removed.length === 1 ? '' : 's'} still in use
          </p>
          <p className="text-xs text-red-700/90 dark:text-red-300/90">
            {totalAffected.toLocaleString('en-IN')} existing {entityLabel || 'record'}
            {totalAffected === 1 ? '' : 's'} still hold the removed value
            {prompt.removed.length === 1 ? '' : 's'}. Pick what to do with each before saving.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {prompt.removed.map((opt) => {
          const strategy = prompt.strategies[opt.value];
          const replacement = prompt.replacements[opt.value];
          return (
            <div key={opt.value} className="rounded border bg-card p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-medium">
                    {opt.label || opt.value}{' '}
                    <span className="text-[10px] text-muted-foreground font-mono">({opt.value})</span>
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {opt.count.toLocaleString('en-IN')} {entityLabel || 'record'}
                    {opt.count === 1 ? '' : 's'} currently {isMulti ? 'include' : 'use'} this value.
                  </p>
                </div>
              </div>

              {/* Three-way strategy radio. Native radios so they're keyboard-
                  accessible and consistent across themes. */}
              <div className="flex flex-wrap gap-1.5">
                {[
                  { id: 'keep',    label: 'Keep as-is',                color: 'bg-slate-500/15 border-slate-500/50 text-slate-700 dark:text-slate-300' },
                  { id: 'empty',   label: isMulti ? 'Remove from arrays' : 'Empty the field', color: 'bg-amber-500/15 border-amber-500/50 text-amber-700 dark:text-amber-300' },
                  { id: 'replace', label: 'Replace with…',             color: 'bg-emerald-500/15 border-emerald-500/50 text-emerald-700 dark:text-emerald-300' },
                ].map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => onStrategyChange(opt.value, s.id)}
                    disabled={saving}
                    className={cn(
                      'px-2.5 py-1 text-[11px] rounded border transition-colors',
                      strategy === s.id
                        ? `${s.color} font-medium`
                        : 'bg-transparent border-border text-muted-foreground hover:bg-muted',
                    )}
                  >
                    {strategy === s.id && <Check className="h-3 w-3 inline mr-1" />}
                    {s.label}
                  </button>
                ))}
              </div>

              {strategy === 'replace' && (
                <div className="space-y-1">
                  <Label className="text-[10px]">Replacement value</Label>
                  <Select
                    value={replacement || '__pick__'}
                    onValueChange={(v) => onReplacementChange(opt.value, v === '__pick__' ? '' : v)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Pick a remaining option…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__pick__" disabled>Pick a remaining option…</SelectItem>
                      {availableReplacements.length === 0 ? (
                        <SelectItem value="__none__" disabled>
                          No other options available — add one first.
                        </SelectItem>
                      ) : (
                        availableReplacements.map((r) => (
                          <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {strategy === 'keep' && (
                <p className="text-[10px] text-muted-foreground italic">
                  Records will continue to hold &quot;{opt.value}&quot; even though it&apos;s no
                  longer in the dropdown. They&apos;ll render as a plain value with no badge.
                </p>
              )}
              {strategy === 'empty' && (
                <p className="text-[10px] text-amber-700 dark:text-amber-400">
                  ⚠ Irreversible. {isMulti
                    ? `Removes "${opt.value}" from each record's array.`
                    : `Sets ${opt.count} record${opt.count === 1 ? '' : 's'} back to empty for this field.`}
                </p>
              )}
              {strategy === 'replace' && replacement && (
                <p className="text-[10px] text-emerald-700 dark:text-emerald-400">
                  ⚠ Irreversible. Rewrites {opt.count} record{opt.count === 1 ? '' : 's'}: &quot;{opt.value}&quot; → &quot;{replacement}&quot;.
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
          Cancel — go back to options
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={onConfirm}
          disabled={saving}
          className="bg-red-600 hover:bg-red-700 text-white"
        >
          {saving ? 'Applying…' : `Apply migration & save`}
        </Button>
      </div>
    </div>
  );
}

// Inline confirmation panel. Lives inside the dialog content (not a nested
// dialog) so it stacks naturally below the footer; the buttons up top are
// disabled while the user decides. Big amber warning, value preview, and
// the exact count to be touched.
function BackfillConfirm({ preview, entityType, saving, onConfirm, onSkip }) {
  const renderValue = (v) => {
    if (v === null || v === undefined) return '(empty)';
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    if (Array.isArray(v)) return v.join(', ');
    return String(v);
  };
  const entityLabel = (entityType || preview.entity_type || 'record')
    .replace(/_/g, ' ');
  return (
    <div className="mt-4 rounded-lg border border-amber-500/50 bg-amber-500/10 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <AlertCircle className="h-5 w-5 text-amber-500 dark:text-amber-400 flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
            Apply default to existing {entityLabel}s?
          </p>
          <p className="text-xs text-amber-700/90 dark:text-amber-300/90">
            You set a default of{' '}
            <code className="px-1 bg-amber-500/20 rounded text-[11px] font-mono">
              {renderValue(preview.default_value)}
            </code>{' '}
            for <strong>{preview.field_key}</strong>. There{' '}
            {preview.affected_count === 1 ? 'is' : 'are'}{' '}
            <strong>{preview.affected_count.toLocaleString('en-IN')}</strong>{' '}
            existing {entityLabel}{preview.affected_count === 1 ? '' : 's'} where this field is empty.
          </p>
          <p className="text-xs font-medium text-red-600 dark:text-red-400 pt-1">
            ⚠ This is irreversible. The default will be written into every empty record &mdash; you can&apos;t undo it from the editor.
          </p>
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 pt-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onSkip}
          disabled={saving}
        >
          Skip — leave existing records empty
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={onConfirm}
          disabled={saving}
          className="bg-amber-600 hover:bg-amber-700 text-white"
        >
          {saving ? 'Backfilling…' : `Apply to ${preview.affected_count.toLocaleString('en-IN')} record${preview.affected_count === 1 ? '' : 's'}`}
        </Button>
      </div>
    </div>
  );
}

/**
 * Type-aware default-value picker. The shape of the control changes with
 * the chosen field_type so the editor doesn't have to think about how to
 * express "default = true" for a boolean vs "default = 'medium'" for a
 * dropdown. Stored value matches the live record's eventual shape exactly.
 */
function DefaultValueEditor({ form, setF }) {
  const type = form.field_type;
  const value = form.default_value;
  const clear = () => setF('default_value', null);

  // Helper: render the wrapper with a clear button when a default is set.
  // No own chrome — the outer FormSection provides the title + spacing.
  const Wrap = ({ children }) => (
    <div className="space-y-2">
      {value !== null && value !== undefined && value !== '' && (
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={clear}
            className="text-[10px] text-muted-foreground hover:text-red-500"
          >
            Clear default
          </button>
        </div>
      )}
      {children}
    </div>
  );

  if (type === 'boolean') {
    const state = value === true ? 'yes' : value === false ? 'no' : 'unset';
    const btn = (id, label, color) => {
      const selected = state === id;
      return (
        <button
          type="button"
          onClick={() => setF('default_value', id === 'yes' ? true : id === 'no' ? false : null)}
          className={cn(
            'flex-1 h-9 text-xs rounded border transition-colors',
            selected
              ? `${color} font-medium`
              : 'bg-transparent border-border text-muted-foreground hover:bg-muted',
          )}
        >
          {label}
        </button>
      );
    };
    return (
      <Wrap>
        <div className="flex gap-1.5">
          {btn('yes', 'Default to Yes', 'bg-emerald-500/15 border-emerald-500/50 text-emerald-700 dark:text-emerald-300')}
          {btn('no',  'Default to No',  'bg-slate-500/15 border-slate-500/50 text-slate-700 dark:text-slate-300')}
          {btn('unset', 'Leave unset',  'bg-amber-500/15 border-amber-500/50 text-amber-700 dark:text-amber-300')}
        </div>
        <p className="text-[10px] text-muted-foreground">
          <strong>Leave unset</strong> means new records start with the field empty —
          the lead view will show &quot;(not set)&quot; until someone explicitly answers Yes or No.
        </p>
      </Wrap>
    );
  }

  if (type === 'dropdown') {
    const opts = (form.options || []).filter((o) => o.value);
    if (opts.length === 0) {
      return (
        <Wrap>
          <p className="text-[10px] text-muted-foreground italic">
            Add options first, then come back to pick a default.
          </p>
        </Wrap>
      );
    }
    return (
      <Wrap>
        <Select
          value={value || '__none__'}
          onValueChange={(v) => setF('default_value', v === '__none__' ? null : v)}
        >
          <SelectTrigger className="h-9 text-sm">
            <SelectValue placeholder="No default" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">No default</SelectItem>
            {opts.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label || o.value}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Wrap>
    );
  }

  if (['number', 'currency', 'percent'].includes(type)) {
    return (
      <Wrap>
        <Input
          type="number"
          value={value ?? ''}
          onChange={(e) => setF('default_value', e.target.value === '' ? null : Number(e.target.value))}
          className="h-9 text-sm"
          placeholder="e.g. 0"
        />
      </Wrap>
    );
  }

  if (type === 'date' || type === 'datetime') {
    return (
      <Wrap>
        <Input
          type={type === 'datetime' ? 'datetime-local' : 'date'}
          value={value ? String(value).slice(0, type === 'datetime' ? 16 : 10) : ''}
          onChange={(e) => setF('default_value', e.target.value || null)}
          className="h-9 text-sm"
        />
      </Wrap>
    );
  }

  if (['multiselect', 'tags'].includes(type)) {
    // Multi-value defaults are rare and easy to mis-configure — skip the
    // editor and let the record start empty. (If a future ask comes up,
    // we can pre-seed an array here.)
    return null;
  }

  // text / long_text / email / phone / url / file_link
  return (
    <Wrap>
      <Input
        value={value ?? ''}
        onChange={(e) => setF('default_value', e.target.value || null)}
        className="h-9 text-sm"
        placeholder="Leave blank for no default"
      />
    </Wrap>
  );
}

// Dropdown-with-checkboxes role picker. Trigger shows the count + a chip
// row when ≤3 are selected; the panel exposes search, All/None shortcuts,
// and per-role checkboxes. Used for both visible_to_roles and
// editable_by_roles — only the accent color varies so the two fields stay
// visually distinct on the form.
function RoleCheckboxDropdown({ roles, selected, onChange, accent = 'blue', emptyHint }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchRef = useRef(null);

  // Reset the search box every time the popover opens, and focus it so the
  // user can immediately start typing without an extra click.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    const t = setTimeout(() => searchRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [open]);

  const accents = {
    blue: {
      trigger: 'border-[#4F8EF7]/50 bg-[#4F8EF7]/5 text-[#4F8EF7]',
      check:   'text-[#4F8EF7] border-[#4F8EF7]',
      chipBg:  'bg-[#4F8EF7]/10 text-[#4F8EF7] border-[#4F8EF7]/30',
    },
    amber: {
      trigger: 'border-amber-500/50 bg-amber-500/5 text-amber-600 dark:text-amber-300',
      check:   'text-amber-500 border-amber-500',
      chipBg:  'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30',
    },
  };
  const a = accents[accent] || accents.blue;
  const selectedSet = new Set(selected);
  const count = selectedSet.size;
  const total = roles.length;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return roles;
    return roles.filter((r) => r.replace(/_/g, ' ').toLowerCase().includes(q));
  }, [roles, query]);

  const toggle = (role) => {
    if (selectedSet.has(role)) onChange(selected.filter((r) => r !== role));
    else onChange([...selected, role]);
  };

  // "All" / "None" act on the currently filtered list so a search-first
  // workflow works ("filter to admin*, click All" → only admin-y roles
  // selected). With no query, they cover everything.
  const selectAllFiltered = () => {
    const next = new Set(selected);
    filtered.forEach((r) => next.add(r));
    onChange(Array.from(next));
  };
  const clearAllFiltered = () => {
    const remove = new Set(filtered);
    onChange(selected.filter((r) => !remove.has(r)));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'w-full flex items-center justify-between gap-2 min-h-10 px-3 py-1.5 rounded-md border text-xs',
            'hover:bg-muted/40 transition-colors text-left',
            count > 0 ? a.trigger : 'border-border text-muted-foreground',
          )}
        >
          {count === 0 ? (
            <span className="truncate">None selected</span>
          ) : count === total ? (
            <span className="truncate font-medium">All {total} roles</span>
          ) : count <= 3 ? (
            <div className="flex flex-wrap gap-1 flex-1 min-w-0">
              {selected.map((r) => (
                <span
                  key={r}
                  className={cn(
                    'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border',
                    a.chipBg,
                  )}
                >
                  {r.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          ) : (
            <span className="truncate font-medium">{count} of {total} selected</span>
          )}
          <ChevronDown className={cn('h-3.5 w-3.5 flex-shrink-0 opacity-60 transition-transform', open && 'rotate-180')} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0 overflow-hidden">
        {/* Search header */}
        <div className="border-b border-border/60 p-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search roles…"
              className={cn(
                'w-full h-8 pl-7 pr-2 text-xs rounded-md bg-muted/40 border border-transparent',
                'focus:outline-none focus:border-border focus:bg-background',
                'placeholder:text-muted-foreground/70',
              )}
            />
          </div>
          <div className="flex items-center justify-between mt-2 px-0.5">
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {count} of {total} selected
            </span>
            <div className="flex gap-0.5">
              <button
                type="button"
                onClick={selectAllFiltered}
                className="text-[10px] font-medium text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded hover:bg-muted transition-colors"
              >
                All
              </button>
              <button
                type="button"
                onClick={clearAllFiltered}
                className="text-[10px] font-medium text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded hover:bg-muted transition-colors"
              >
                None
              </button>
            </div>
          </div>
        </div>

        {/* Role list — capped at ~6 rows; scroll engages for anything
            longer, including the default 8-role lineup. No mask-image
            fade because GPU masks repaint per scroll frame and visibly
            stutter the list. Plain overflow is much smoother. */}
        <div className="max-h-[180px] overflow-y-auto overscroll-contain p-1">
          {filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-[11px] text-muted-foreground">
              No roles match &quot;{query}&quot;
            </p>
          ) : (
            filtered.map((r) => {
              const sel = selectedSet.has(r);
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => toggle(r)}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-2 py-1.5 rounded text-xs transition-colors',
                    'hover:bg-muted',
                  )}
                >
                  <span
                    className={cn(
                      'h-4 w-4 rounded-[4px] border-[1.5px] flex items-center justify-center flex-shrink-0 transition-all',
                      sel ? a.check : 'border-border',
                    )}
                  >
                    {sel && <Check className="h-3 w-3" strokeWidth={3} />}
                  </span>
                  <span className="text-left flex-1 capitalize">{r.replace(/_/g, ' ')}</span>
                </button>
              );
            })
          )}
        </div>

        {count === 0 && emptyHint && (
          <div className="border-t border-border/60 px-3 py-2 bg-amber-500/5">
            <p className="text-[10px] text-amber-700 dark:text-amber-400 flex items-start gap-1.5">
              <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
              <span>{emptyHint}</span>
            </p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Layout helpers — give each logical group its own visual breathing room
// without resorting to a sea of borders. Headers are uppercase micro-labels
// (Linear/Vercel style) so they read as section dividers, not heavy chrome.
// ---------------------------------------------------------------------------

function FormSection({ icon: Icon, title, description, children }) {
  return (
    <section className="space-y-3">
      <div className="flex items-start gap-2.5">
        {Icon && (
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-muted/60 text-muted-foreground flex-shrink-0 mt-0.5">
            <Icon className="h-3.5 w-3.5" />
          </div>
        )}
        <div className="min-w-0">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/90">
            {title}
          </h3>
          {description && (
            <p className="text-[11px] text-muted-foreground mt-0.5">{description}</p>
          )}
        </div>
      </div>
      <div className="space-y-3 pl-[38px]">{children}</div>
    </section>
  );
}

function Field({ label, hint, children }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label className="text-[11px] font-medium text-foreground/80">{label}</Label>
        {hint && (
          <span className="text-[10px] text-muted-foreground">{hint}</span>
        )}
      </div>
      {children}
    </div>
  );
}

function ToggleRow({ title, description, checked, onCheckedChange }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <p className="text-xs font-medium text-foreground">{title}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

// Options editor — a refined version of the inline list previously embedded
// in the dialog. Stays compact while signaling state (needs attention vs.
// happy) and gives each row a tidy two-line shape (label + auto value).
function OptionsEditor({ form, addOption, updateOption, removeOption, onOptionKeyDown }) {
  const opts = form.options || [];
  const filledCount = opts.filter((o) => (o.label || '').trim()).length;
  const needsAttention = filledCount === 0;

  return (
    <div
      className={cn(
        'rounded-xl border p-3 space-y-2.5 transition-colors',
        needsAttention
          ? 'border-amber-500/40 bg-amber-500/5'
          : 'border-border/60 bg-card',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] text-muted-foreground tabular-nums">
          {filledCount} of {opts.length || '0'} option{opts.length === 1 ? '' : 's'} filled
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 text-[11px]"
          onClick={addOption}
        >
          <Plus className="h-3 w-3 mr-1" />Add option
        </Button>
      </div>

      {needsAttention && (
        <div className="flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-300">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
          <span>
            Add at least one option. Press{' '}
            <kbd className="px-1 bg-muted rounded font-mono">Enter</kbd> on a label to add another row.
          </span>
        </div>
      )}

      {opts.length === 0 ? (
        <Button
          type="button"
          variant="ghost"
          className="w-full h-10 border border-dashed text-xs"
          onClick={addOption}
        >
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Add your first option
        </Button>
      ) : (
        <div className="space-y-1.5">
          {opts.map((o, i) => (
            <div
              key={i}
              className="rounded-md border border-border/50 bg-background/60 px-2 py-1.5 space-y-1 hover:border-border transition-colors"
            >
              <div className="flex gap-1.5 items-center">
                <span className="text-[10px] text-muted-foreground w-5 text-right tabular-nums font-mono">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <Input
                  placeholder={`e.g. ${['Low', 'Medium', 'High', 'Urgent'][i % 4]}`}
                  value={o.label || ''}
                  onChange={(e) => updateOption(i, 'label', e.target.value)}
                  onKeyDown={(e) => onOptionKeyDown(e, i)}
                  className="h-8 text-xs flex-1 border-transparent bg-transparent focus-visible:bg-background focus-visible:border-input"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-muted-foreground hover:text-red-500"
                  onClick={() => removeOption(i)}
                  title="Remove option"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
              <div className="pl-7 flex items-center gap-1.5">
                <Tag className="h-2.5 w-2.5 text-muted-foreground/60" />
                <span className="text-[9px] text-muted-foreground/70 uppercase tracking-wider">value</span>
                <Input
                  value={o.value || ''}
                  onChange={(e) => updateOption(i, 'value', e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                  className="h-5 text-[10px] font-mono px-1.5 py-0 max-w-[14rem] border-dashed bg-transparent"
                  placeholder="auto"
                  title="Stored value (auto-derived from label, edit to override)"
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Sticky preview rail. Lives in the right-hand column of the dialog body's
// single scroll container. On desktop it uses `position: sticky` so it
// stays parked in view as the form scrolls underneath; on mobile it falls
// back to natural flow underneath the form. Shows the field exactly how
// it'll render in a real form, framed in a card so the schema editor sees
// the result in context rather than as a disembodied input.
function PreviewRail({ form, entityLabel, previewValue, setPreviewValue, isEdit, usage }) {
  const hasContent = !!form.label;
  return (
    <aside
      className="border-t lg:border-t-0 lg:border-l border-border/60 bg-muted/20 lg:sticky lg:top-0 lg:self-start lg:max-h-[calc(90vh-180px)] lg:overflow-y-auto"
    >
      <div className="px-6 py-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/80">
            <Eye className="h-3.5 w-3.5" /> Live preview
          </div>
          {previewValue !== null && previewValue !== '' && previewValue !== undefined && (
            <button
              type="button"
              onClick={() => setPreviewValue(form.default_value ?? null)}
              className="text-[10px] text-muted-foreground hover:text-foreground"
            >
              Reset
            </button>
          )}
        </div>

        <p className="text-[11px] text-muted-foreground -mt-1">
          Try the field below — it&apos;s wired up like the real {entityLabel} form.
        </p>

        {/* Mock form card — frames the rendered DynamicField the way it'll
            sit inside a real form card. */}
        <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
          <div className="px-4 py-2 border-b border-border/60 bg-muted/30 flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
              {entityLabel} form
            </span>
            {form.is_required && (
              <span className="text-[9px] text-red-500/90 font-medium">REQUIRED</span>
            )}
          </div>
          <div className="px-4 py-4">
            {hasContent ? (
              <DynamicField
                definition={form}
                value={previewValue}
                onChange={(v) => setPreviewValue(v)}
              />
            ) : (
              <div className="text-center py-6 text-[11px] text-muted-foreground italic">
                Start typing a label to see the preview…
              </div>
            )}
          </div>
        </div>

        {/* Metadata strip — small print that confirms how the value lands
            in storage. Helps schema editors verify they got the right
            field_key before saving. */}
        {hasContent && (
          <div className="rounded-lg border border-border/40 bg-background/40 p-3 space-y-1.5 text-[11px]">
            <MetaRow label="Type" value={(form.field_type || 'text').replace(/_/g, ' ')} mono={false} />
            <MetaRow label="Storage" value={`custom_fields.${form.field_key || '—'}`} mono />
            {form.is_filterable && <MetaRow label="Filter bar" value="Visible" />}
            {form.is_visible_in_list && <MetaRow label="List view" value="Column shown" />}
          </div>
        )}

        {isEdit && usage !== null && usage > 0 && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
            <p className="text-[11px] text-amber-700 dark:text-amber-300 flex items-start gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
              <span>
                <strong>{usage.toLocaleString('en-IN')}</strong> {entityLabel}
                {usage === 1 ? '' : 's'} hold a value for this field. Changes that
                touch options or type are flagged before save.
              </span>
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}

function MetaRow({ label, value, mono = false }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn('text-foreground/80 truncate', mono && 'font-mono text-[10px]')}>
        {value}
      </span>
    </div>
  );
}
