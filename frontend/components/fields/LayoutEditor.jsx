'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  GripVertical, Plus, Check, X, Pencil, Trash2, Save, RotateCcw, Eye,
  Loader2, Sparkles, LayoutGrid, Type, AlignLeft, Hash, IndianRupee, Percent,
  Calendar, Clock, ToggleLeft, ChevronDownSquare, ListChecks, Tag, Phone,
  Mail, Link as LinkIcon, Paperclip,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import api from '@/lib/api';
import { saveFieldLayout } from '@/lib/dynamic';
import { DynamicField } from '@/components/dynamic/DynamicField';
import { FieldTypePalette } from '@/components/dynamic/FieldTypePalette';
import { cn } from '@/lib/utils';

const RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1';

// Fallback section for fields with no/blank `section`. Fields land here so a
// freshly-created field is always visible on the canvas.
const DEFAULT_SECTION = 'General';

// Small type → glyph map so each chip carries its type at a glance. Mirrors
// the names used by FieldTypePalette.
const TYPE_ICON = {
  text: Type, long_text: AlignLeft, number: Hash, currency: IndianRupee,
  percent: Percent, date: Calendar, datetime: Clock, boolean: ToggleLeft,
  dropdown: ChevronDownSquare, multiselect: ListChecks, tags: Tag,
  phone: Phone, email: Mail, url: LinkIcon, file_link: Paperclip,
};

/**
 * Zoho-style visual field-layout editor for one entity_type.
 *
 * Fetches the entity's (non-archived) fields, groups them into SECTIONS
 * (derived from each field's `section` column, default "General"), ordered by
 * `display_order`. Sections render as blocks; every field is a native-HTML5
 * draggable chip. Supports:
 *   - reorder a field within its section (drag between chips),
 *   - re-section a field (drag onto another section),
 *   - add / rename / remove a section (removing re-homes its fields to the
 *     first section),
 *   - add a new field per section via the type palette (deep-links to the
 *     field editor pre-seeded with entity + type + section),
 *   - dirty-tracked "Save layout" → PATCH /field-definitions/layout.
 *
 * State model: a single ordered `sections` array of
 *   { name, fields: [fieldDef, …] }
 * is the source of truth for the canvas. On save we flatten it to
 * { id, section, display_order } items, spacing display_order by 10 in
 * canvas order (section order × field order).
 */
