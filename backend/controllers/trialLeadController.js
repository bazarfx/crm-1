const { faker } = require('@faker-js/faker');
const {
  Lead,
  User,
  Group,
  Campaign,
  LeadActivity,
} = require('../models');
const { autoAssignLead } = require('../utils/leadAutoAssign');
const { success, error } = require('../utils/responseHelper');
const {
  processIncomingCustomFields,
  isSkipValidationAllowed,
  recordBypassAudit,
} = require('../utils/customFieldIntegration');
const { AuditLog } = require('../models');

const TRIAL_PASSWORD = null;

// GET /api/v1/trial-leads — list all trial leads
async function list(req, res) {
  const leads = await Lead.findAll({
    where: { is_trial: true },
    include: [
      { model: User, as: 'assignedTo', attributes: ['id', 'first_name', 'last_name', 'languages'] },
      { model: Group, as: 'group', attributes: ['id', 'name', 'language'] },
      { model: Campaign, as: 'campaign', attributes: ['id', 'name'] },
    ],
    order: [['created_at', 'DESC']],
  });
  return success(res, leads);
}

function makeFakeLeadPayload({ language, lead_status, trial_label, trial_scenario, idx }) {
  const firstName = faker.person.firstName();
  const lastName = faker.person.lastName();
  const phone = `91${faker.string.numeric(10)}`;
  return {
    first_name: firstName,
    last_name: lastName,
    phone,
    whatsapp_number: phone,
    email: faker.internet.email({ firstName, lastName }).toLowerCase(),
    language: language || 'English',
    preferred_language: language || 'English',
    lead_status: lead_status || 'new',
    lead_source: 'facebook_ads',
    department: 'tele_sales',
    trading_experience: 'beginner',
    preferred_market: 'NSE Options',
    is_trial: true,
    trial_label: trial_label || `Trial Lead — ${firstName} ${lastName}`,
    trial_scenario: trial_scenario || 'general_demo',
    facebook_lead_id: `trial_${Date.now()}_${idx ?? 0}_${Math.random().toString(36).slice(2, 8)}`,
  };
}

// POST /api/v1/trial-leads — create one trial lead.
// Auto-assign via round robin is MANDATORY now — every lead entering the
// system must land on a teleseller. The legacy `auto_assign` flag is
// ignored (kept for back-compat with older clients that still send it).
async function create(req, res) {
  const {
    language,
    campaign_id,
    group_id,
    trial_label,
    trial_scenario,
    lead_status,
  } = req.body || {};

  const leadData = makeFakeLeadPayload({ language, lead_status, trial_label, trial_scenario });

  // Trial leads share the `lead` entity_type for custom_fields — same
  // registry, same validation. Reject fast if the schema patch is bad.
  const allowSkip = isSkipValidationAllowed(req);
  const { custom_fields, errors: cfErrors, bypassed } =
    await processIncomingCustomFields('lead', req.body || {}, null, { skip_validation: allowSkip });
  if (cfErrors.length) return error(res, cfErrors.join('; '), 400);
  leadData.custom_fields = custom_fields;

  let assignment = null;
  try {
    assignment = await autoAssignLead({
      lead_source: leadData.lead_source || 'facebook_ads',
      language,
      campaign_id,
      group_id,
    });
    leadData.assigned_to_id = assignment.assigned_to_id;
    leadData.group_id = assignment.group_id;
    leadData.campaign_id = assignment.campaign_id;
    if (assignment.campaign_name) leadData.campaign_name = assignment.campaign_name;
  } catch (e) {
    // If we genuinely can't assign (no telesales groups exist, no active
    // members anywhere), surface it instead of silently creating an orphan
    // lead — the operator can fix the group config and retry.
    return error(res, `Cannot create trial lead — ${e.message}`, 503);
  }

  const lead = await Lead.create(leadData);

  await LeadActivity.create({
    lead_id: lead.id,
    user_id: lead.assigned_to_id,
    activity_type: 'assignment',
    title: '[TRIAL] Lead auto-assigned',
    description: `Trial lead routed via round robin (${assignment.reason}). Scenario: ${trial_scenario || 'general_demo'}.`,
  });

  if (bypassed) {
    await recordBypassAudit({
      AuditLog, req, resource: 'Lead', resourceId: lead.id, incoming: leadData.custom_fields,
    });
  }

  return success(res, lead, 'Trial lead created and assigned', 201);
}

// POST /api/v1/trial-leads/batch — create multiple trial leads at once.
// Each slot runs RR independently so the rotation actually advances across
// the batch (otherwise every lead would go to the same agent). Auto-assign
// is mandatory.
async function createBatch(req, res) {
  const {
    count = 5,
    language,
    campaign_id,
    group_id,
    trial_scenario,
  } = req.body || {};
  const max = Math.min(Number(count) || 5, 20);

  const created = [];
  const assignmentLog = [];

  for (let i = 0; i < max; i++) {
    const leadData = makeFakeLeadPayload({
      language,
      trial_label: `Trial #${i + 1}`,
      trial_scenario: trial_scenario || 'round_robin_demo',
      idx: i,
    });

    try {
      const assignment = await autoAssignLead({
        lead_source: leadData.lead_source || 'facebook_ads',
        language,
        campaign_id,
        group_id,
      });
      leadData.assigned_to_id = assignment.assigned_to_id;
      leadData.group_id = assignment.group_id;
      leadData.campaign_id = assignment.campaign_id;
      if (assignment.campaign_name) leadData.campaign_name = assignment.campaign_name;

      const lead = await Lead.create(leadData);
      await LeadActivity.create({
        lead_id: lead.id,
        user_id: lead.assigned_to_id,
        activity_type: 'assignment',
        title: '[TRIAL] Batch auto-assigned',
        description: `Batch slot ${i + 1}/${max} routed via round robin (${assignment.reason}).`,
      });

      assignmentLog.push({
        slot: i + 1,
        assigned_to: `${assignment.assignee.first_name} ${assignment.assignee.last_name}`,
        language: (assignment.assignee.languages || [])[0] || null,
        group: assignment.group?.name,
        reason: assignment.reason,
      });
      created.push(lead);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(`[trial batch] slot ${i} failed:`, e.message);
      assignmentLog.push({ slot: i + 1, error: e.message });
      // Don't break the whole batch — let later slots try; if none succeed
      // the caller sees an empty `leads` array and the per-slot errors.
    }
  }

  return success(res, {
    leads: created,
    assignment_log: assignmentLog,
    message: `${created.length} trial leads created and assigned via round robin`,
  });
}

// DELETE /api/v1/trial-leads/:id — HARD DELETE (super_admin only)
async function deleteOne(req, res) {
  const lead = await Lead.findOne({ where: { id: req.params.id, is_trial: true } });
  if (!lead) return error(res, 'Trial lead not found', 404);
  await LeadActivity.destroy({ where: { lead_id: lead.id }, force: true });
  await lead.destroy({ force: true });
  return success(res, null, 'Trial lead permanently deleted');
}

// DELETE /api/v1/trial-leads/all — delete ALL trial leads (super_admin only)
async function deleteAll(req, res) {
  const leads = await Lead.findAll({ where: { is_trial: true }, attributes: ['id'] });
  const ids = leads.map((l) => l.id);
  if (ids.length === 0) return success(res, { deleted: 0 }, 'No trial leads to delete');
  await LeadActivity.destroy({ where: { lead_id: ids }, force: true });
  await Lead.destroy({ where: { id: ids, is_trial: true }, force: true });
  return success(res, { deleted: ids.length }, `${ids.length} trial leads deleted`);
}

module.exports = { list, create, createBatch, deleteOne, deleteAll };
