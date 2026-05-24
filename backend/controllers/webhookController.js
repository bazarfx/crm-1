const { sequelize, Lead, LeadActivity, ArkWebhookLog, User } = require('../models');
const { success, error } = require('../utils/responseHelper');
const { verifyArkWebhook, clientIp } = require('../utils/webhookVerifier');
const { buildCloserSnapshot } = require('../utils/dealAttribution');
const { assignToSenior } = require('../utils/leadAssignment');

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
  const arkAccount = pick(payload, 'ARK_AccountNumber', 'ARK_Account_Number', 'ark_account_number', 'account_number');
  const arkUid = pick(payload, 'ark_uid', 'uid');
  const eventType = detectEventType(payload);

  // Match lead by phone === ARK_Username (per CLAUDE.md)
  const lead = arkUsername
    ? await Lead.findOne({ where: { phone: String(arkUsername) } })
    : null;

  if (!lead) {
    // No existing lead found — treat this as a direct ARK signup. Create a
    // new lead with lead_source='direct_ark' and route it to a senior via
    // the language-scoped round robin. If no senior speaks the language,
    // the lead is still created but flagged as 'unassigned' for admin
    // review (matches the same fail-open behaviour as Meta Ads ingest).
    const fullName = pick(payload, 'Name', 'name', 'full_name', 'customer_name') || '';
    const [firstName, ...rest] = String(fullName || 'Direct ARK Client').split(/\s+/);
    const lastName = rest.join(' ') || '';
    const language = pick(payload, 'language', 'Language') || 'english';
    const location = pick(payload, 'location', 'city', 'Location');
    const accountOpenedAt = pick(
      payload,
      'Account_Opened_DateTime', 'account_opened_date', 'Account_Opened_Date',
    );
    const ftdAt = pick(payload, 'Ftd_DateTime', 'ftd_at', 'ftd_date');
    const depositAmount = pick(payload, 'deposited_amount', 'amount');
    const lastTermActivity = pick(payload, 'last_terminal_activity', 'Last_Terminal_Activity');

    const { assignee: senior, error: assignErr, candidates } =
      await assignToSenior(language);

    const tx2 = await sequelize.transaction();
    try {
      const newLead = await Lead.create(
        {
          first_name: firstName || 'Direct',
          last_name: lastName || 'ARK Client',
          phone: arkUsername ? String(arkUsername) : null,
          ark_username: arkUsername || null,
          ark_account_number: arkAccount || null,
          ark_uid: arkUid || null,
          account_opened_at: accountOpenedAt ? new Date(accountOpenedAt) : new Date(),
          account_opened_date: accountOpenedAt ? new Date(accountOpenedAt) : new Date(),
          last_terminal_activity_at: lastTermActivity ? new Date(lastTermActivity) : null,
          lead_status: senior ? (ftdAt ? 'ftd_done' : 'account_opened') : 'unassigned',
          lead_source: 'direct_ark',
          department: 'tele_sales',
          assigned_to_id: senior?.id || null,
          group_id: null,
          campaign_id: null,
          campaign_name: 'Direct ARK Signup',
          city: location || null,
          ftd_at: ftdAt ? new Date(ftdAt) : null,
          deposited_amount: depositAmount || null,
          language,
          preferred_language: language,
          total_attempted_call_count: 0,
          ark_raw: payload,
        },
        { transaction: tx2 },
      );

      const sysUserId = await getSystemUserId();
      await LeadActivity.create(
        {
          lead_id: newLead.id,
          user_id: senior?.id || sysUserId,
          activity_type: senior ? 'created' : 'unassigned',
          title: senior
            ? `Direct ARK client assigned to senior (${language})`
            : `Direct ARK client created without assignee (${language})`,
          description: senior
            ? `Senior ${senior.first_name} ${senior.last_name} assigned via round robin (${candidates} candidates).`
            : `No active senior speaks ${language}. Reason: ${assignErr}. Admin must manually assign.`,
          metadata: payload,
        },
        { transaction: tx2 },
      );

      await ArkWebhookLog.create(
        {
          raw_payload: payload,
          ark_username: arkUsername,
          ark_account_number: arkAccount,
          event_type: eventType,
          matched_lead_id: newLead.id,
          // Reuse 'matched' — the log now has a matched_lead_id (the lead we
          // just created). The activity log records whether assignment
          // happened. Avoids needing an enum migration.
          match_status: 'matched',
          processed_at: new Date(),
          ip_address: ip,
        },
        { transaction: tx2 },
      );

      await tx2.commit();
      return success(
        res,
        {
          matched: false,
          created: true,
          lead_id: newLead.id,
          assigned: !!senior,
          assigned_to: senior
            ? { id: senior.id, name: `${senior.first_name} ${senior.last_name}`.trim() }
            : null,
          language,
          candidates,
          lead_source: 'direct_ark',
          reason: assignErr || null,
        },
        senior
          ? 'Direct ARK client created and assigned to senior'
          : 'Direct ARK client created but no matching senior — needs manual assignment',
        201,
      );
    } catch (e) {
      await tx2.rollback();
      await ArkWebhookLog.create({
        raw_payload: payload,
        ark_username: arkUsername,
        ark_account_number: arkAccount,
        event_type: eventType,
        match_status: 'error',
        processed_at: new Date(),
        error_message: e.message,
        ip_address: ip,
      });
      return error(res, `Direct ARK create failed: ${e.message}`, 500);
    }
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

      // Snapshot the closer (current assignee) if not already set. ARK is
      // automated — no human actor — so we have no fallback if the lead is
      // unassigned at close time; closer just stays null.
      if (!lead.closed_by_user_id) {
        const snap = await buildCloserSnapshot({ lead, updates, actorUser: null });
        Object.assign(updates, snap);
      }
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
