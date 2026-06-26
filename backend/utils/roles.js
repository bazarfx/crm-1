/**
 * Dynamic role registry helpers.
 *
 * Roles live in the `roles` table (models/Role). System roles are seeded once
 * (idempotently) on boot so the existing permission machinery — which keys off
 * the role *string* — keeps working, while admins can add custom roles on top.
 */

const { Op } = require('sequelize');

// Built-in roles + their default tree. `parent` is a key (resolved after the
// first pass). Order top-down so display_order reads naturally.
const SYSTEM_ROLE_DEFS = [
  { key: 'super_admin',   name: 'Super Admin',   color: '#EF4444', parent: null,            description: 'Full, unrestricted access. Sits at the top of the hierarchy.' },
  { key: 'admin',         name: 'Admin',         color: '#8B5CF6', parent: 'super_admin',   description: 'Full management access across the CRM.' },
  { key: 'floor_manager', name: 'Floor Manager', color: '#F59E0B', parent: 'admin',         description: 'Runs the telesales floor — leads, groups, campaigns.' },
  { key: 'schema_editor', name: 'Schema Editor', color: '#6366F1', parent: 'admin',         description: 'Manages custom field schemas.' },
  { key: 'back_office',   name: 'Back Office',   color: '#64748B', parent: 'admin',         description: 'Read-only access for operations + reporting.' },
  { key: 'auditor',       name: 'Auditor',       color: '#14B8A6', parent: 'admin',         description: 'Read-only audit access.' },
  { key: 'senior',        name: 'Senior',        color: '#3B82F6', parent: 'floor_manager', description: 'Handles direct-ARK leads in their language.' },
  { key: 'tele_sales',    name: 'Teleseller',    color: '#10B981', parent: 'floor_manager', description: 'Works campaign leads in their language. Round-robin assigned.' },
  { key: 'archive',       name: 'Archive',       color: '#6B7280', parent: 'floor_manager', description: 'Read-only access to archived leads.' },
  // Sentinel for users whose permissions are hand-picked per-user. Assignable
  // but not a hierarchy node.
  { key: 'custom',        name: 'Custom',        color: '#F97316', parent: 'admin',         description: 'Per-user hand-picked permissions.', show_in_tree: false },
];

const FALLBACK_KEYS = SYSTEM_ROLE_DEFS.map((r) => r.key);

/** label/colour lookup for system roles (used as a fallback in the frontend). */
const SYSTEM_ROLE_META = Object.fromEntries(
  SYSTEM_ROLE_DEFS.map((r) => [r.key, { name: r.name, color: r.color }])
);

/** key → URL-safe slug. */
function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

/**
 * Seed the system roles + their default hierarchy. Idempotent: existing rows
 * are left untouched (so an admin's re-parenting / rename survives a restart),
 * only missing system roles are created. Two passes so parents resolve.
 */
async function ensureSystemRoles(models) {
  const { Role } = models;
  const existing = await Role.findAll({ paranoid: false });
  const byKey = new Map(existing.map((r) => [r.key, r]));
  const created = new Set();

  // Pass 1 — create any missing system role (no parent yet).
  let order = 0;
  for (const def of SYSTEM_ROLE_DEFS) {
    order += 10;
    if (byKey.has(def.key)) continue;
    const row = await Role.create({
      key: def.key,
      name: def.name,
      description: def.description,
      color: def.color,
      is_system: true,
      is_assignable: true,
      show_in_tree: def.show_in_tree !== false,
      display_order: order,
    });
    byKey.set(def.key, row);
    created.add(def.key);
  }

  // Pass 2 — wire parents for THIS RUN's freshly-created roles only, so an
  // admin's manual re-parenting of an existing role is never clobbered.
  for (const def of SYSTEM_ROLE_DEFS) {
    if (!def.parent || !created.has(def.key)) continue;
    const row = byKey.get(def.key);
    const parent = byKey.get(def.parent);
    if (row && parent) await row.update({ parent_role_id: parent.id });
  }

  return byKey;
}

/**
 * All role keys currently defined. Reads the table; falls back to the built-in
 * list if the table is empty/unavailable (e.g. before first seed).
 */
async function listRoleKeys(models) {
  try {
    const { Role } = models;
    const rows = await Role.findAll({ attributes: ['key'], order: [['display_order', 'ASC']] });
    const keys = rows.map((r) => r.key);
    return keys.length ? keys : FALLBACK_KEYS;
  } catch {
    return FALLBACK_KEYS;
  }
}

/** Keys of `roleKey` and every role beneath it in the tree (for future scoping). */
async function getDescendantKeys(models, roleKey) {
  const { Role } = models;
  const all = await Role.findAll({ attributes: ['id', 'key', 'parent_role_id'] });
  const byId = new Map(all.map((r) => [r.id, r]));
  const start = all.find((r) => r.key === roleKey);
  if (!start) return [roleKey];
  const childrenOf = new Map();
  for (const r of all) {
    if (!childrenOf.has(r.parent_role_id)) childrenOf.set(r.parent_role_id, []);
    childrenOf.get(r.parent_role_id).push(r);
  }
  const out = [];
  const walk = (node) => {
    out.push(node.key);
    for (const child of childrenOf.get(node.id) || []) walk(child);
  };
  walk(start);
  return out;
}

module.exports = {
  SYSTEM_ROLE_DEFS,
  SYSTEM_ROLE_META,
  FALLBACK_KEYS,
  slugify,
  ensureSystemRoles,
  listRoleKeys,
  getDescendantKeys,
  Op,
};
