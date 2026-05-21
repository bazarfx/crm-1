const { sequelize, Lead, LeadActivity, ArkWebhookLog, User } = require('../models');
const { success, error } = require('../utils/responseHelper');
const { verifyArkWebhook, clientIp } = require('../utils/webhookVerifier');

function detectEventType(payload) {
  const direct = payload?.event_type || payload?.event || payload?.type;
  if (direct) return String(direct).toLowerCase();
  if (payload?.ftd || payload?.first_time_deposit) return 'ftd';
  if (payload?.account_opened || payload?.account_open_date) return 'account_opened';
  return 'activity';
}

function pick(payload, ...keys) {
  for (const k of keys) {
    if (payload?.[k] !== undefined && payload[k] !== null && payload[k] !== '') return payload[k];
  }
  return null;
}

async function ark(req, res) {
  const ip = clientIp(req);
  const payload = req.body || {};
  const verification = verifyArkWebhook(req);

  if (!verification.ok) {
    await ArkWebhookLog.create({
      raw_payload: payload,
      ip_address: ip,
      match_status: 'error',
      error_message: verification.reason,
    });
    return error(res, verification.reason, 401);
  }

  const arkUsername = pick(payload, 'ARK_Username', 'ark_username', 'username', 'phone');
  const arkAccount = pick(payload, 'ARK_AccountNumber', 'ark_account_number', 'account_number');
  const eventType = detectEventType(payload);

  // Match lead by phone === ARK_Username (per CLAUDE.md)
  const lead = arkUsername
    ? await Lead.findOne({ where: { phone: String(arkUsername) } })
    : null;

  if (!lead) {
    await ArkWebhookLog.create({
      raw_payload: payload,
      ark_username: arkUsername,
      ark_account_number: arkAccount,
      event_type: eventType,
      match_status: 'unmatched',
      processed_at: new Date(),
      ip_address: ip,
    });
    return success(res, { matched: false }, 'Logged — unmatched', 202);
  }

  const tx = await sequelize.transaction();
  try {
    // Update non-empty ARK fields on the lead
    const updates = {
      ark_username: arkUsername || lead.ark_username,
      ark_account_number: arkAccount || lead.ark_account_number,
      ark_uid: pick(payload, 'ark_uid', 'uid') || lead.ark_uid,
      last_terminal_activity_at: new Date(),
      ark_raw: payload,
    };
    if (eventType === 'account_opened') {
      updates.account_opened_at = new Date();
      updates.account_opened_date = new Date();
      updates.lead_status = 'account_opened';
    }
    if (eventType === 'ftd') {
      const depAmt = pick(payload, 'deposited_amount', 'amount');
      const depTime = pick(payload, 'deposited_time', 'deposit_time');
      updates.ftd_at = new Date();
      if (depAmt !== null) updates.deposited_amount = depAmt;
      updates.deposited_time = depTime ? new Date(depTime) : new Date();
      updates.lead_status = 'ftd_done';
    }
    for (const k of Object.keys(updates)) {
      if (updates[k] !== undefined && updates[k] !== null) lead[k] = updates[k];
    }
    await lead.save({ transaction: tx });

    const sysUserId = await getSystemUserId();
    await LeadActivity.create(
      {
        lead_id: lead.id,
        user_id: sysUserId,
        activity_type: 'ark_event',
        title: `ARK ${eventType}`,
        description: `ARK terminal event: ${eventType}`,
        metadata: payload,
      },
      { transaction: tx },
    );

    await ArkWebhookLog.create(
      {
        raw_payload: payload,
        ark_username: arkUsername,
        ark_account_number: arkAccount,
        event_type: eventType,
        matched_lead_id: lead.id,
        match_status: 'matched',
        processed_at: new Date(),
        ip_address: ip,
      },
      { transaction: tx },
    );

    await tx.commit();
    return success(res, { matched: true, lead_id: lead.id, event_type: eventType }, 'ARK event processed');
  } catch (e) {
    await tx.rollback();
    await ArkWebhookLog.create({
      raw_payload: payload,
      ark_username: arkUsername,
      ark_account_number: arkAccount,
      event_type: eventType,
      matched_lead_id: lead.id,
      match_status: 'error',
      processed_at: new Date(),
      error_message: e.message,
      ip_address: ip,
    });
    return error(res, `ARK processing failed: ${e.message}`, 500);
  }
}

let cachedSystemUserId = null;
async function getSystemUserId() {
  if (cachedSystemUserId) return cachedSystemUserId;
  const sys = await User.findOne({ where: { role: 'super_admin' } });
  cachedSystemUserId = sys?.id || null;
  return cachedSystemUserId;
}

async function listArkLogs(req, res) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 25));
  const offset = (page - 1) * limit;
  const where = {};
  if (req.query.match_status) where.match_status = req.query.match_status;
  if (req.query.event_type) where.event_type = req.query.event_type;

  const { rows, count } = await ArkWebhookLog.findAndCountAll({
    where,
    order: [['created_at', 'DESC']],
    limit,
    offset,
    include: [{ model: Lead, as: 'lead', attributes: ['id', 'first_name', 'last_name', 'phone'] }],
  });
  return res.json({
    success: true,
    message: 'OK',
    data: rows,
    pagination: { total: count, page, limit, totalPages: Math.ceil(count / limit) },
  });
}

module.exports = { ark, listArkLogs };
