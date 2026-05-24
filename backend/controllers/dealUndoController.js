const { Op } = require('sequelize');
const {
  sequelize,
  Lead,
  LeadActivity,
  User,
  DealUndoRequest,
  AuditLog,
} = require('../models');
const { success, error } = require('../utils/responseHelper');

const isManagement = (role) =>
  ['super_admin', 'admin', 'floor_manager'].includes(role);
const isApprover = (role) =>
  ['super_admin', 'admin'].includes(role);

const INCLUDE = [
  {
    model: Lead,
    as: 'lead',
    attributes: [
      'id', 'first_name', 'last_name', 'phone', 'email', 'lead_status',
      'ftd_at', 'deposited_amount', 'closed_by_user_id', 'closed_by_name',
      'closed_at', 'assigned_to_id', 'campaign_id', 'group_id',
    ],
  },
  { model: User, as: 'requestedBy', attributes: ['id', 'first_name', 'last_name', 'role'] },
  { model: User, as: 'reviewedBy', attributes: ['id', 'first_name', 'last_name', 'role'] },
];

// ─── Create request ───────────────────────────────────────────────────────
// POST /deals/:id/undo-request
// Allowed: the closer of the deal or the current assignee. Admins file undo
// requests as direct lead edits — they don't need this flow.
async function create(req, res) {
  const leadId = req.params.id;
  const { reason } = req.body || {};

  if (!reason || !String(reason).trim()) {
    return error(res, 'reason is required', 400);
  }

  const lead = await Lead.findByPk(leadId);
  if (!lead) return error(res, 'Lead not found', 404);
  if (!lead.ftd_at) return error(res, 'Lead is not a deal yet — nothing to undo', 400);

  const isCloser = lead.closed_by_user_id && String(lead.closed_by_user_id) === String(req.user.id);
  const isAssignee = lead.assigned_to_id && String(lead.assigned_to_id) === String(req.user.id);
  if (!isCloser && !isAssignee && !isManagement(req.user.role)) {
    return error(res, 'You can only request undo for deals you closed or are assigned to', 403);
  }

  // One open request at a time per lead — keeps the reviewer queue clean.
  const existing = await DealUndoRequest.findOne({
    where: { lead_id: leadId, status: 'pending' },
  });
  if (existing) {
    return error(res, 'An undo request for this deal is already pending review', 409);
  }

  const snapshot = {
    lead_status: lead.lead_status,
    ftd_at: lead.ftd_at,
    deposited_amount: lead.deposited_amount,
    deposited_time: lead.deposited_time,
    closed_by_user_id: lead.closed_by_user_id,
    closed_by_name: lead.closed_by_name,
    closed_at: lead.closed_at,
    account_opened_at: lead.account_opened_at,
  };

  const request = await DealUndoRequest.create({
    lead_id: leadId,
    requested_by_user_id: req.user.id,
    reason: String(reason).trim(),
    status: 'pending',
    snapshot,
  });

  await LeadActivity.create({
    lead_id: leadId,
    user_id: req.user.id,
    activity_type: 'undo_requested',
    title: 'Deal undo requested',
    description: String(reason).trim(),
  });

  await AuditLog.create({
    user_id: req.user.id,
    action: 'REQUEST_DEAL_UNDO',
    resource: 'Lead',
    resource_id: leadId,
    new_data: { request_id: request.id, reason: String(reason).trim() },
    ip_address: req.ip,
  });

  const full = await DealUndoRequest.findByPk(request.id, { include: INCLUDE });
  return success(res, full, 'Undo request submitted for review', 201);
}

// ─── List ─────────────────────────────────────────────────────────────────
// GET /deals/undo-requests
// Admin / floor_manager / readers see all. Teleseller / senior see only
// requests they raised.
async function list(req, res) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  const offset = (page - 1) * limit;

  const where = {};
  if (req.query.status) where.status = req.query.status;

  if (!isManagement(req.user.role) && !['back_office', 'auditor'].includes(req.user.role)) {
    where.requested_by_user_id = req.user.id;
  }

  const { rows, count } = await DealUndoRequest.findAndCountAll({
    where,
    order: [['created_at', 'DESC']],
    limit,
    offset,
    include: INCLUDE,
  });

  return success(res, {
    items: rows,
    pagination: {
      total: count,
      page,
      limit,
      totalPages: Math.ceil(count / limit),
    },
  });
}

