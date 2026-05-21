const { Op } = require('sequelize');
const { AuditLog, User } = require('../models');
const { success } = require('../utils/responseHelper');

// GET /api/v1/audit-logs/admin-actions
// Super-admin oversight: every action performed by admin role users.
async function adminActions(req, res) {
  const {
    resource,
    action,
    admin_id,
    date_from,
    date_to,
    page = 1,
    limit = 50,
  } = req.query;

  // Resolve admin user IDs (include soft-deleted so historical actions still
  // surface even after the admin was offboarded).
  const adminUsers = await User.findAll({
    paranoid: false,
    where: { role: 'admin' },
    attributes: ['id', 'first_name', 'last_name', 'email'],
  });
  const adminIds = adminUsers.map((u) => u.id);

  if (adminIds.length === 0) {
    return success(res, {
      items: [],
      pagination: { total: 0, page: 1, limit: parseInt(limit, 10), totalPages: 0 },
    });
  }

  const where = { user_id: { [Op.in]: adminIds } };
  if (admin_id) where.user_id = admin_id;
  if (resource) where.resource = resource;
  if (action) where.action = action;
  if (date_from || date_to) {
    where.created_at = {};
    if (date_from) where.created_at[Op.gte] = new Date(date_from);
    if (date_to) where.created_at[Op.lte] = new Date(date_to);
  }

  const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
  const result = await AuditLog.findAndCountAll({
    where,
    limit: parseInt(limit, 10),
    offset,
    order: [['created_at', 'DESC']],
  });

  const adminMap = Object.fromEntries(adminUsers.map((u) => [u.id, u]));
  const items = result.rows.map((log) => {
    const j = log.toJSON();
    const admin = adminMap[j.user_id];
    return {
      ...j,
      admin_name: admin ? `${admin.first_name} ${admin.last_name}` : 'Unknown',
      admin_email: admin?.email,
    };
  });

  return success(res, {
    items,
    pagination: {
      total: result.count,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      totalPages: Math.ceil(result.count / parseInt(limit, 10)),
    },
  });
}

// GET /api/v1/audit-logs/lead/:leadId
// Full audit history for a single lead (used by lead detail page).
async function leadHistory(req, res) {
  const { leadId } = req.params;
  const logs = await AuditLog.findAll({
    where: { resource: 'Lead', resource_id: leadId },
    order: [['created_at', 'DESC']],
    limit: 100,
  });

  const userIds = [...new Set(logs.map((l) => l.user_id).filter(Boolean))];
  const users = userIds.length
    ? await User.findAll({
        paranoid: false,
        where: { id: { [Op.in]: userIds } },
        attributes: ['id', 'first_name', 'last_name', 'role'],
      })
    : [];
  const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

  const items = logs.map((log) => {
    const j = log.toJSON();
    const u = userMap[j.user_id];
    return {
      ...j,
      user_name: u ? `${u.first_name} ${u.last_name}` : 'System',
      user_role: u?.role || null,
    };
  });

  return success(res, items);
}

module.exports = { adminActions, leadHistory };
