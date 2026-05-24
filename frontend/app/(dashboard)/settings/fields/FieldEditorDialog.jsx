'use client';
import { useState, useEffect } from 'react';
import { Plus, X, Eye, ListOrdered, AlertCircle, Check } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DynamicField } from '@/components/dynamic/DynamicField';
import { Card, CardContent } from '@/components/ui/card';
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

  useEffect(() => {
    if (!open) return;
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

  const autoKey = () => {
    const k = (form.label || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 50);
    setF('field_key', k);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit field' : 'New custom field'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? `Editing ${form.label}. ${usage !== null ? `Used in ${usage} records.` : ''} Type and key cannot be changed.`
              : `Creating a new field on ${entityType}. Appears immediately on forms.`}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Label</Label>
              <Input
                value={form.label || ''}
                onChange={e => {
                  setF('label', e.target.value);
                  if (!isEdit && !form.field_key) setTimeout(autoKey, 0);
                }}
                className="h-9 text-sm"
                placeholder="Risk Tolerance"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">
                Field key{' '}
                {!isEdit && (
                  <span className="text-[10px] text-muted-foreground ml-1">
                    (snake_case, can&apos;t change later)
                  </span>
                )}
              </Label>
              <Input
                value={form.field_key || ''}
                disabled={isEdit}
                onChange={e =>
                  setF('field_key', e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))
                }
                className="h-9 text-sm font-mono"
                placeholder="risk_tolerance"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">
                Type{' '}
                {isEdit && (
                  <span className="text-[10px] text-muted-foreground ml-1">
                    (can&apos;t change later)
                  </span>
                )}
              </Label>
              <Select
                value={form.field_type}
                onValueChange={(v) => setFieldType(v)}
                disabled={isEdit}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map(t => (
                    <SelectItem key={t} value={t}>{t.replace(/_/g, ' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Section (groups fields visually)</Label>
              <Input
                value={form.section || ''}
                onChange={e => setF('section', e.target.value)}
                className="h-9 text-sm"
                placeholder="Custom"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Helper text</Label>
              <Input
                value={form.helper_text || ''}
                onChange={e => setF('helper_text', e.target.value)}
                className="h-9 text-sm"
              />
            </div>

            {/* Default value — type-aware. Determines what a newly-created
                record starts with. Especially important for boolean fields
                where unset and false are otherwise indistinguishable. */}
            <DefaultValueEditor form={form} setF={setF} />

            <div className="space-y-2 pt-2 border-t">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Required</Label>
                <Switch
                  checked={!!form.is_required}
                  onCheckedChange={v => setF('is_required', v)}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-xs">Filterable (shows in filter bar)</Label>
                <Switch
                  checked={!!form.is_filterable}
                  onCheckedChange={v => setF('is_filterable', v)}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-xs">Show as table column</Label>
                <Switch
                  checked={!!form.is_visible_in_list}
                  onCheckedChange={v => setF('is_visible_in_list', v)}
                />
              </div>
            </div>

            {showOptions && (() => {
              const opts = form.options || [];
              const filledCount = opts.filter((o) => (o.label || '').trim()).length;
              const needsAttention = filledCount === 0;
              return (
                <div
                  className={cn(
                    'mt-3 rounded-lg border p-3 space-y-2',
                    needsAttention
                      ? 'border-amber-500/40 bg-amber-500/5'
                      : 'border-purple-500/30 bg-purple-500/5',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <ListOrdered className="h-3.5 w-3.5 text-purple-600 dark:text-purple-300" />
                      <Label className="text-xs font-medium">
                        Options for this {form.field_type === 'dropdown' ? 'dropdown' : 'multi-select'}
                      </Label>
                      <span className="text-[10px] text-muted-foreground">
                        ({filledCount} filled · {opts.length} total)
                      </span>
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
                        Add at least one option so users see something to pick.
                        Type the label and press <kbd className="px-1 bg-muted rounded">Enter</kbd> to add another.
                      </span>
                    </div>
                  )}

                  {opts.length === 0 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full h-9 border border-dashed text-xs"
                      onClick={addOption}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1.5" /> Add your first option
                    </Button>
                  ) : (
                    <div className="space-y-1.5">
                      {opts.map((o, i) => (
                        <div key={i} className="space-y-0.5">
                          <div className="flex gap-1.5 items-center">
                            <span className="text-[10px] text-muted-foreground w-4 text-right tabular-nums">
                              {i + 1}.
                            </span>
                            <Input
                              placeholder={`Option label (e.g. ${
                                ['Low', 'Medium', 'High', 'Urgent'][i % 4]
                              })`}
                              value={o.label || ''}
                              onChange={(e) => updateOption(i, 'label', e.target.value)}
                              onKeyDown={(e) => onOptionKeyDown(e, i)}
                              className="h-8 text-xs flex-1"
                              autoFocus={i === 0 && !o.label}
                            />
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-muted-foreground hover:text-red-500"
                              onClick={() => removeOption(i)}
                              title="Remove option"
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                          <div className="pl-7 flex items-center gap-1.5">
                            <span className="text-[9px] text-muted-foreground">value:</span>
                            <Input
                              value={o.value || ''}
                              onChange={(e) => updateOption(i, 'value', e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                              className="h-5 text-[10px] font-mono px-1.5 py-0 max-w-[12rem] border-dashed"
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
            })()}

            <div className="space-y-1.5 pt-2 border-t">
              <Label className="text-xs">Visible to roles</Label>
              <div className="flex flex-wrap gap-1">
                {ROLES.map(r => {
                  const sel = (form.visible_to_roles || []).includes(r);
                  return (
                    <button
                      key={r}
                      type="button"
                      onClick={() =>
                        setF(
                          'visible_to_roles',
                          sel
                            ? form.visible_to_roles.filter(x => x !== r)
                            : [...(form.visible_to_roles || []), r]
                        )
                      }
                      className={`px-2 py-0.5 text-[10px] rounded border ${
                        sel
                          ? 'bg-purple-500/15 border-purple-500/50 text-purple-300'
                          : 'bg-transparent border-border text-muted-foreground'
                      }`}
                    >
                      {r.replace(/_/g, ' ')}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Editable by roles</Label>
              <div className="flex flex-wrap gap-1">
                {ROLES.map(r => {
                  const sel = (form.editable_by_roles || []).includes(r);
                  return (
                    <button
                      key={r}
                      type="button"
                      onClick={() =>
                        setF(
                          'editable_by_roles',
                          sel
                            ? form.editable_by_roles.filter(x => x !== r)
                            : [...(form.editable_by_roles || []), r]
                        )
                      }
                      className={`px-2 py-0.5 text-[10px] rounded border ${
                        sel
                          ? 'bg-amber-500/15 border-amber-500/50 text-amber-300'
                          : 'bg-transparent border-border text-muted-foreground'
                      }`}
                    >
                      {r.replace(/_/g, ' ')}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div>
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Eye className="h-3 w-3" /> Live preview
                </div>
                <DynamicField
                  definition={form}
                  value={form.default_value}
                  onChange={() => {}}
                />
                {isEdit && usage !== null && usage > 0 && (
                  <p className="text-[10px] text-amber-400 border-t pt-2">
                    ⚠ Used in {usage} records. Be careful changing options.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving...' : isEdit ? 'Save changes' : 'Create field'}
          </Button>
        </DialogFooter>

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
  const Wrap = ({ children }) => (
    <div className="space-y-1.5 pt-2 border-t">
      <div className="flex items-center justify-between">
        <Label className="text-xs">Default value (optional)</Label>
        {value !== null && value !== undefined && value !== '' && (
          <button
            type="button"
            onClick={clear}
            className="text-[10px] text-muted-foreground hover:text-red-500"
          >
            Clear
          </button>
        )}
      </div>
      {children}
      <p className="text-[10px] text-muted-foreground">
        Pre-fills this field when a new record is created.
      </p>
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
