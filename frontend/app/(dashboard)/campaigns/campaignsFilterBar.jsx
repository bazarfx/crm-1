'use client';

import { useMemo } from 'react';
import { Languages, CircleDot, Megaphone } from 'lucide-react';
import { useStore } from '@/store/useStore';
import FilterRail from '@/components/shared/FilterRail';

// Mirrors components/leads/LeadFilterBar — builds a FilterRail spec for the
// campaigns list so native + custom-field filters read as one chip rail.

function normalizeOptions(rows, fallback) {
  if (Array.isArray(rows) && rows.length > 0) {
    return rows
      .filter((r) => r && (r.key || r.value))
      .map((r) => ({ value: (r.value ?? r.key)?.toString().toLowerCase(), label: r.label || r.key || r.value }));
  }
  return fallback;
}

const LANGUAGE_FALLBACK = ['English', 'Hindi', 'Tamil', 'Telugu', 'Kannada', 'Marathi', 'Gujarati']
  .map((v) => ({ value: v.toLowerCase(), label: v }));

const PLATFORM_OPTIONS = [
  { value: 'facebook', label: 'Facebook' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'google', label: 'Google' },
  { value: 'other', label: 'Other' },
];

// Status maps to the backend `is_active` bool query param (string 'true'|'false').
const STATUS_OPTIONS = [
  { value: 'true', label: 'Active' },
  { value: 'false', label: 'Inactive' },
];

export default function CampaignsFilterBar({ filters, onChange }) {
  const config = useStore((s) => s.config);

  const languages = useMemo(
    () => normalizeOptions(config?.language, LANGUAGE_FALLBACK),
    [config],
  );

  const spec = useMemo(() => [
    {
      key: 'language', label: 'Language', kind: 'single', glyph: Languages,
      tint: 'bg-violet-500/40', options: languages, allLabel: 'All languages',
    },
    {
      key: 'is_active', label: 'Status', kind: 'single', glyph: CircleDot,
      tint: 'bg-emerald-500/40', options: STATUS_OPTIONS, allLabel: 'All statuses',
    },
    {
      key: 'platform', label: 'Platform', kind: 'single', glyph: Megaphone,
      tint: 'bg-blue-500/40', options: PLATFORM_OPTIONS, allLabel: 'All platforms',
    },
  ], [languages]);

  return <FilterRail spec={spec} filters={filters} onChange={onChange} />;
}
