const { Op } = require('sequelize');
const { Parser } = require('json2csv');
const {
  sequelize,
  Lead,
  LeadActivity,
  User,
  Group,
  Campaign,
  AuditLog,
} = require('../models');
const { success, error, paginated } = require('../utils/responseHelper');

const TELE_SALES_LIMITED_FIELDS = [
  'lead_status', 'lead_category', 'preferred_language', 'contact_method',
  'trading_experience', 'current_platform', 'preferred_market',
  'whatsapp_number', 'new_whatsapp_number', 'last_contact_date',
  'last_interaction_date', 'is_dnd', 'dnd_at', 'is_reactive',
  'follow_ups_count', 'total_attempted_call_count', 'total_call_duration',
  'date_of_consent',
];

function visibilityWhere(user, base = {}) {
  if (user.role === 'tele_sales') {
    return { ...base, lead_owner_id: user.id };
  }
  if (user.role === 'senior') {
    // Seniors see leads in their language groups — we restrict by language list
    // populated via GroupMember in routes; for now allow ALL until we wire it.
    return base;
  }
  if (user.role === 'archive') {
    return { ...base, is_inactive: true };
  }
  return base;
}

async function list(req, res) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 25));
  const offset = (page - 1) * limit;
  const sortBy = req.query.sort_by || 'created_at';
  const sortOrder = (req.query.sort_order || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  const where = visibilityWhere(req.user, {});

  if (req.query.lead_status) where.lead_status = req.query.lead_status;
  if (req.query.language) where.language = req.query.language;
  if (req.query.campaign_id) where.campaign_id = req.query.campaign_id;
  if (req.query.group_id) where.group_id = req.query.group_id;
  if (req.query.lead_owner_id) where.lead_owner_id = req.query.lead_owner_id;
  if (req.query.is_dnd !== undefined) where.is_dnd = req.query.is_dnd === 'true';

  if (req.query.search) {
    const q = `%${req.query.search}%`;
    where[Op.or] = [
      { first_name: { [Op.iLike]: q } },
      { last_name: { [Op.iLike]: q } },
      { email: { [Op.iLike]: q } },
      { phone: { [Op.iLike]: q } },
      { ark_username: { [Op.iLike]: q } },
    ];
  }

  if (req.query.from || req.query.to) {
    where.created_at = {};
    if (req.query.from) where.created_at[Op.gte] = new Date(req.query.from);
    if (req.query.to) where.created_at[Op.lte] = new Date(req.query.to);
  }

  const { rows, count } = await Lead.findAndCountAll({
    where,
    order: [[sortBy, sortOrder]],
    limit,
    offset,
    include: [
      { model: User, as: 'owner', attributes: ['id', 'first_name', 'last_name', 'email'] },
      { model: Campaign, as: 'campaign', attributes: ['id', 'name', 'language'] },
      { model: Group, as: 'group', attributes: ['id', 'name', 'language'] },
    ],
  });

  return paginated(res, rows, { total: count, page, limit });
}

async function getOne(req, res) {
  const where = visibilityWhere(req.user, { id: req.params.id });
  const lead = await Lead.findOne({
    where,
    include: [
      { model: User, as: 'owner', attributes: ['id', 'first_name', 'last_name', 'email'] },
      { model: User, as: 'previousOwner', attributes: ['id', 'first_name', 'last_name', 'email'] },
      { model: Campaign, as: 'campaign' },
      { model: Group, as: 'group' },
      {
        model: LeadActivity,
        as: 'activities',
        include: [{ model: User, as: 'user', attributes: ['id', 'first_name', 'last_name', 'email'] }],
        order: [['created_at', 'DESC']],
        limit: 100,
      },
    ],
  });
  if (!lead) return error(res, 'Lead not found', 404);
  return success(res, lead);
}

async function create(req, res) {
  const body = req.body || {};
  if (!body.phone) return error(res, 'phone is required', 400);
  const lead = await Lead.create(body);
  await LeadActivity.create({
    lead_id: lead.id,
    user_id: req.user.id,
    activity_type: 'assignment',
    title: 'Lead manually created',
    description: `Created by ${req.user.email}`,
  });
  return success(res, lead, 'Created', 201);
}