// ─── Approve (admin/super_admin only) ─────────────────────────────────────
// POST /deals/undo-requests/:requestId/approve
async function approve(req, res) {
  if (!isApprover(req.user.role)) {
    return error(res, 'Only admin or super_admin can approve undo requests', 403);
  }

  const request = await DealUndoRequest.findByPk(req.params.requestId);
  if (!request) return error(res, 'Undo request not found', 404);
  if (request.status !== 'pending') {
    return error(res, `Request is already ${request.status}`, 400);
  }

  const lead = await Lead.findByPk(request.lead_id);
  if (!lead) return error(res, 'Lead no longer exists', 404);

  const tx = await sequelize.transaction();
  try {
    const oldData = lead.toJSON();

    // Revert the deal: clear FTD markers and the frozen closer snapshot. We
    // intentionally do NOT touch assigned_to_id — handoff to a senior may
    // already have happened and reversing that is out of scope here.
    // lead_status drops back to 'account_opened' if the account was opened,
    // otherwise to 'contacted' — never to 'new', which would imply the lead
    // was never worked.
    const fallbackStatus = lead.account_opened_at ? 'account_opened' : 'contacted';
    await lead.update(
      {
        lead_status: fallbackStatus,
        ftd_at: null,
        deposited_amount: null,
        deposited_time: null,
        closed_by_user_id: null,
        closed_by_name: null,
        closed_at: null,
      },
      { transaction: tx },
    );

    await request.update(
      {
        status: 'approved',
        reviewed_by_user_id: req.user.id,
        reviewed_at: new Date(),
        review_notes: req.body?.notes || null,
      },
      { transaction: tx },
    );

    await LeadActivity.create(
      {
        lead_id: lead.id,
        user_id: req.user.id,
        activity_type: 'undo_approved',
        title: 'Deal undo approved',
        description: req.body?.notes || `Reverted by ${req.user.first_name || ''} ${req.user.last_name || ''}`.trim(),
        old_value: 'ftd_done',
        new_value: fallbackStatus,
      },
      { transaction: tx },
    );

    await AuditLog.create(
      {
        user_id: req.user.id,
        action: 'APPROVE_DEAL_UNDO',
        resource: 'Lead',
        resource_id: lead.id,
        old_data: oldData,
        new_data: lead.toJSON(),
        ip_address: req.ip,
      },
      { transaction: tx },
    );

    await tx.commit();
  } catch (e) {
    await tx.rollback();
    return error(res, `Approve failed: ${e.message}`, 500);
  }

  const full = await DealUndoRequest.findByPk(request.id, { include: INCLUDE });
  return success(res, full, 'Undo approved — deal reverted');
}

// ─── Reject (admin/super_admin only) ──────────────────────────────────────
async function reject(req, res) {
  if (!isApprover(req.user.role)) {
    return error(res, 'Only admin or super_admin can reject undo requests', 403);
  }

  const request = await DealUndoRequest.findByPk(req.params.requestId);
  if (!request) return error(res, 'Undo request not found', 404);
  if (request.status !== 'pending') {
    return error(res, `Request is already ${request.status}`, 400);
  }

  await request.update({
    status: 'rejected',
    reviewed_by_user_id: req.user.id,
    reviewed_at: new Date(),
    review_notes: req.body?.notes || null,
  });

  await LeadActivity.create({
    lead_id: request.lead_id,
    user_id: req.user.id,
    activity_type: 'undo_rejected',
    title: 'Deal undo rejected',
    description: req.body?.notes || 'Request reviewed and rejected',
  });

  await AuditLog.create({
    user_id: req.user.id,
    action: 'REJECT_DEAL_UNDO',
    resource: 'Lead',
    resource_id: request.lead_id,
    new_data: { request_id: request.id, notes: req.body?.notes || null },
    ip_address: req.ip,
  });

  const full = await DealUndoRequest.findByPk(request.id, { include: INCLUDE });
  return success(res, full, 'Undo request rejected');
}

// ─── Cancel (the original requester only) ─────────────────────────────────
// Lets a teleseller withdraw a request before it's reviewed.
async function cancel(req, res) {
  const request = await DealUndoRequest.findByPk(req.params.requestId);
  if (!request) return error(res, 'Undo request not found', 404);
  if (request.status !== 'pending') {
    return error(res, `Request is already ${request.status}`, 400);
  }
  if (String(request.requested_by_user_id) !== String(req.user.id) && !isApprover(req.user.role)) {
    return error(res, 'Only the requester or an admin can cancel this request', 403);
  }

  await request.update({
    status: 'cancelled',
    reviewed_by_user_id: req.user.id,
    reviewed_at: new Date(),
    review_notes: req.body?.notes || 'Withdrawn by requester',
  });

  await LeadActivity.create({
    lead_id: request.lead_id,
    user_id: req.user.id,
    activity_type: 'undo_cancelled',
    title: 'Deal undo cancelled',
    description: req.body?.notes || 'Withdrawn by requester',
  });

  const full = await DealUndoRequest.findByPk(request.id, { include: INCLUDE });
  return success(res, full, 'Undo request cancelled');
}

// ─── Pending count (for admin badge) ──────────────────────────────────────
async function pendingCount(req, res) {
  const count = await DealUndoRequest.count({ where: { status: 'pending' } });
  return success(res, { count });
}

module.exports = { create, list, approve, reject, cancel, pendingCount };
