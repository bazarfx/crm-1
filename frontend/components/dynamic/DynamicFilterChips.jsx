'use client';

// Active filters now render as inline editable chips inside FilterBar (the new
// DynamicFilterBar). This standalone strip is therefore a no-op — kept so the
// pages that still render it don't break. Safe to delete once those call sites
// drop the import.
export function DynamicFilterChips() {
  return null;
}

export default DynamicFilterChips;
