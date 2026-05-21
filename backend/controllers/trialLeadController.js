const { faker } = require('@faker-js/faker');
const {
  Lead,
  User,
  Group,
  Campaign,
  LeadActivity,
  CampaignGroupAssignment,
} = require('../models');
const { assignLeadRoundRobin } = require('../utils/roundRobin');
const { success, error } = require('../utils/responseHelper');

const TRIAL_PASSWORD = null;

// GET /api/v1/trial-leads — list all trial leads
async function list(req, res) {
  const leads = await Lead.findAll({
    where: { is_trial: true },
    include: [
      { model: User, as: 'owner', attributes: ['id', 'first_name', 'last_name', 'native_language'] },
      { model: Group, as: 'group', attributes: ['id', 'name', 'language'] },
      { model: Campaign, as: 'campaign', attributes: ['id', 'name'] },
    ],
    order: [['created_at', 'DESC']],
  });
  return success(res, leads);
}

// Resolve a target group for assignment.
// Preference order:
//   1. explicit group_id from body
//   2. group linked to campaign via CampaignGroupAssignment (matching language if given)
//   3. any active telesales group with matching language
async function resolveGroupId({ group_id, campaign_id, language }) {
  if (group_id) return group_id;

  if (campaign_id) {
    const assignment = await CampaignGroupAssignment.findOne({
      where: { campaign_id, is_active: true },
      include: [{ model: Group, where: { is_active: true }, required: true }],
    });
    if (assignment?.Group) {
      if (!language || assignment.Group.language === language) {
        return assignment.Group.id;
      }
    }
  }

  if (language) {
    const grp = await Group.findOne({
      where: { language, is_active: true, type: 'telesales' },
    });
    if (grp) return grp.id;
  }

  return null;
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

// POST /api/v1/trial-leads — create one trial lead
async function create(req, res) {
  const {
    language,
    campaign_id,
    group_id,
    trial_label,
    trial_scenario,
    lead_status,
    auto_assign,
  } = req.body || {};

  const leadData = makeFakeLeadPayload({ language, lead_status, trial_label, trial_scenario });

  // Auto-assign via round robin if requested
  if (auto_assign) {
    const targetGroupId = await resolveGroupId({ group_id, campaign_id, language });
    if (targetGroupId) {
      try {
        const rr = await assignLeadRoundRobin(targetGroupId, campaign_id || null);
        leadData.lead_owner_id = rr.user.id;
        leadData.group_id = targetGroupId;
        leadData.campaign_id = campaign_id || null;
        if (campaign_id) {
          const camp = await Campaign.findByPk(campaign_id);
          leadData.campaign_name = camp?.name || null;
        }
      } catch (e) {
        console.warn('[trial] auto-assign failed:', e.message);
      }
    }
  } else if (group_id) {
    leadData.group_id = group_id;
    if (campaign_id) leadData.campaign_id = campaign_id;
  }

  const lead = await Lead.create(leadData);

  if (lead.lead_owner_id) {
    await LeadActivity.create({
      lead_id: lead.id,
      user_id: lead.lead_owner_id,
      activity_type: 'assignment',
      title: '[TRIAL] Lead assigned',
      description: `Trial lead auto-assigned via round robin. Scenario: ${trial_scenario || 'general_demo'}`,
    });
  }

  return success(res, lead, 'Trial lead created', 201);
}

// POST /api/v1/trial-leads/batch — create multiple trial leads at once (for demo)
async function createBatch(req, res) {
  const {
    count = 5,
    language,
    campaign_id,
    group_id,
    trial_scenario,
    auto_assign = true,
  } = req.body || {};
  const max = Math.min(Number(count) || 5, 20);

  const created = [];
  const assignmentLog = [];

  const targetGroupId = auto_assign
    ? await resolveGroupId({ group_id, campaign_id, language })
    : group_id || null;

  for (let i = 0; i < max; i++) {
    const leadData = makeFakeLeadPayload({
      language,
      trial_label: `Trial #${i + 1}`,
      trial_scenario: trial_scenario || 'round_robin_demo',
      idx: i,
    });

    if (auto_assign && targetGroupId) {
      try {
        const rr = await assignLeadRoundRobin(targetGroupId, campaign_id || null);
        leadData.lead_owner_id = rr.user.id;
        leadData.group_id = targetGroupId;
        leadData.campaign_id = campaign_id || null;
        assignmentLog.push({
          slot: i + 1,
          assigned_to: `${rr.user.first_name} ${rr.user.last_name}`,
          language: rr.user.native_language,
          rr_index: rr.state.current_index,
        });
      } catch (e) {
        console.warn(`[trial batch] slot ${i} failed:`, e.message);
        assignmentLog.push({ slot: i + 1, error: e.message });
      }
    } else if (targetGroupId) {
      leadData.group_id = targetGroupId;
      if (campaign_id) leadData.campaign_id = campaign_id;
    }

    const lead = await Lead.create(leadData);
    if (lead.lead_owner_id) {
      await LeadActivity.create({
        lead_id: lead.id,
        user_id: lead.lead_owner_id,
        activity_type: 'assignment',
        title: '[TRIAL] Batch assigned',
        description: `Batch trial lead. Round robin position ${i + 1} of ${max}.`,
      });
    }
    created.push(lead);
  }

  return success(res, {
    leads: created,
    assignment_log: assignmentLog,
    message: `${created.length} trial leads created${auto_assign ? ' and assigned via round robin' : ''}`,
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
