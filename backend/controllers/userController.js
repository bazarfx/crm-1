const { Op } = require('sequelize');
const { User, Group, GroupMember, AuditLog, RefreshToken } = require('../models');
const { success, error, paginated } = require('../utils/responseHelper');
const { signAccessToken } = require('../utils/jwtUtils');

const UPDATABLE = [
  'first_name', 'last_name', 'email', 'role', 'department', 'is_active',
  'avatar_url', 'native_language', 'second_language', 'third_language',
  'gallabox_user_id', 'parent_node_id', 'alias',
];

async function list(req, res) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
  const offset = (page - 1) * limit;
  const sortBy = req.query.sort_by || 'created_at';
  const sortOrder = (req.query.sort_order || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  const where = {};
  if (req.query.role) where.role = req.query.role;
  if (req.query.is_active) where.is_active = req.query.is_active === 'true';
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
  const exists = await User.findOne({ where: { email: body.email } });
  if (exists) return error(res, 'Email already in use', 409);

  const user = await User.create(body);
  return success(res, user.toSafeJSON(), 'Created', 201);
}

async function update(req, res) {
  const user = await User.scope('withPassword').findByPk(req.params.id);
  if (!user) return error(res, 'User not found', 404);

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

  // Only super_admin can reset super_admin (and only their own).
  if (target.role === 'super_admin' && target.id !== req.user.id) {
    return error(res, 'Only super admin can reset their own password', 403);
  }

  target.password = new_password; // beforeUpdate hook re-hashes
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

  // 1h impersonation token — uses the shared access-token signer so verifyToken
  // works unchanged. impersonated_by surfaces in req.user via the middleware.
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
        native_language: target.native_language,
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
      'native_language', 'deletedAt', 'is_active',
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
  deactivate, activate, resetPassword, impersonate, listDeleted, restoreUser,
};