async function update(req, res) {
  const where = visibilityWhere(req.user, { id: req.params.id });
  const lead = await Lead.findOne({ where });
  if (!lead) return error(res, 'Lead not found', 404);

  const fields = req.user.role === 'tele_sales' ? TELE_SALES_LIMITED_FIELDS : Object.keys(req.body);
  const changes = [];
  for (const f of fields) {
    if (req.body[f] === undefined) continue;
    if (req.user.role === 'tele_sales' && !TELE_SALES_LIMITED_FIELDS.includes(f)) continue;
    const oldVal = lead[f];
    const newVal = req.body[f];
    if (oldVal !== newVal) {
      changes.push({ field: f, old: oldVal, new: newVal });
      lead[f] = newVal;
    }
  }

  await lead.save();

  // Log status changes specifically
  const statusChange = changes.find((c) => c.field === 'lead_status');
  if (statusChange) {
    await LeadActivity.create({
      lead_id: lead.id,
      user_id: req.user.id,
      activity_type: 'status_change',
      title: `Status: ${statusChange.old} → ${statusChange.new}`,
      old_value: String(statusChange.old ?? ''),
      new_value: String(statusChange.new ?? ''),
    });
    await AuditLog.create({
      user_id: req.user.id,
      action: 'CHANGE_LEAD_STATUS',
      resource: 'Lead',
      resource_id: lead.id,
      old_data: { lead_status: statusChange.old },
      new_data: { lead_status: statusChange.new },
      ip_address: req.ip,
    });
  }

  return success(res, lead, 'Updated');
}

async function remove(req, res) {
  const lead = await Lead.findByPk(req.params.id);
  if (!lead) return error(res, 'Lead not found', 404);
  await lead.destroy();
  return success(res, null, 'Deleted');
}

async function assign(req, res) {
  const { user_id } = req.body || {};
  if (!user_id) return error(res, 'user_id is required', 400);

  const lead = await Lead.findByPk(req.params.id);
  if (!lead) return error(res, 'Lead not found', 404);

  const target = await User.findByPk(user_id);
  if (!target) return error(res, 'Target user not found', 404);

  const prev = lead.lead_owner_id;
  lead.previous_lead_owner_id = prev;
  lead.lead_owner_id = user_id;
  await lead.save();

  await LeadActivity.create({
    lead_id: lead.id,
    user_id: req.user.id,
    activity_type: 'assignment',
    title: `Assigned to ${target.email}`,
    old_value: prev || '',
    new_value: user_id,
  });

  await AuditLog.create({
    user_id: req.user.id,
    action: 'REASSIGN_LEAD',
    resource: 'Lead',
    resource_id: lead.id,
    old_data: { lead_owner_id: prev },
    new_data: { lead_owner_id: user_id, reason: req.body?.reason || null },
    ip_address: req.ip,
  });

  return success(res, lead, 'Assigned');
}

async function addNote(req, res) {
  const where = visibilityWhere(req.user, { id: req.params.id });
  const lead = await Lead.findOne({ where });
  if (!lead) return error(res, 'Lead not found', 404);

  const { title, description, metadata } = req.body || {};
  if (!description) return error(res, 'description is required', 400);

  const note = await LeadActivity.create({
    lead_id: lead.id,
    user_id: req.user.id,
    activity_type: 'note',
    title: title || 'Note',
    description,
    metadata: metadata || null,
  });
  return success(res, note, 'Note added', 201);
}

async function logCall(req, res) {
  const where = visibilityWhere(req.user, { id: req.params.id });
  const lead = await Lead.findOne({ where });
  if (!lead) return error(res, 'Lead not found', 404);

  const { call_duration, call_outcome, description } = req.body || {};

  const tx = await sequelize.transaction();
  try {
    const activity = await LeadActivity.create(
      {
        lead_id: lead.id,
        user_id: req.user.id,
        activity_type: 'call',
        title: `Call: ${call_outcome || 'logged'}`,
        description: description || null,
        call_duration: call_duration || 0,
        call_outcome: call_outcome || null,
        completed_at: new Date(),
      },
      { transaction: tx },
    );

    lead.total_attempted_call_count = (lead.total_attempted_call_count || 0) + 1;
    lead.total_call_duration = (lead.total_call_duration || 0) + (Number(call_duration) || 0);
    lead.last_contact_date = new Date();
    lead.last_interaction_date = new Date();
    await lead.save({ transaction: tx });

    await tx.commit();
    return success(res, activity, 'Call logged', 201);
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

async function exportCsv(req, res) {
  const where = visibilityWhere(req.user, {});
  const leads = await Lead.findAll({
    where,
    order: [['created_at', 'DESC']],
    limit: 10000,
  });

  const fields = [
    'id', 'first_name', 'last_name', 'email', 'phone', 'whatsapp_number',
    'lead_status', 'lead_source', 'language', 'campaign_name', 'ad_name',
    'ark_username', 'ark_account_number', 'deposited_amount', 'ftd_at',
    'lead_owner_id', 'created_at',
  ];
  const parser = new Parser({ fields });
  const csv = parser.parse(leads.map((l) => l.toJSON()));

  res.header('Content-Type', 'text/csv');
  res.attachment(`leads-${new Date().toISOString().slice(0, 10)}.csv`);
  return res.send(csv);
}

module.exports = {
  list, getOne, create, update, remove, assign, addNote, logCall, exportCsv,
};
