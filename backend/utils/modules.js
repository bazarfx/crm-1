/**
 * Module registry helpers — mirror of utils/roles.js.
 *
 * The 6 built-in modules map to their own dedicated tables (leads, users, …).
 * Custom modules created at runtime store rows in the shared `module_records`
 * table. `key` is the slug shared with FieldDefinition.entity_type, so the
 * dynamic-field stack treats every module uniformly.
 */

// Keys MUST match FieldDefinition.VALID_ENTITIES so existing field definitions
// keep resolving to a registered module.
const SYSTEM_MODULE_DEFS = [
  { key: 'lead',          label_singular: 'Lead',     label_plural: 'Leads',      icon: 'Users',     color: '#4F8EF7', description: 'Prospects worked by telesellers.' },
  { key: 'user',          label_singular: 'User',     label_plural: 'Users',      icon: 'UserCog',   color: '#8B5CF6', description: 'CRM staff accounts.' },
  { key: 'deal',          label_singular: 'Deal',     label_plural: 'Deals',      icon: 'Award',     color: '#10B981', description: 'FTD-closed leads.' },
  { key: 'campaign',      label_singular: 'Campaign', label_plural: 'Campaigns',  icon: 'Megaphone', color: '#F59E0B', description: 'Meta Ads campaigns.' },
  { key: 'group',         label_singular: 'Group',    label_plural: 'Groups',     icon: 'Building2', color: '#14B8A6', description: 'Round-robin teams.' },
  { key: 'lead_activity', label_singular: 'Activity', label_plural: 'Activities', icon: 'Activity',  color: '#6366F1', description: 'Calls, notes and ARK events.' },
];

const FALLBACK_KEYS = SYSTEM_MODULE_DEFS.map((m) => m.key);
const SYSTEM_KEYS = new Set(FALLBACK_KEYS);

const SYSTEM_MODULE_META = Object.fromEntries(
  SYSTEM_MODULE_DEFS.map((m) => [m.key, m]),
);

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

/** Idempotent boot seed — create only missing system modules, never touch
 *  existing rows (so admin reorder/rename survives a restart). */
async function ensureSystemModules(models) {
  const { Module } = models;
  const existing = await Module.findAll({ paranoid: false });
  const have = new Set(existing.map((m) => m.key));
  let order = 0;
  for (const def of SYSTEM_MODULE_DEFS) {
    order += 10;
    if (have.has(def.key)) continue;
    await Module.create({
      key: def.key,
      label_singular: def.label_singular,
      label_plural: def.label_plural,
      icon: def.icon,
      color: def.color,
      description: def.description,
      is_system: true,
      is_active: true,
      display_order: order,
    });
  }
}

// ── 30s cache of valid module keys (built-ins + custom) ───────────────────
let _cache = null;
let _at = 0;
const TTL = 30 * 1000;

async function listModuleKeys(models) {
  if (_cache && Date.now() - _at < TTL) return _cache;
  try {
    const rows = await models.Module.findAll({ attributes: ['key'], paranoid: false });
    const keys = rows.map((r) => r.key);
    _cache = keys.length ? keys : FALLBACK_KEYS;
  } catch {
    _cache = FALLBACK_KEYS;
  }
  _at = Date.now();
  return _cache;
}

function invalidateModuleCache() { _cache = null; _at = 0; }

function isBuiltInKey(key) { return SYSTEM_KEYS.has(key); }

module.exports = {
  SYSTEM_MODULE_DEFS,
  SYSTEM_MODULE_META,
  FALLBACK_KEYS,
  slugify,
  ensureSystemModules,
  listModuleKeys,
  invalidateModuleCache,
  isBuiltInKey,
};
