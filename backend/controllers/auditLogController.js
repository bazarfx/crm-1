const { Op } = require('sequelize');
const { AuditLog, User, Lead } = require('../models');
const { success } = require('../utils/responseHelper');

// A bare 'YYYY-MM-DD' date_to parses as midnight UTC, which would exclude rows
// created later that same day. Widen it to the inclusive end of the day so the
// chip-rail date pickers behave as "through this date". Full timestamps pass
// through untouched.
function endOfDay(d) {
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) return new Date(`${d}T23:59:59.999Z`);
  return new Date(d);
}

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
    if (date_to) where.created_at[Op.lte] = endOfDay(date_to);
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

// GET /api/v1/audit-logs/sales-activity
// Admin / super_admin oversight: every audit-logged action performed by
// users in sales-facing roles (tele_sales by default; pass ?role=senior or
// ?role=tele_sales,senior to broaden). Joins lead context for each Lead
// resource so the UI can render a direct link without an extra fetch.
async function salesActivity(req, res) {
  const {
    role,
    user_id,
    resource,
    action,
    lead_id,
    date_from,
    date_to,
    page = 1,
    limit = 50,
  } = req.query;

  // Default scope: telesellers. Callers can broaden to seniors (or both) via
  // ?role=, but we hard-block other roles so this endpoint can't be used to
  // peek at admin activity (super_admin has /admin-actions for that).
  const requestedRoles = (role ? String(role).split(',') : ['tele_sales'])
    .map((r) => r.trim())
    .filter((r) => ['tele_sales', 'senior'].includes(r));
  if (requestedRoles.length === 0) requestedRoles.push('tele_sales');

  // Include soft-deleted users so an offboarded teleseller's history still
  // shows up. Without paranoid:false we'd silently lose context for any
  // historical action by anyone who has since been removed.
  const salesUsers = await User.findAll({
    paranoid: false,
    where: { role: { [Op.in]: requestedRoles } },
    attributes: ['id', 'first_name', 'last_name', 'email', 'role'],
  });
  const salesIds = salesUsers.map((u) => u.id);

  if (salesIds.length === 0) {
    return success(res, {
      items: [],
      pagination: { total: 0, page: 1, limit: parseInt(limit, 10), totalPages: 0 },
    });
  }

  const where = { user_id: { [Op.in]: salesIds } };
  if (user_id) {
    // Verify the requested user is actually in scope before honoring the
    // filter — otherwise an admin could pass ?user_id=<admin-uuid> and get
    // the same data the /admin-actions endpoint guards against.
    if (!salesIds.includes(user_id)) {
      return success(res, {
        items: [],
        pagination: { total: 0, page: 1, limit: parseInt(limit, 10), totalPages: 0 },
      });
    }
    where.user_id = user_id;
  }
  if (resource) where.resource = resource;
  if (action) where.action = action;
  if (lead_id) {
    where.resource = 'Lead';
    where.resource_id = lead_id;
  }
  if (date_from || date_to) {
    where.created_at = {};
    if (date_from) where.created_at[Op.gte] = new Date(date_from);
    if (date_to) where.created_at[Op.lte] = endOfDay(date_to);
  }

  const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
  const result = await AuditLog.findAndCountAll({
    where,
    limit: parseInt(limit, 10),
    offset,
    order: [['created_at', 'DESC']],
  });

  // Batch-fetch Lead context for every Lead resource referenced in this page
  // of results, so the UI can render a name + phone + click-through link
  // without N+1 round-trips. paranoid:false so the link still works for soft-
  // deleted leads (admins can restore from the recycle bin).
  const leadIds = [...new Set(
    result.rows
      .filter((l) => l.resource === 'Lead' && l.resource_id)
      .map((l) => l.resource_id),
  )];
  const leads = leadIds.length
    ? await Lead.findAll({
        paranoid: false,
        where: { id: { [Op.in]: leadIds } },
        attributes: ['id', 'first_name', 'last_name', 'phone', 'lead_status', 'deletedAt'],
      })
    : [];
  const leadMap = Object.fromEntries(leads.map((l) => [l.id, l]));
  const userMap = Object.fromEntries(salesUsers.map((u) => [u.id, u]));

  const items = result.rows.map((log) => {
    const j = log.toJSON();
    const u = userMap[j.user_id];
    const lead = j.resource === 'Lead' ? leadMap[j.resource_id] : null;
    return {
      ...j,
      user_name: u ? `${u.first_name || ''} ${u.last_name || ''}`.trim() : 'Unknown',
      user_email: u?.email || null,
      user_role: u?.role || null,
      lead: lead
        ? {
            id: lead.id,
            name: `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || '—',
            phone: lead.phone,
            lead_status: lead.lead_status,
            deleted: Boolean(lead.deletedAt),
          }
        : null,
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

// GET /api/v1/audit-logs/all
// Unified, role-scoped activity log.
//
//   super_admin → sees every actor (including admins and other super_admins).
//   admin       → sees every actor EXCEPT super_admin and other admins.
//
// Optional filters: ?role=<role>, ?user_id=<uuid>, ?resource=<X>,
//   ?action=<X>, ?date_from=<iso>, ?date_to=<iso>, ?page, ?limit.
async function allActivity(req, res) {
  const viewer = req.user;
  if (!['super_admin', 'admin'].includes(viewer.role)) {
    return success(res, {
      items: [],
      pagination: { total: 0, page: 1, limit: 0, totalPages: 0 },
    });
  }

  const {
    role: roleFilter,
    user_id,
    resource,
    action,
    date_from,
    date_to,
    page = 1,
    limit = 50,
  } = req.query;

  // Build the actor allowlist based on viewer role. Admins are blocked from
  // seeing super_admin / admin activity; super_admin sees everyone.
  const visibleActorWhere = { paranoid: false };
  if (viewer.role === 'admin') {
    visibleActorWhere.where = {
      role: { [Op.notIn]: ['super_admin', 'admin'] },
    };
  } else {
    visibleActorWhere.where = {};
  }

  // Honor an optional ?role= filter, but intersect it with what the viewer is
  // allowed to see so an admin can't pass ?role=super_admin to bypass the
  // visibility rule.
  if (roleFilter) {
    const wantedRoles = String(roleFilter).split(',').map((r) => r.trim()).filter(Boolean);
    const allowedRoles = viewer.role === 'admin'
      ? wantedRoles.filter((r) => !['super_admin', 'admin'].includes(r))
      : wantedRoles;
    if (allowedRoles.length === 0) {
      return success(res, {
        items: [],
        pagination: { total: 0, page: 1, limit: parseInt(limit, 10), totalPages: 0 },
      });
    }
    visibleActorWhere.where.role = { [Op.in]: allowedRoles };
  }

  const visibleActors = await User.findAll({
    paranoid: false,
    where: visibleActorWhere.where,
    attributes: ['id', 'first_name', 'last_name', 'email', 'role'],
  });
  const actorIds = visibleActors.map((u) => u.id);

  if (actorIds.length === 0) {
    return success(res, {
      items: [],
      pagination: { total: 0, page: 1, limit: parseInt(limit, 10), totalPages: 0 },
    });
  }

  const where = { user_id: { [Op.in]: actorIds } };
  if (user_id) {
    if (!actorIds.includes(user_id)) {
      // Caller asked to filter to a user that's out of their visibility
      // scope — return empty rather than leak existence.
      return success(res, {
        items: [],
        pagination: { total: 0, page: 1, limit: parseInt(limit, 10), totalPages: 0 },
      });
    }
    where.user_id = user_id;
  }
  if (resource) where.resource = resource;
  if (action) where.action = action;
  if (date_from || date_to) {
    where.created_at = {};
    if (date_from) where.created_at[Op.gte] = new Date(date_from);
    if (date_to) where.created_at[Op.lte] = endOfDay(date_to);
  }

  const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
  const result = await AuditLog.findAndCountAll({
    where,
    limit: parseInt(limit, 10),
    offset,
    order: [['created_at', 'DESC']],
  });

  // Decorate with actor + (when applicable) lead context.
  const actorMap = Object.fromEntries(visibleActors.map((u) => [u.id, u]));
  const leadIds = [...new Set(
    result.rows
      .filter((l) => l.resource === 'Lead' && l.resource_id)
      .map((l) => l.resource_id),
  )];
  const leads = leadIds.length
    ? await Lead.findAll({
        paranoid: false,
        where: { id: { [Op.in]: leadIds } },
        attributes: ['id', 'first_name', 'last_name', 'phone', 'lead_status', 'deletedAt'],
      })
    : [];
  const leadMap = Object.fromEntries(leads.map((l) => [l.id, l]));

  const items = result.rows.map((log) => {
    const j = log.toJSON();
    const u = actorMap[j.user_id];
    const lead = j.resource === 'Lead' ? leadMap[j.resource_id] : null;
    return {
      ...j,
      user_name: u ? `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email : 'System',
      user_email: u?.email || null,
      user_role: u?.role || null,
      lead: lead
        ? {
            id: lead.id,
            name: `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || '—',
            phone: lead.phone,
            lead_status: lead.lead_status,
            deleted: Boolean(lead.deletedAt),
          }
        : null,
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
    visibility: {
      viewer_role: viewer.role,
      visible_actor_count: actorIds.length,
      excluded_roles: viewer.role === 'admin' ? ['super_admin', 'admin'] : [],
    },
  });
}

module.exports = { adminActions, leadHistory, salesActivity, allActivity };
