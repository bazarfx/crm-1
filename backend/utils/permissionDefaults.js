/**
 * Single source of truth for permission definitions.
 *
 * Used for FIRST-BOOT seeding only — after that, role_permissions table is
 * authoritative for everyone EXCEPT super_admin (which is hardcoded to full
 * access in utils/permissions.js — Layer 2 protection).
 */

const PERMISSION_CATEGORIES = {
  leads:        { label: 'Leads',          icon: 'Users',        order: 1 },
  trial_leads:  { label: 'Trial Leads',    icon: 'FlaskConical', order: 2 },
  users:        { label: 'Users',          icon: 'UserCog',      order: 3 },
  groups:       { label: 'Groups',         icon: 'FolderOpen',   order: 4 },
  campaigns:    { label: 'Campaigns',      icon: 'Megaphone',    order: 5 },
  reports:      { label: 'Reports',        icon: 'BarChart3',    order: 6 },
  settings:     { label: 'Settings',       icon: 'Settings',     order: 7 },
  system:       { label: 'System & Admin', icon: 'Shield',       order: 8 },
};

// Each entry: [key, category, description, defaults-by-role]
// Levels: 'all' | 'own' | 'group' | 'read' | 'none'
const PERMISSION_DEFINITIONS = [
  // ─── LEADS ──────────────────────────────────────────────────────────────
  ['leads.view',           'leads', 'View leads',
    { admin: 'all',  floor_manager: 'all',  senior: 'group', tele_sales: 'own',  back_office: 'read', auditor: 'read', archive: 'none' }],
  ['leads.create',         'leads', 'Create new leads',
    { admin: 'all',  floor_manager: 'all',  senior: 'none',  tele_sales: 'none', back_office: 'none', auditor: 'none', archive: 'none' }],
  ['leads.edit',           'leads', 'Edit lead details',
    { admin: 'all',  floor_manager: 'all',  senior: 'group', tele_sales: 'own',  back_office: 'none', auditor: 'none', archive: 'none' }],
  ['leads.soft_delete',    'leads', 'Soft delete leads (move to recycle bin)',
    { admin: 'all',  floor_manager: 'none', senior: 'none',  tele_sales: 'none', back_office: 'none', auditor: 'none', archive: 'none' }],
  ['leads.reassign',       'leads', 'Reassign leads to different telesellers',
    { admin: 'all',  floor_manager: 'all',  senior: 'group', tele_sales: 'none', back_office: 'none', auditor: 'none', archive: 'none' }],
  ['leads.change_status',  'leads', 'Change lead status (new → contacted → etc)',
    { admin: 'all',  floor_manager: 'all',  senior: 'group', tele_sales: 'own',  back_office: 'none', auditor: 'none', archive: 'none' }],
  ['leads.add_activity',   'leads', 'Add notes / log calls / activities',
    { admin: 'all',  floor_manager: 'all',  senior: 'group', tele_sales: 'own',  back_office: 'none', auditor: 'none', archive: 'none' }],
  ['leads.export',         'leads', 'Export lead data to CSV',
    { admin: 'all',  floor_manager: 'all',  senior: 'group', tele_sales: 'none', back_office: 'none', auditor: 'read', archive: 'none' }],
  ['leads.bulk_operations','leads', 'Bulk assign / bulk update leads',
    { admin: 'all',  floor_manager: 'all',  senior: 'none',  tele_sales: 'none', back_office: 'none', auditor: 'none', archive: 'none' }],

  // ─── TRIAL LEADS ────────────────────────────────────────────────────────
  ['trial_leads.create',   'trial_leads', 'Create trial / demo leads',
    { admin: 'none', floor_manager: 'none', senior: 'none', tele_sales: 'none', back_office: 'none', auditor: 'none', archive: 'none' }],
  ['trial_leads.delete',   'trial_leads', 'Hard delete trial leads',
    { admin: 'none', floor_manager: 'none', senior: 'none', tele_sales: 'none', back_office: 'none', auditor: 'none', archive: 'none' }],

  // ─── USERS ──────────────────────────────────────────────────────────────
  ['users.view',           'users', 'View user list',
    { admin: 'all', floor_manager: 'all',  senior: 'group', tele_sales: 'none', back_office: 'none', auditor: 'read', archive: 'none' }],
  ['users.create',         'users', 'Create new users',
    { admin: 'all', floor_manager: 'none', senior: 'none',  tele_sales: 'none', back_office: 'none', auditor: 'none', archive: 'none' }],
  ['users.edit',           'users', 'Edit user details',
    { admin: 'all', floor_manager: 'none', senior: 'none',  tele_sales: 'none', back_office: 'none', auditor: 'none', archive: 'none' }],
  ['users.change_role',    'users', "Change a user's role (except super_admin)",
    { admin: 'all', floor_manager: 'none', senior: 'none',  tele_sales: 'none', back_office: 'none', auditor: 'none', archive: 'none' }],
  ['users.deactivate',     'users', 'Deactivate users (mark inactive)',
    { admin: 'all', floor_manager: 'none', senior: 'none',  tele_sales: 'none', back_office: 'none', auditor: 'none', archive: 'none' }],
  ['users.soft_delete',    'users', 'Soft delete users',
    { admin: 'all', floor_manager: 'none', senior: 'none',  tele_sales: 'none', back_office: 'none', auditor: 'none', archive: 'none' }],
  ['users.reset_password', 'users', "Reset another user's password",
    { admin: 'all', floor_manager: 'none', senior: 'none',  tele_sales: 'none', back_office: 'none', auditor: 'none', archive: 'none' }],

  // ─── GROUPS ─────────────────────────────────────────────────────────────
  ['groups.view',              'groups', 'View groups',
    { admin: 'all', floor_manager: 'all',  senior: 'group', tele_sales: 'group', back_office: 'none', auditor: 'read', archive: 'none' }],
  ['groups.create',            'groups', 'Create new groups',
    { admin: 'all', floor_manager: 'none', senior: 'none',  tele_sales: 'none',  back_office: 'none', auditor: 'none', archive: 'none' }],
  ['groups.edit',              'groups', 'Edit group name / language / settings',
    { admin: 'all', floor_manager: 'none', senior: 'none',  tele_sales: 'none',  back_office: 'none', auditor: 'none', archive: 'none' }],
  ['groups.manage_members',    'groups', 'Add or remove members from groups',
    { admin: 'all', floor_manager: 'all',  senior: 'none',  tele_sales: 'none',  back_office: 'none', auditor: 'none', archive: 'none' }],
  ['groups.reset_round_robin', 'groups', 'Reset round robin counter',
    { admin: 'all', floor_manager: 'all',  senior: 'none',  tele_sales: 'none',  back_office: 'none', auditor: 'none', archive: 'none' }],
  ['groups.soft_delete',       'groups', 'Soft delete groups',
    { admin: 'all', floor_manager: 'none', senior: 'none',  tele_sales: 'none',  back_office: 'none', auditor: 'none', archive: 'none' }],

  // ─── CAMPAIGNS ──────────────────────────────────────────────────────────
  ['campaigns.view',           'campaigns', 'View campaigns',
    { admin: 'all', floor_manager: 'all',  senior: 'group', tele_sales: 'none', back_office: 'none', auditor: 'read', archive: 'none' }],
  ['campaigns.create',         'campaigns', 'Create campaigns',
    { admin: 'all', floor_manager: 'none', senior: 'none',  tele_sales: 'none', back_office: 'none', auditor: 'none', archive: 'none' }],
  ['campaigns.edit',           'campaigns', 'Edit campaign details',
    { admin: 'all', floor_manager: 'none', senior: 'none',  tele_sales: 'none', back_office: 'none', auditor: 'none', archive: 'none' }],
  ['campaigns.assign_groups',  'campaigns', 'Assign campaigns to groups',
    { admin: 'all', floor_manager: 'none', senior: 'none',  tele_sales: 'none', back_office: 'none', auditor: 'none', archive: 'none' }],
  ['campaigns.soft_delete',    'campaigns', 'Soft delete campaigns',
    { admin: 'all', floor_manager: 'none', senior: 'none',  tele_sales: 'none', back_office: 'none', auditor: 'none', archive: 'none' }],

  // ─── REPORTS ────────────────────────────────────────────────────────────
  ['reports.own_dashboard', 'reports', 'View own dashboard',
    { admin: 'all', floor_manager: 'all',  senior: 'all',   tele_sales: 'own',   back_office: 'read', auditor: 'read', archive: 'none' }],
  ['reports.team',          'reports', 'View team / group reports',
    { admin: 'all', floor_manager: 'all',  senior: 'group', tele_sales: 'group', back_office: 'read', auditor: 'read', archive: 'none' }],
  ['reports.full',          'reports', 'View full / company-wide reports',
    { admin: 'all', floor_manager: 'all',  senior: 'none',  tele_sales: 'none',  back_office: 'read', auditor: 'read', archive: 'none' }],
  ['reports.ftd',           'reports', 'View FTD reports',
    { admin: 'all', floor_manager: 'all',  senior: 'group', tele_sales: 'none',  back_office: 'read', auditor: 'read', archive: 'none' }],

  // ─── SETTINGS ───────────────────────────────────────────────────────────
  ['settings.assignment_rules', 'settings', 'Edit lead assignment settings',
    { admin: 'all',  floor_manager: 'none', senior: 'none', tele_sales: 'none', back_office: 'none', auditor: 'none', archive: 'none' }],
  ['settings.system_toggles',   'settings', 'Toggle system on/off (ARK webhook, ingest)',
    { admin: 'none', floor_manager: 'none', senior: 'none', tele_sales: 'none', back_office: 'none', auditor: 'none', archive: 'none' }],
  ['settings.config_values',    'settings', 'Edit config / dropdown values',
    { admin: 'all',  floor_manager: 'none', senior: 'none', tele_sales: 'none', back_office: 'none', auditor: 'none', archive: 'none' }],

  // ─── SYSTEM / SPECIAL ──────────────────────────────────────────────────
  ['recycle_bin.view',         'system', 'View the recycle bin',
    { admin: 'none', floor_manager: 'none', senior: 'none', tele_sales: 'none', back_office: 'none', auditor: 'none', archive: 'none' }],
  ['recycle_bin.restore',      'system', 'Restore soft-deleted records',
    { admin: 'none', floor_manager: 'none', senior: 'none', tele_sales: 'none', back_office: 'none', auditor: 'none', archive: 'none' }],
  ['recycle_bin.hard_delete',  'system', 'Permanently purge from recycle bin',
    { admin: 'none', floor_manager: 'none', senior: 'none', tele_sales: 'none', back_office: 'none', auditor: 'none', archive: 'none' }],
  ['adminjs.access',           'system', 'Access the AdminJS panel',
    { admin: 'none', floor_manager: 'none', senior: 'none', tele_sales: 'none', back_office: 'none', auditor: 'none', archive: 'none' }],
  ['audit_logs.view',          'system', 'View audit logs',
    { admin: 'all',  floor_manager: 'none', senior: 'none', tele_sales: 'none', back_office: 'none', auditor: 'read', archive: 'none' }],
  ['ark_logs.view',            'system', 'View ARK webhook logs',
    { admin: 'all',  floor_manager: 'none', senior: 'none', tele_sales: 'none', back_office: 'read', auditor: 'read', archive: 'none' }],
  ['ark_logs.manual_match',    'system', 'Manually match unmatched ARK logs',
    { admin: 'all',  floor_manager: 'none', senior: 'none', tele_sales: 'none', back_office: 'none', auditor: 'none', archive: 'none' }],
  ['role_permissions.manage',  'system', 'Edit role permissions (super admin only — locked)',
    { admin: 'none', floor_manager: 'none', senior: 'none', tele_sales: 'none', back_office: 'none', auditor: 'none', archive: 'none' }],
];

const NON_EDITABLE_ROLES = ['super_admin'];
const ALL_ROLES = [
  'super_admin', 'admin', 'floor_manager', 'senior',
  'tele_sales', 'back_office', 'auditor', 'archive',
];
const VALID_LEVELS = ['none', 'all', 'own', 'group', 'read'];

module.exports = {
  PERMISSION_CATEGORIES,
  PERMISSION_DEFINITIONS,
  NON_EDITABLE_ROLES,
  ALL_ROLES,
  VALID_LEVELS,
};
