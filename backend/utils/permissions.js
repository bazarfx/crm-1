// PERMISSION MATRIX — single source of truth for every role × feature.
// Values per role: 'all' | 'own' | 'group' | 'read' | false
//   'all'   → full access across the dataset
//   'group' → scoped to records owned by the user's group(s)
//   'own'   → scoped to records owned by the user
//   'read'  → read-only access (value of read scope is implicit per perm)
//   false   → denied

const PERMISSIONS = {
  // ── LEADS ─────────────────────────────────────────────────────
  'leads.view': {
    super_admin: 'all', admin: 'all', floor_manager: 'all',
    senior: 'group', tele_sales: 'own', back_office: 'read', auditor: 'read', archive: false,
  },
  'leads.create': {
    super_admin: 'all', admin: 'all', floor_manager: 'all',
    senior: false, tele_sales: false, back_office: false, auditor: false, archive: false,
  },
  'leads.edit': {
    super_admin: 'all', admin: 'all', floor_manager: 'all',
    senior: 'group', tele_sales: 'own', back_office: false, auditor: false, archive: false,
  },
  'leads.delete': {
    super_admin: 'all', admin: false, floor_manager: false,
    senior: false, tele_sales: false, back_office: false, auditor: false, archive: false,
  },
  'leads.reassign': {
    super_admin: 'all', admin: 'all', floor_manager: 'all',
    senior: 'group', tele_sales: false, back_office: false, auditor: false, archive: false,
  },
  'leads.export': {
    super_admin: 'all', admin: 'all', floor_manager: 'all',
    senior: 'group', tele_sales: false, back_office: false, auditor: 'read', archive: false,
  },
  'leads.add_activity': {
    super_admin: 'all', admin: 'all', floor_manager: 'all',
    senior: 'group', tele_sales: 'own', back_office: false, auditor: false, archive: false,
  },

  // ── USERS ─────────────────────────────────────────────────────
  'users.view': {
    super_admin: 'all', admin: 'all', floor_manager: 'all',
    senior: 'group', tele_sales: false, back_office: false, auditor: 'read', archive: false,
  },
  'users.create': {
    super_admin: 'all', admin: 'all', floor_manager: false,
    senior: false, tele_sales: false, back_office: false, auditor: false, archive: false,
  },
  'users.edit': {
    super_admin: 'all', admin: 'all', floor_manager: false,
    senior: false, tele_sales: false, back_office: false, auditor: false, archive: false,
  },
  'users.delete': {
    super_admin: 'all', admin: 'all', floor_manager: false,
    senior: false, tele_sales: false, back_office: false, auditor: false, archive: false,
  },

  // ── GROUPS ────────────────────────────────────────────────────
  'groups.view': {
    super_admin: 'all', admin: 'all', floor_manager: 'all',
    senior: 'group', tele_sales: 'group', back_office: false, auditor: 'read', archive: false,
  },
  'groups.create': {
    super_admin: 'all', admin: 'all', floor_manager: false,
    senior: false, tele_sales: false, back_office: false, auditor: false, archive: false,
  },
  'groups.edit': {
    super_admin: 'all', admin: 'all', floor_manager: false,
    senior: false, tele_sales: false, back_office: false, auditor: false, archive: false,
  },
  'groups.manage_members': {
    super_admin: 'all', admin: 'all', floor_manager: 'all',
    senior: false, tele_sales: false, back_office: false, auditor: false, archive: false,
  },

  // ── CAMPAIGNS ─────────────────────────────────────────────────
  'campaigns.view': {
    super_admin: 'all', admin: 'all', floor_manager: 'all',
    senior: 'group', tele_sales: false, back_office: false, auditor: 'read', archive: false,
  },
  'campaigns.create': {
    super_admin: 'all', admin: 'all', floor_manager: false,
    senior: false, tele_sales: false, back_office: false, auditor: false, archive: false,
  },
  'campaigns.edit': {
    super_admin: 'all', admin: 'all', floor_manager: false,
    senior: false, tele_sales: false, back_office: false, auditor: false, archive: false,
  },

  // ── REPORTS ───────────────────────────────────────────────────
  'reports.own_dashboard': {
    super_admin: 'all', admin: 'all', floor_manager: 'all',
    senior: 'all', tele_sales: 'own', back_office: 'read', auditor: 'read', archive: false,
  },
  'reports.team': {
    super_admin: 'all', admin: 'all', floor_manager: 'all',
    senior: 'group', tele_sales: 'group', back_office: 'read', auditor: 'read', archive: false,
  },
  'reports.full': {
    super_admin: 'all', admin: 'all', floor_manager: 'all',
    senior: false, tele_sales: false, back_office: 'read', auditor: 'read', archive: false,
  },

  // ── SETTINGS ──────────────────────────────────────────────────
  'settings.assignment_rules': {
    super_admin: 'all', admin: 'all', floor_manager: false,
    senior: false, tele_sales: false, back_office: false, auditor: false, archive: false,
  },
  'settings.system': {
    super_admin: 'all', admin: false, floor_manager: false,
    senior: false, tele_sales: false, back_office: false, auditor: false, archive: false,
  },
  'settings.config_values': {
    super_admin: 'all', admin: 'all', floor_manager: false,
    senior: false, tele_sales: false, back_office: false, auditor: false, archive: false,
  },

  // ── ADMIN / SYSTEM ────────────────────────────────────────────
  'adminjs.access': {
    super_admin: 'all', admin: false, floor_manager: false,
    senior: false, tele_sales: false, back_office: false, auditor: false, archive: false,
  },
  'audit_logs.view': {
    super_admin: 'all', admin: 'all', floor_manager: false,
    senior: false, tele_sales: false, back_office: false, auditor: 'read', archive: false,
  },
  'ark_logs.view': {
    super_admin: 'all', admin: 'all', floor_manager: false,
    senior: false, tele_sales: false, back_office: 'read', auditor: 'read', archive: false,
  },
};

// True if the user can perform the action; for 'own' scope, require ownerId === userId.
function can(userRole, permission, ownerId = null, userId = null) {
  const perm = PERMISSIONS[permission];
  if (!perm) return false;
  const level = perm[userRole];
  if (!level) return false;
  if (level === 'all') return true;
  if (level === 'read') return true; // distinguish writes via a separate canWrite check
  if (level === 'own') return ownerId && userId && String(ownerId) === String(userId);
  if (level === 'group') return true; // group scoping applied in query layer
  return false;
}

// True if the user has any level on this permission (used for read-only menu visibility).
function canRead(userRole, permission) {
  const perm = PERMISSIONS[permission];
  if (!perm) return false;
  return !!perm[userRole];
}

// Returns the raw level ('all' | 'own' | 'group' | 'read' | false) for the role.
function getLevel(userRole, permission) {
  const perm = PERMISSIONS[permission];
  if (!perm) return false;
  return perm[userRole] || false;
}

module.exports = { PERMISSIONS, can, canRead, getLevel };
