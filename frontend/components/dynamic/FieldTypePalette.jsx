'use client';

import { useRouter } from 'next/navigation';
import {
  Type, AlignLeft, Hash, IndianRupee, Percent, Calendar, Clock, ToggleLeft,
  ChevronDownSquare, ListChecks, Tag, Phone, Mail, Link as LinkIcon, Paperclip,
  Sparkles,
} from 'lucide-react';

// Zoho-style friendly names + glyphs. value = FieldDefinition field_type.
const TYPES = [
  { value: 'text',       label: 'Single Line', Icon: Type },
  { value: 'long_text',  label: 'Multi-Line',  Icon: AlignLeft },
  { value: 'dropdown',   label: 'Pick List',   Icon: ChevronDownSquare },
  { value: 'multiselect', label: 'Multi-Select', Icon: ListChecks },
  { value: 'tags',       label: 'Tags',        Icon: Tag },
  { value: 'number',     label: 'Number',      Icon: Hash },
  { value: 'currency',   label: 'Currency',    Icon: IndianRupee },
  { value: 'percent',    label: 'Percent',     Icon: Percent },
  { value: 'date',       label: 'Date',        Icon: Calendar },
  { value: 'datetime',   label: 'Date/Time',   Icon: Clock },
  { value: 'boolean',    label: 'Checkbox',    Icon: ToggleLeft },
  { value: 'phone',      label: 'Phone',       Icon: Phone },
  { value: 'email',      label: 'Email',       Icon: Mail },
  { value: 'url',        label: 'URL',         Icon: LinkIcon },
  { value: 'file_link',  label: 'File',        Icon: Paperclip },
];

/**
 * Field-type palette — the "auto field creation with options" affordance.
 * Each card deep-links into the field editor pre-seeded with that type (choice
 * types auto-seed two option rows), so building a module's schema is a click
 * per field.
 */
export function FieldTypePalette({ entityKey }) {
  const router = useRouter();
  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="flex items-center gap-1.5 mb-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5" /> Add a field
      </div>
      <div className="flex flex-wrap gap-1.5">
        {TYPES.map(({ value, label, Icon }) => (
          <button
            key={value}
            type="button"
            onClick={() => router.push(`/settings/fields/new?entity=${entityKey}&type=${value}`)}
            className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border bg-background text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30 hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          >
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default FieldTypePalette;
