const { Op } = require('sequelize');
const { sequelize, User, Group, GroupMember, AuditLog, RefreshToken, Lead, UserPermission } = require('../models');
const { success, error, paginated } = require('../utils/responseHelper');
const { signAccessToken } = require('../utils/jwtUtils');
const { PERMISSION_DEFINITIONS } = require('../utils/permissionDefaults');
const { invalidateUser } = require('../utils/permissions');

const VALID_PERMISSION_LEVELS = ['none', 'all', 'own', 'group', 'read'];
const PERMISSION_KEYS = new Set(PERMISSION_DEFINITIONS.map(([k]) => k));

// Roles a non-super_admin admin is allowed to create. super_admin can create
// anything except another super_admin.
const ROLES_ADMIN_CAN_CREATE = ['tele_sales', 'senior', 'back_office', 'custom'];
const ROLES_SUPER_ADMIN_CAN_CREATE = ['admin', 'tele_sales', 'senior', 'back_office', 'custom'];

function normalizePermissionsPayload(raw) {
  // Accept either { 'leads.view': 'all', ... } or [{ key, level }, ...].
  // Returns a clean object or throws Error.
  if (!raw) return {};
  const out = {};
  if (Array.isArray(raw)) {
    for (const row of raw) {
      if (!row || !row.key) throw new Error('Each permission entry needs a key');
      if (!PERMISSION_KEYS.has(row.key)) throw new Error(`Unknown permission key: ${row.key}`);
      if (!VALID_PERMISSION_LEVELS.includes(row.level)) {
        throw new Error(`Invalid level "${row.level}" for ${row.key}`);
      }
      out[row.key] = row.level;
    }
    return out;
  }
  if (typeof raw !== 'object') throw new Error('permissions must be an object or array');
  for (const [key, level] of Object.entries(raw)) {
    if (!PERMISSION_KEYS.has(key)) throw new Error(`Unknown permission key: ${key}`);
    if (!VALID_PERMISSION_LEVELS.includes(level)) {
      throw new Error(`Invalid level "${level}" for ${key}`);
    }
    out[key] = level;
  }
  return out;
}

const VALID_LANGUAGES = [
  'english', 'tamil', 'telugu', 'hindi', 'marathi',
  'gujarati', 'bengali', 'kannada', 'malayalam', 'punjabi',
];

const UPDATABLE = [
  'first_name', 'last_name', 'email', 'role', 'department', 'is_active',
  'avatar_url', 'primary_language', 'additional_languages',
  'second_language', 'third_language',
  'gallabox_user_id', 'parent_node_id', 'alias',
];

function validateUserPayload(data, { isUpdate = false } = {}) {
  const errors = [];
  if (['tele_sales', 'senior'].includes(data.role)) {
    if (!data.primary_language && !isUpdate) {
      errors.push('primary_language is required for tele_sales and senior');
    }
    if (data.primary_language && !VALID_LANGUAGES.includes(data.primary_language)) {
      errors.push(`Invalid primary_language: ${data.primary_language}`);
    }
  }
  if (data.additional_languages !== undefined && data.additional_languages !== null) {
    if (!Array.isArray(data.additional_languages)) {
      errors.push('additional_languages must be an array');
    } else {
      for (const lang of data.additional_languages) {
        if (!VALID_LANGUAGES.includes(lang)) {
          errors.push(`Invalid additional language: ${lang}`);
        }
      }
      if (data.primary_language && data.additional_languages.includes(data.primary_language)) {
        errors.push('primary_language cannot appear in additional_languages');
      }
    }
  }
  return errors;
}

async function list(req, res) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
  const offset = (page - 1) * limit;
  const sortBy = req.query.sort_by || 'created_at';
  const sortOrder = (req.query.sort_order || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  const where = {};
  if (req.query.role) where.role = req.query.role;
  if (req.query.is_active) where.is_active = req.query.is_active === 'true';
  if (req.query.primary_language) where.primary_language = req.query.primary_language;
  else if (req.query.language) where.primary_language = req.query.language;
  if (req.query.search) {
    const q = `%${req.query.search}%`;
    where[Op.or] = [
      { first_name: { [Op.iLike]: q } },
      { last_name: { [Op.iLike]: q } },
      { email: { [Op.iLike]: q } },
      { alias: { [Op.iLike]: q } },
    ];
  }

  const { rows, count } = await User.findAndCountAll({
    where,
    order: [[sortBy, sortOrder]],
    limit,
    offset,
  });

  return paginated(res, rows, { total: count, page, limit });
}