export default function LayoutEditor({ entityType, entityLabel }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Ordered list of { name, fields }. The ONLY source of truth for the canvas.
  const [sections, setSections] = useState([]);
  // Snapshot of the loaded layout signature so we can dirty-track.
  const [baseline, setBaseline] = useState('');
  const [showPreview, setShowPreview] = useState(true);

  // Drag state — a field chip is the drag subject. We track the dragged
  // field's id + origin section, and the current drop target (section + index).
  const dragRef = useRef(null); // { fieldId, fromSection }
  const [overSection, setOverSection] = useState(null);

  // Inline section add / rename state.
  const [addingSection, setAddingSection] = useState(false);
  const [newSectionName, setNewSectionName] = useState('');
  const [renamingSection, setRenamingSection] = useState(null); // section name
  const [renameVal, setRenameVal] = useState('');

  // Build the canvas model from a flat list of field defs.
  const buildSections = (defs) => {
    const ordered = [...defs].sort(
      (a, b) => (a.display_order ?? 100) - (b.display_order ?? 100),
    );
    // Preserve first-seen section order (which, because we sorted by
    // display_order, mirrors how the fields currently flow).
    const map = new Map();
    for (const d of ordered) {
      const key = (d.section && String(d.section).trim()) || DEFAULT_SECTION;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(d);
    }
    if (map.size === 0) map.set(DEFAULT_SECTION, []);
    return Array.from(map, ([name, fields]) => ({ name, fields }));
  };

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/field-definitions?entity_type=${entityType}`);
      const defs = (data.data.items || []).filter((d) => !d.is_archived);
      const built = buildSections(defs);
      setSections(built);
      setBaseline(signature(built));
    } catch (e) {
      toast.error('Failed to load fields');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [entityType]);

  const dirty = useMemo(() => signature(sections) !== baseline, [sections, baseline]);

  // ---- Drag & drop (native HTML5, mirroring settings/roles) ----------------

  const onFieldDragStart = (e, fieldId, fromSection) => {
    dragRef.current = { fieldId, fromSection };
    e.dataTransfer.effectAllowed = 'move';
    // Firefox requires data to be set for the drag to start.
    try { e.dataTransfer.setData('text/plain', fieldId); } catch (_) { /* noop */ }
  };

  const onFieldDragEnd = () => {
    dragRef.current = null;
    setOverSection(null);
  };

  // Move the dragged field to `targetSection` at `targetIndex`. Single mutation
  // of the sections model; recomputed on every dragOver of a valid target.
  const moveField = (targetSection, targetIndex) => {
    const drag = dragRef.current;
    if (!drag) return;
    setSections((prev) => {
      // Deep-ish clone: new arrays, same field objects (fine — we don't mutate defs).
      let next = prev.map((s) => ({ name: s.name, fields: [...s.fields] }));
      // Pull the field out of wherever it currently is.
      let moved = null;
      for (const s of next) {
        const i = s.fields.findIndex((f) => f.id === drag.fieldId);
        if (i !== -1) { moved = s.fields.splice(i, 1)[0]; break; }
      }
      if (!moved) return prev;
      const dest = next.find((s) => s.name === targetSection);
      if (!dest) return prev;
      const idx = Math.max(0, Math.min(targetIndex, dest.fields.length));
      dest.fields.splice(idx, 0, moved);
      return next;
    });
  };

  // Drop onto a chip → insert before/after it depending on pointer position.
  const onChipDragOver = (e, sectionName, index) => {
    if (!dragRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    setOverSection(sectionName);
    const rect = e.currentTarget.getBoundingClientRect();
    const after = e.clientY - rect.top > rect.height / 2;
    moveField(sectionName, after ? index + 1 : index);
  };

  // Drop onto empty space in a section → append.
  const onSectionDragOver = (e, sectionName) => {
    if (!dragRef.current) return;
    e.preventDefault();
    setOverSection(sectionName);
  };
  const onSectionDrop = (e, sectionName) => {
    if (!dragRef.current) return;
    e.preventDefault();
    // If the pointer isn't over a specific chip, land it at the end.
    const dest = sections.find((s) => s.name === sectionName);
    if (dest && !dest.fields.some((f) => f.id === dragRef.current.fieldId)) {
      moveField(sectionName, dest.fields.length);
    }
    dragRef.current = null;
    setOverSection(null);
  };

  // ---- Section CRUD --------------------------------------------------------

  const addSection = () => {
    const name = newSectionName.trim();
    if (!name) { setAddingSection(false); setNewSectionName(''); return; }
    if (sections.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
      toast.error('A section with that name already exists');
      return;
    }
    setSections((prev) => [...prev, { name, fields: [] }]);
    setAddingSection(false);
    setNewSectionName('');
  };

  const commitRename = (oldName) => {
    const name = renameVal.trim();
    if (!name || name === oldName) { setRenamingSection(null); return; }
    if (sections.some((s) => s.name.toLowerCase() === name.toLowerCase() && s.name !== oldName)) {
      toast.error('A section with that name already exists');
      return;
    }
    setSections((prev) => prev.map((s) => (s.name === oldName ? { ...s, name } : s)));
    setRenamingSection(null);
  };

  const removeSection = (name) => {
    if (sections.length <= 1) {
      toast.error('Keep at least one section');
      return;
    }
    const target = sections.find((s) => s.name === name);
    if (target && target.fields.length > 0) {
      if (!confirm(
        `Remove section "${name}"? Its ${target.fields.length} field${target.fields.length === 1 ? '' : 's'} will move to the first section.`,
      )) return;
    }
    setSections((prev) => {
      const idx = prev.findIndex((s) => s.name === name);
      if (idx === -1) return prev;
      const orphans = prev[idx].fields;
      const next = prev.filter((s) => s.name !== name);
      // Re-home orphans into the (new) first section.
      if (orphans.length && next.length) {
        next[0] = { ...next[0], fields: [...next[0].fields, ...orphans] };
      }
      return next;
    });
  };

  // ---- Save ----------------------------------------------------------------

  const items = useMemo(() => flattenToItems(sections), [sections]);

  const save = async () => {
    setSaving(true);
    try {
      const updated = await saveFieldLayout({
        entity_type: entityType,
        sections: sections.map((s) => s.name),
        items,
      });
      // Rebuild from the server's canonical response so we're perfectly synced.
      const defs = (updated || []).filter((d) => !d.is_archived);
      const built = buildSections(defs);
      setSections(built);
      setBaseline(signature(built));
      toast.success('Layout saved');
    } catch (e) {
      toast.error(e.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const totalFields = sections.reduce((a, s) => a + s.fields.length, 0);

  if (loading) {
    return (
      <div className="py-24 flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <LayoutGrid className="h-3.5 w-3.5" />
          <span>
            {totalFields} field{totalFields === 1 ? '' : 's'} across {sections.length} section
            {sections.length === 1 ? '' : 's'}. Drag chips to reorder or move between sections.
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowPreview((v) => !v)}
            className={RING}
          >
            <Eye className="h-3.5 w-3.5 mr-1.5" />
            {showPreview ? 'Hide preview' : 'Show preview'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={load}
            disabled={!dirty || saving}
            className={RING}
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />Discard
          </Button>
          <Button
            size="sm"
            onClick={save}
            disabled={!dirty || saving}
            className="bg-[#4F8EF7] hover:bg-[#3B7CE8] text-white"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
            {saving ? 'Saving…' : dirty ? 'Save layout' : 'Saved'}
          </Button>
        </div>
      </div>

      <div className={cn('grid gap-4', showPreview ? 'lg:grid-cols-[minmax(0,1fr)_360px]' : 'grid-cols-1')}>
        {/* Canvas */}
        <div className="space-y-3">
          {sections.map((section) => (
            <SectionBlock
              key={section.name}
              section={section}
              entityType={entityType}
              renaming={renamingSection === section.name}
              renameVal={renameVal}
              onRenameStart={() => { setRenameVal(section.name); setRenamingSection(section.name); }}
              onRenameChange={setRenameVal}
              onRenameCommit={() => commitRename(section.name)}
              onRenameCancel={() => setRenamingSection(null)}
              onRemove={() => removeSection(section.name)}
              onFieldDragStart={onFieldDragStart}
              onFieldDragEnd={onFieldDragEnd}
              onChipDragOver={onChipDragOver}
              onSectionDragOver={onSectionDragOver}
              onSectionDrop={onSectionDrop}
              isOver={overSection === section.name}
              dragging={dragRef.current?.fieldId}
              onEditField={(id) => router.push(`/settings/fields/${id}`)}
            />
          ))}

          {/* Add section */}
          {addingSection ? (
            <div className="flex items-center gap-1.5 rounded-xl border border-dashed border-primary/40 bg-primary/[0.03] p-3">
              <input
                autoFocus
                value={newSectionName}
                onChange={(e) => setNewSectionName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addSection();
                  if (e.key === 'Escape') { setAddingSection(false); setNewSectionName(''); }
                }}
                placeholder="New section name…"
                className={cn('h-8 px-2 text-sm rounded-md border border-primary/40 bg-background w-56 min-w-0', RING)}
              />
              <button type="button" onClick={addSection} aria-label="Add section"
                className={cn('h-7 w-7 inline-flex items-center justify-center rounded-md text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10', RING)}>
                <Check className="h-3.5 w-3.5" />
              </button>
              <button type="button" onClick={() => { setAddingSection(false); setNewSectionName(''); }} aria-label="Cancel"
                className={cn('h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted', RING)}>
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAddingSection(true)}
              className={cn(
                'w-full rounded-xl border border-dashed border-border text-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 hover:bg-muted/40 transition-colors py-3 inline-flex items-center justify-center gap-1.5',
                RING,
              )}
            >
              <Plus className="h-3.5 w-3.5" /> Add section
            </button>
          )}
        </div>

        {/* Preview */}
        {showPreview && (
          <FormPreview sections={sections} entityLabel={entityLabel} />
        )}
      </div>
    </div>
  );
}

// One section block on the canvas: header (name + rename/remove), the field
// chips (draggable), and a per-section "Add field" palette.
function SectionBlock({
  section, entityType, renaming, renameVal, onRenameStart, onRenameChange,
  onRenameCommit, onRenameCancel, onRemove, onFieldDragStart, onFieldDragEnd,
  onChipDragOver, onSectionDragOver, onSectionDrop, isOver, dragging, onEditField,
}) {
  const [showPalette, setShowPalette] = useState(false);
  return (
    <div
      className={cn(
        'rounded-xl border bg-card shadow-card transition-colors',
        isOver && dragging ? 'ring-2 ring-inset ring-primary/40 border-primary/40' : '',
      )}
      onDragOver={(e) => onSectionDragOver(e, section.name)}
      onDrop={(e) => onSectionDrop(e, section.name)}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b">
        {renaming ? (
          <input
            autoFocus
            value={renameVal}
            onChange={(e) => onRenameChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onRenameCommit(); if (e.key === 'Escape') onRenameCancel(); }}
            onBlur={onRenameCommit}
            className={cn('h-7 px-2 text-sm rounded-md border border-primary/40 bg-background w-48 min-w-0', RING)}
          />
        ) : (
          <button
            type="button"
            onDoubleClick={onRenameStart}
            className="text-sm font-semibold truncate text-left"
            title="Double-click to rename"
          >
            {section.name}
          </button>
        )}
        <Badge variant="secondary" className="h-4 px-1.5 text-[9px]">
          {section.fields.length}
        </Badge>
        <div className="ml-auto flex items-center gap-0.5">
          <button type="button" title="Rename section" aria-label="Rename section" onClick={onRenameStart}
            className={cn('h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted', RING)}>
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button type="button" title="Remove section" aria-label="Remove section" onClick={onRemove}
            className={cn('h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/10', RING)}>
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Chips */}
      <div className="p-3 space-y-1.5 min-h-[52px]">
        {section.fields.length === 0 && (
          <p className="text-[11px] text-muted-foreground italic py-2 text-center">
            Empty section — drag a field here, or add one below.
          </p>
        )}
        {section.fields.map((f, idx) => {
          const Icon = TYPE_ICON[f.field_type] || Type;
          return (
            <div
              key={f.id}
              draggable
              onDragStart={(e) => onFieldDragStart(e, f.id, section.name)}
              onDragEnd={onFieldDragEnd}
              onDragOver={(e) => onChipDragOver(e, section.name, idx)}
              className={cn(
                'group/chip flex items-center gap-2 rounded-lg border bg-background px-2.5 py-2 cursor-grab active:cursor-grabbing transition-colors hover:border-foreground/30',
                dragging === f.id && 'opacity-40',
              )}
            >
              <GripVertical className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground/40 group-hover/chip:text-muted-foreground" />
              <Icon className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
              <span className="text-sm font-medium truncate">{f.label}</span>
              <code className="text-[10px] text-muted-foreground font-mono truncate hidden sm:inline">{f.field_key}</code>
              {f.is_required && (
                <Badge variant="outline" className="text-[9px] h-4 px-1 text-red-500 border-red-500/30">Req</Badge>
              )}
              <Badge variant="outline" className="ml-auto text-[9px] h-4 px-1 text-muted-foreground">{f.field_type}</Badge>
              <button
                type="button"
                title="Edit field"
                aria-label="Edit field"
                onClick={() => onEditField(f.id)}
                className={cn('h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground opacity-0 group-hover/chip:opacity-100 hover:text-foreground hover:bg-muted transition', RING)}
              >
                <Pencil className="h-3 w-3" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Add field to this section */}
      <div className="px-3 pb-3">
        {showPalette ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-muted-foreground">
                Pick a type — the field editor opens seeded to <strong>{section.name}</strong>.
              </p>
              <button type="button" onClick={() => setShowPalette(false)}
                className={cn('text-[11px] text-muted-foreground hover:text-foreground', RING)}>
                Close
              </button>
            </div>
            <FieldTypePalette entityKey={entityType} section={section.name} />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowPalette(true)}
            className={cn(
              'w-full rounded-lg border border-dashed border-border text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30 hover:bg-muted/40 transition-colors py-2 inline-flex items-center justify-center gap-1.5',
              RING,
            )}
          >
            <Sparkles className="h-3.5 w-3.5" /> Add field to this section
          </button>
        )}
      </div>
    </div>
  );
}

// Read-only form preview — renders sections + fields exactly as a form would,
// in the same order as the canvas (which is the order DynamicForm uses:
// display_order ascending). Uses DynamicField with disabled so it's non-editable.
function FormPreview({ sections, entityLabel }) {
  return (
    <div className="rounded-xl border bg-card shadow-card p-4 lg:sticky lg:top-4 self-start">
      <div className="flex items-center gap-1.5 mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        <Eye className="h-3.5 w-3.5" /> Form preview
      </div>
      <div className="space-y-4">
        {sections.every((s) => s.fields.length === 0) && (
          <p className="text-xs text-muted-foreground italic">
            No fields yet — add some to see the {entityLabel || 'record'} form take shape.
          </p>
        )}
        {sections.map((section) => (
          section.fields.length === 0 ? null : (
            <div key={section.name} className="space-y-2.5">
              <p className="text-xs font-semibold text-foreground border-b pb-1.5">{section.name}</p>
              <div className="grid grid-cols-1 gap-3">
                {section.fields.map((f) => (
                  <DynamicField key={f.id} definition={f} value={f.default_value ?? null} onChange={() => {}} disabled />
                ))}
              </div>
            </div>
          )
        ))}
      </div>
    </div>
  );
}

// ---- Pure helpers ----------------------------------------------------------

// Flatten the sections model to the PATCH payload. display_order is spaced by
// 10 in canvas order (running counter across all sections) so the order is
// stable and mirrors how DynamicForm sorts (display_order ascending).
function flattenToItems(sections) {
  const items = [];
  let order = 10;
  for (const s of sections) {
    for (const f of s.fields) {
      items.push({ id: f.id, section: s.name, display_order: order });
      order += 10;
    }
  }
  return items;
}

// Dirty-tracking signature — section names + ordered field ids per section.
// Changes iff a field moves, a section is renamed/added/removed/reordered.
function signature(sections) {
  return sections.map((s) => `${s.name}:${s.fields.map((f) => f.id).join(',')}`).join('|');
}
