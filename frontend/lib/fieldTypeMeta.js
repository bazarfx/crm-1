'use client';

import {
  Type, AlignLeft, ChevronDownSquare, ListChecks, Tag, Hash, IndianRupee,
  Percent, Calendar, Clock, ToggleLeft, Phone, Mail, Link as LinkIcon, Paperclip,
} from 'lucide-react';

// Single source of truth for field-type glyphs + friendly labels, shared by the
// field-type palette and the filter property menu / chips so they never drift.
const ICON_BY_TYPE = {
  text: Type, long_text: AlignLeft, dropdown: ChevronDownSquare, multiselect: ListChecks,
  tags: Tag, number: Hash, currency: IndianRupee, percent: Percent, date: Calendar,
  datetime: Clock, boolean: ToggleLeft, phone: Phone, email: Mail, url: LinkIcon, file_link: Paperclip,
};

const LABEL_BY_TYPE = {
  text: 'Text', long_text: 'Text', dropdown: 'Pick list', multiselect: 'Multi-select',
  tags: 'Tags', number: 'Number', currency: 'Currency', percent: 'Percent', date: 'Date',
  datetime: 'Date/time', boolean: 'Checkbox', phone: 'Phone', email: 'Email', url: 'URL',
  file_link: 'File',
};

const typeOf = (d) => (typeof d === 'string' ? d : d?.field_type);

export function glyphFor(defOrType) {
  return ICON_BY_TYPE[typeOf(defOrType)] || Type;
}

export function typeLabel(defOrType) {
  return LABEL_BY_TYPE[typeOf(defOrType)] || 'Field';
}