async function getOne(req, res) {
  const user = await User.findByPk(req.params.id, {
    include: [{ model: Group, as: 'groups', through: { attributes: ['rr_index', 'is_active'] } }],
  });
  if (!user) return error(res, 'User not found', 404);
  return success(res, user);
}

async function create(req, res) {
  const body = req.body || {};
  if (!body.email || !body.password || !body.role) {
    return error(res, 'email, password, and role are required', 400);
  }

  // Role-creation guard. super_admin can create everything except another
  // super_admin; admin can create a subset (no admin, no super_admin).
  const creatorRole = req.user?.role;
  const allowed = creatorRole === 'super_admin'
    ? ROLES_SUPER_ADMIN_CAN_CREATE
    : creatorRole === 'admin'
      ? ROLES_ADMIN_CAN_CREATE
      : [];
  if (!allowed.includes(body.role)) {
    return error(
      res,
      `Your role (${creatorRole}) cannot create users with role "${body.role}"`,
      403,
    );
  }

  const validationErrors = validateUserPayload(body);
  if (validationErrors.length) return error(res, validationErrors.join('; '), 400);

  // Parse and validate the optional `permissions` payload. Only meaningful for
  // role='custom'; for other roles we silently ignore it so the create doesn't
  // fail on a stray field from the UI.
  let permsToSeed = null;
  if (body.role === 'custom') {
    try {
      permsToSeed = normalizePermissionsPayload(body.permissions);
    } catch (e) {
      return error(res, e.message, 400);
    }
    if (Object.keys(permsToSeed).length === 0) {
      return error(res, 'A custom user needs at least one permission set', 400);
    }
  }

  const exists = await User.findOne({ where: { email: body.email } });
  if (exists) return error(res, 'Email already in use', 409);

  if (body.additional_languages === undefined || body.additional_languages === null) {
    body.additional_languages = [];
  }

  // Strip `permissions` before passing to User.create — it isn't a User column.
  const { permissions: _stripPermissions, ...userData } = body;

  const created = await sequelize.transaction(async (tx) => {
    const user = await User.create(userData, { transaction: tx });
    if (permsToSeed) {
      const rows = Object.entries(permsToSeed).map(([key, level]) => ({
        user_id: user.id,
        permission_key: key,
        level,
        updated_by: req.user.id,
      }));
      await UserPermission.bulkCreate(rows, { transaction: tx });
    }
    return user;
  });

  if (permsToSeed) invalidateUser(created.id);

  return success(res, created.toSafeJSON(), 'Created', 201);
}

// GET /api/v1/users/:id/permissions
// Returns the user's effective permission map. For role='custom' it's their
// per-user overrides; for other roles it falls back to the role-level map.
async function getPermissions(req, res) {
  const target = await User.findByPk(req.params.id);
  if (!target) return error(res, 'User not found', 404);

  if (target.role !== 'custom') {
    // Useful so the UI can show the resolved set for any user — pull the
    // role-level map dynamically so we don't ship stale defaults.
    const { getAllForRole } = require('../utils/permissions');
    const perms = await getAllForRole(target.role, target.id);
    return success(res, {
      user_id: target.id,
      role: target.role,
      is_custom: false,
      permissions: perms,
    });
  }

  const rows = await UserPermission.findAll({
    where: { user_id: target.id },
    attributes: ['permission_key', 'level'],
    raw: true,
  });
  const permissions = Object.fromEntries(rows.map((r) => [r.permission_key, r.level]));
  return success(res, {
    user_id: target.id,
    role: target.role,
    is_custom: true,
    permissions,
  });
}

// PATCH /api/v1/users/:id/permissions
// Replaces the user's per-user permission set. Only valid for role='custom'.
async function setPermissions(req, res) {
  if (!['super_admin', 'admin'].includes(req.user.role)) {
    return error(res, 'Only admin / super admin can change a user\'s permissions', 403);
  }

  const target = await User.findByPk(req.params.id);
  if (!target) return error(res, 'User not found', 404);
  if (target.role !== 'custom') {
    return error(res, 'Per-user permissions are only available for users with role="custom"', 400);
  }
  if (target.role === 'super_admin') {
    return error(res, 'Cannot modify super_admin permissions', 403);
  }

  let parsed;
  try {
    parsed = normalizePermissionsPayload(req.body?.permissions);
  } catch (e) {
    return error(res, e.message, 400);
  }

  const existing = await UserPermission.findAll({
    where: { user_id: target.id },
    raw: true,
  });
  const existingMap = Object.fromEntries(existing.map((r) => [r.permission_key, r.level]));

  await sequelize.transaction(async (tx) => {
    // Replace strategy — simpler than merging and matches the "single source
    // of truth" mental model the UI presents.
    await UserPermission.destroy({ where: { user_id: target.id }, transaction: tx, force: true });
    const rows = Object.entries(parsed).map(([key, level]) => ({
      user_id: target.id,
      permission_key: key,
      level,
      updated_by: req.user.id,
    }));
    if (rows.length) await UserPermission.bulkCreate(rows, { transaction: tx });
  });

  invalidateUser(target.id);

  await AuditLog.create({
    user_id: req.user.id,
    action: 'UPDATE_USER_PERMISSIONS',
    resource: 'User',
    resource_id: target.id,
    old_data: existingMap,
    new_data: parsed,
    ip_address: req.ip,
  }).catch(() => {});

  return success(res, { user_id: target.id, permissions: parsed }, 'Permissions updated');
}

