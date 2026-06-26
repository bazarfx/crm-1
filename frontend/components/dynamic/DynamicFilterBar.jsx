'use client';

// The custom-field filter UX is now the inline Linear/Airtable-style FilterBar
// (chips + "+ Filter" property menu). Kept under the old name + path so every
// consumer page stays a drop-in (same props: entityType, filters, onChange).
export { FilterBar as DynamicFilterBar } from './FilterBar';
export { default } from './FilterBar';
