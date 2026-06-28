'use client';

import { useMemo } from 'react';
import { Languages, Radio, Megaphone, Calendar, CandlestickChart, IndianRupee } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { useAuth } from '@/hooks/useAuth';
import FilterRail from '@/components/shared/FilterRail';

// Option normalization + role rules (ported from the old vertical FilterDrawer).
function normalizeOptions(rows, fallback) {
  if (Array.isArray(rows) && rows.length > 0) {
    return rows
      .filter((r) => r && (r.key || r.value))
      .map((r) => ({ value: r.value ?? r.key, label: r.label || r.key || r.value }));
  }
  return fallback;
}

const LANGUAGE_FALLBACK = ['English', 'Hindi', 'Tamil', 'Telugu', 'Kannada', 'Marathi', 'Gujarati']
  .map((v) => ({ value: v.toLowerCase(), label: v }));

const SOURCE_FALLBACK = [
  { value: 'facebook_ads', label: 'Facebook Ads' },
  { value: 'instagram_ads', label: 'Instagram Ads' },
  { value: 'google_ads', label: 'Google Ads' },
  { value: 'website', label: 'Website' },
  { value: 'referral', label: 'Referral' },
  { value: 'manual', label: 'Manual' },
  { value: 'direct_ark', label: 'Direct ARK Signup' },
];

const SOURCE_RULES = {
  tele_sales: { exclude: ['direct_ark'], only: null },
  senior: { exclude: [], only: ['direct_ark'] },
};

/**
 * Native lead filters as a horizontal chip rail. Builds a FilterRail spec with
 * the lead-specific, role-aware option lists. Visual behaviour lives in the
 * shared FilterRail so every list page stays consistent.
 */
export default function LeadFilterBar({ filters, onChange, campaigns = [] }) {
  const config = useStore((s) => s.config);
  const { user, role } = useAuth();

  const allLanguages = useMemo(() => normalizeOptions(config?.language, LANGUAGE_FALLBACK), [config]);
  const allSources = useMemo(() => normalizeOptions(config?.lead_source, SOURCE_FALLBACK), [config]);
  const userLangs = useMemo(
    () => (Array.isArray(user?.languages) ? user.languages.map((l) => (l || '').toLowerCase()) : []),
    [user?.languages],
  );

  const sources = useMemo(() => {
    const rule = SOURCE_RULES[role] || { exclude: [], only: null };
    let list = allSources;
    if (rule.only) list = list.filter((s) => rule.only.includes(s.value));
    if (rule.exclude.length) list = list.filter((s) => !rule.exclude.includes(s.value));
    return list;
  }, [allSources, role]);

  const languages = useMemo(() => {
    if (!['tele_sales', 'senior'].includes(role) || userLangs.length === 0) return allLanguages;
    const allowed = new Set(userLangs);
    const filtered = allLanguages.filter((l) => allowed.has(l.value.toLowerCase()));
    return filtered.length ? filtered : allLanguages;
  }, [allLanguages, role, userLangs]);

  const visibleCampaigns = useMemo(() => {
    if (!['tele_sales', 'senior'].includes(role) || userLangs.length === 0) return campaigns;
    const allowed = new Set(userLangs);
    return campaigns.filter((c) => !c.language || allowed.has(c.language.toLowerCase()));
  }, [campaigns, role, userLangs]);

  const spec = useMemo(() => [
    languages.length > 1 && { key: 'language', label: 'Language', kind: 'multi', glyph: Languages, tint: 'bg-violet-500/40', options: languages },
    sources.length > 1 && { key: 'source', label: 'Source', kind: 'multi', glyph: Radio, tint: 'bg-indigo-500/40', options: sources },
    {
      key: 'campaign', label: 'Campaign', kind: 'single', glyph: Megaphone, tint: 'bg-blue-500/40',
      options: visibleCampaigns.map((c) => ({ value: c.id, label: c.name })),
      width: 'w-[280px]', allLabel: 'All campaigns', capitalize: false,
    },
    { key: 'created', fromKey: 'date_from', toKey: 'date_to', label: 'Created', kind: 'daterange', glyph: Calendar, tint: 'bg-amber-500/40' },
    { key: 'has_ark', label: 'Has ARK', kind: 'bool', glyph: CandlestickChart, activeClass: 'border-teal-500/40 bg-teal-500/10 text-teal-700 dark:text-teal-300' },
    { key: 'has_ftd', label: 'Has FTD', kind: 'bool', glyph: IndianRupee, activeClass: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  ].filter(Boolean), [languages, sources, visibleCampaigns]);

  return <FilterRail spec={spec} filters={filters} onChange={onChange} />;
}