async function update(req, res) {
  const user = await User.scope('withPassword').findByPk(req.params.id);
  if (!user) return error(res, 'User not found', 404);

  if (user.role === 'super_admin' && user.id !== req.user.id) {
    return error(res, 'Cannot edit super admin', 403);
  }

  const { role: incomingRole } = req.body || {};
  if (incomingRole && incomingRole !== user.role && !['super_admin', 'admin'].includes(req.user.role)) {
    return error(res, 'Only admin can change roles', 403);
  }

  // Build the post-update view of the row, then validate it.
  const projected = {
    ...user.toJSON(),
    ...Object.fromEntries(UPDATABLE.filter((k) => req.body[k] !== undefined).map((k) => [k, req.body[k]])),
  };
  const validationErrors = validateUserPayload(projected, { isUpdate: true });
  if (validationErrors.length) return error(res, validationErrors.join('; '), 400);

  for (const k of UPDATABLE) {
    if (req.body[k] !== undefined) user[k] = req.body[k];
  }
  if (req.body.password) user.password = req.body.password; // hook re-hashes
  await user.save();
  return success(res, user.toSafeJSON(), 'Updated');
}

async function remove(req, res) {
  const user = await User.findByPk(req.params.id);
  if (!user) return error(res, 'User not found', 404);
  await user.destroy();
  return success(res, null, 'Deleted');
}

async function changePassword(req, res) {
  const { current_password, new_password } = req.body || {};
  if (!current_password || !new_password) {
    return error(res, 'current_password and new_password are required', 400);
  }
  const user = await User.scope('withPassword').findByPk(req.user.id);
  if (!user) return error(res, 'User not found', 404);
  const ok = await user.comparePassword(current_password);
  if (!ok) return error(res, 'Current password is incorrect', 400);
  user.password = new_password;
  await user.save();
  return success(res, null, 'Password changed');
}

// ─── LANGUAGE MANAGEMENT ─────────────────────────────────────────────────
async function changeLanguage(req, res) {
  if (!['super_admin', 'admin'].includes(req.user.role)) {
    return error(res, "Only admin / super admin can change a user's language", 403);
  }

  const target = await User.findByPk(req.params.id);
  if (!target) return error(res, 'User not found', 404);

  const { primary_language, additional_languages } = req.body || {};
  const updates = {};

  if (primary_language !== undefined) {
    if (!VALID_LANGUAGES.includes(primary_language)) {
      return error(res, `Invalid primary_language: ${primary_language}`, 400);
    }
    updates.primary_language = primary_language;
  }
  if (additional_languages !== undefined) {
    if (!Array.isArray(additional_languages)) {
      return error(res, 'additional_languages must be an array', 400);
    }
    for (const l of additional_languages) {
      if (!VALID_LANGUAGES.includes(l)) {
        return error(res, `Invalid additional language: ${l}`, 400);
      }
    }
    const projectedPrimary = updates.primary_language || target.primary_language;
    if (projectedPrimary && additional_languages.includes(projectedPrimary)) {
      return error(res, 'primary_language cannot appear in additional_languages', 400);
    }
    updates.additional_languages = additional_languages;
  }

  const oldData = {
    primary_language: target.primary_language,
    additional_languages: target.additional_languages,
  };
  await target.update(updates);

  await AuditLog.create({
    user_id: req.user.id,
    action: 'CHANGE_USER_LANGUAGE',
    resource: 'User',
    resource_id: target.id,
    old_data: oldData,
    new_data: updates,
    ip_address: req.ip,
  }).catch(() => {});

  return success(
    res,
    target.toSafeJSON(),
    'Language updated. Future lead assignments will use the new language settings.',
  );
}

