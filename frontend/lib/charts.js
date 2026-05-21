export const CHART_COLORS = [
  '#4F8EF7', // accent blue
  '#8B5CF6', // violet
  '#10B981', // emerald
  '#F59E0B', // amber
  '#EF4444', // red
  '#14B8A6', // teal
  '#F97316', // orange
  '#EC4899', // pink
];

export const STATUS_COLORS = {
  new: '#6366F1',
  contacted: '#3B82F6',
  interested: '#8B5CF6',
  not_interested: '#EF4444',
  'not-interested': '#EF4444',
  call_back: '#F59E0B',
  'call-back': '#F59E0B',
  account_opened: '#14B8A6',
  'account-opened': '#14B8A6',
  ftd_done: '#10B981',
  'ftd-done': '#10B981',
  cold: '#6B7280',
  dnd: '#DC2626',
  inactive: '#9CA3AF',
  reactive: '#F97316',
};

export const statusColor = (key) =>
  STATUS_COLORS[(key || '').toString().toLowerCase().replace(/\s+/g, '_')] || '#6366F1';

export const colorForIndex = (i) => CHART_COLORS[i % CHART_COLORS.length];

export const inrFormat = (n) => {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Number(n));
};

export const compactFormat = (n) => {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
  return new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(n));
};

export const tooltipStyle = {
  background: '#FFFFFF',
  borderRadius: 8,
  border: '1px solid #E2E8F0',
  boxShadow: '0 4px 12px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04)',
  fontSize: 12,
  fontFamily: "'DM Sans', system-ui, sans-serif",
  padding: '8px 12px',
};

export const axisStyle = { stroke: '#94A3B8', tick: { fill: '#94A3B8', fontSize: 11 } };