async function byLanguage(req, res) {
  const { role } = req.query;
  const where = { is_active: true };
  if (role) where.role = role;
  else where.role = { [Op.in]: ['tele_sales', 'senior'] };

  const users = await User.findAll({
    where,
    attributes: [
      'id', 'first_name', 'last_name', 'email', 'role',
      'primary_language', 'additional_languages',
      'last_login_at', 'is_active', 'created_at',
    ],
    order: [['primary_language', 'ASC'], ['first_name', 'ASC']],
  });

  const grouped = {};
  for (const u of users) {
    const lang = u.primary_language || 'unassigned';
    if (!grouped[lang]) grouped[lang] = [];
    grouped[lang].push(u);
  }

  const result = Object.entries(grouped)
    .map(([language, langUsers]) => ({ language, count: langUsers.length, users: langUsers }))
    .sort((a, b) => a.language.localeCompare(b.language));

  return success(res, {
    groups: result,
    total_users: users.length,
    languages_with_coverage: result.length,
  });
}

async function languageStats(req, res) {
  const userCounts = await User.findAll({
    where: { role: { [Op.in]: ['tele_sales', 'senior'] } },
    attributes: [
      'primary_language',
      'role',
      [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
      [sequelize.fn('SUM', sequelize.literal('CASE WHEN is_active THEN 1 ELSE 0 END')), 'active_count'],
    ],
    group: ['primary_language', 'role'],
    raw: true,
  });

  const leadStats = await Lead.findAll({
    attributes: [
      'language',
      [sequelize.fn('COUNT', sequelize.col('id')), 'total_leads'],
      [sequelize.fn('SUM', sequelize.literal("CASE WHEN ftd_at IS NOT NULL THEN 1 ELSE 0 END")), 'ftd_count'],
      [sequelize.fn('SUM', sequelize.col('deposited_amount')), 'total_deposits'],
    ],
    group: ['language'],
    raw: true,
  });

  const overflowable = await User.findAll({
    where: {
      is_active: true,
      role: { [Op.in]: ['tele_sales', 'senior'] },
    },
    attributes: ['additional_languages'],
    raw: true,
  });

  const overflowCounts = {};
  for (const u of overflowable) {
    for (const lang of (u.additional_languages || [])) {
      overflowCounts[lang] = (overflowCounts[lang] || 0) + 1;
    }
  }

  const emptyRow = (lang) => ({
    language: lang,
    telesellers: 0,
    seniors: 0,
    active_telesellers: 0,
    active_seniors: 0,
    overflow_helpers: overflowCounts[lang] || 0,
    total_leads: 0,
    ftd_count: 0,
    total_deposits: 0,
  });

  const result = {};
  for (const row of userCounts) {
    const lang = row.primary_language || 'unassigned';
    if (!result[lang]) result[lang] = emptyRow(lang);
    if (row.role === 'tele_sales') {
      result[lang].telesellers = parseInt(row.count, 10);
      result[lang].active_telesellers = parseInt(row.active_count, 10);
    } else if (row.role === 'senior') {
      result[lang].seniors = parseInt(row.count, 10);
      result[lang].active_seniors = parseInt(row.active_count, 10);
    }
  }
  for (const row of leadStats) {
    const lang = row.language || 'unassigned';
    if (!result[lang]) result[lang] = emptyRow(lang);
    result[lang].total_leads = parseInt(row.total_leads || 0, 10);
    result[lang].ftd_count = parseInt(row.ftd_count || 0, 10);
    result[lang].total_deposits = parseFloat(row.total_deposits || 0);
  }

  return success(res, {
    by_language: Object.values(result).sort(
      (a, b) => (b.telesellers + b.seniors) - (a.telesellers + a.seniors),
    ),
    valid_languages: VALID_LANGUAGES,
  });
}

// ─── LIFECYCLE: deactivate / activate / reset password ───────────────────
async function deactivate(req, res) {
  const target = await User.findByPk(req.params.id);
  if (!target) return error(res, 'User not found', 404);

  if (target.role === 'super_admin') {
    return error(res, 'Super admin cannot be deactivated', 403);
  }
  if (target.id === req.user.id) {
    return error(res, 'You cannot deactivate your own account', 403);
  }

  await target.update({ is_active: false });
  await RefreshToken.destroy({ where: { user_id: target.id }, force: true });

  await AuditLog.create({
    user_id: req.user.id,
    action: 'DEACTIVATE_USER',
    resource: 'User',
    resource_id: target.id,
    old_data: { is_active: true },
    new_data: { is_active: false },
    ip_address: req.ip,
  });

  return success(
    res,
    null,
    `${target.first_name} ${target.last_name} deactivated. They will be logged out within seconds.`,
  );
}

async function activate(req, res) {
  const target = await User.findByPk(req.params.id);
  if (!target) return error(res, 'User not found', 404);

  if (target.role === 'super_admin') {
    return error(res, 'Super admin is always active', 403);
  }

  await target.update({ is_active: true });

  await AuditLog.create({
    user_id: req.user.id,
    action: 'ACTIVATE_USER',
    resource: 'User',
    resource_id: target.id,
    old_data: { is_active: false },
    new_data: { is_active: true },
    ip_address: req.ip,
  });

  return success(
    res,
    null,
    `${target.first_name} ${target.last_name} activated. They can now log in.`,
  );
}

async function resetPassword(req, res) {
  const { new_password, force_change_on_next_login } = req.body || {};
  if (!new_password || new_password.length < 6) {
    return error(res, 'Password must be at least 6 characters', 400);
  }

  const target = await User.findByPk(req.params.id);
  if (!target) return error(res, 'User not found', 404);

  if (target.role === 'super_admin' && target.id !== req.user.id) {
    return error(res, 'Only super admin can reset their own password', 403);
  }

  target.password = new_password;
  target.must_change_password = !!force_change_on_next_login;
  await target.save();

  await RefreshToken.destroy({ where: { user_id: target.id }, force: true });

  await AuditLog.create({
    user_id: req.user.id,
    action: 'RESET_PASSWORD',
    resource: 'User',
    resource_id: target.id,
    new_data: {
      password_reset: true,
      force_change_on_next_login: !!force_change_on_next_login,
    },
    ip_address: req.ip,
  });

  return success(
    res,
    {
      user_id: target.id,
      email: target.email,
      name: `${target.first_name} ${target.last_name}`,
      new_password,
      force_change: !!force_change_on_next_login,
    },
    'Password reset. Share the new password with the user securely. This is the only time it will be shown.',
  );
}

// ─── IMPERSONATION (super_admin only) ────────────────────────────────────
async function impersonate(req, res) {
  if (req.user.role !== 'super_admin') {
    return error(res, 'Only super admin can impersonate users', 403);
  }

  const target = await User.findByPk(req.params.id, { paranoid: false });
  if (!target) return error(res, 'User not found', 404);
  if (target.deletedAt) return error(res, 'Cannot impersonate a deleted user', 400);
  if (!target.is_active) return error(res, 'Cannot impersonate a deactivated user', 400);
  if (target.role === 'super_admin') {
    return error(res, 'Cannot impersonate another super admin', 403);
  }

  const accessToken = signAccessToken({
    sub: target.id,
    role: target.role,
    email: target.email,
    impersonated_by: req.user.id,
  });

  await AuditLog.create({
    user_id: req.user.id,
    action: 'IMPERSONATE',
    resource: 'User',
    resource_id: target.id,
    new_data: { impersonated_user: target.email },
    ip_address: req.ip,
  });

  return success(
    res,
    {
      accessToken,
      user: {
        id: target.id,
        email: target.email,
        first_name: target.first_name,
        last_name: target.last_name,
        role: target.role,
        primary_language: target.primary_language,
        additional_languages: target.additional_languages,
        impersonated: true,
        impersonated_by: {
          id: req.user.id,
          name: `${req.user.first_name} ${req.user.last_name}`,
        },
      },
    },
    `You are now logged in as ${target.first_name} ${target.last_name}. End the session to return to your account.`,
  );
}

// ─── SOFT-DELETED USERS: list & restore ──────────────────────────────────
async function listDeleted(req, res) {
  const users = await User.findAll({
    paranoid: false,
    where: { deletedAt: { [Op.ne]: null } },
    attributes: [
      'id', 'first_name', 'last_name', 'email', 'role',
      'primary_language', 'additional_languages', 'deletedAt', 'is_active',
    ],
    order: [['deletedAt', 'DESC']],
  });
  return success(res, users);
}

async function restoreUser(req, res) {
  const target = await User.findByPk(req.params.id, { paranoid: false });
  if (!target) return error(res, 'User not found', 404);
  if (!target.deletedAt) return error(res, 'User is not deleted', 400);

  await target.restore();
  await target.update({ is_active: true });

  await AuditLog.create({
    user_id: req.user.id,
    action: 'RESTORE_USER',
    resource: 'User',
    resource_id: target.id,
    new_data: { restored: true, is_active: true },
    ip_address: req.ip,
  });

  return success(
    res,
    null,
    `${target.first_name} ${target.last_name} restored and activated.`,
  );
}

module.exports = {
  list, getOne, create, update, remove, changePassword,
  changeLanguage, byLanguage, languageStats,
  getPermissions, setPermissions,
  deactivate, activate, resetPassword, impersonate, listDeleted, restoreUser,
};
