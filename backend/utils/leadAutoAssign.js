const { Campaign, Group } = require('../models');
const { assignLeadRoundRobin } = require('./roundRobin');
const { routeLead } = require('../services/leadRouter');

/**
 * Auto-assign a new lead.
 *
 * Cascade (handled inside leadRouter.routeLead):
 *   1. Admin RoutingRule for (lead_source, language) — RR across rules
 *   2. Admin RoutingRule for (lead_source, *)        — RR across rules
 *   3. Telesales groups whose language matches       — RR group → RR member
 *   4. Telesellers whose languages array contains it — RR direct
 *
 * If none match, the router throws — callers create the lead as
 * `unassigned` so an admin can dispatch manually. There is no longer
 * an "any teleseller" fallback: routing a lead to an agent who doesn't
 * speak its language is worse than parking it.
 *
 * The caller can short-circuit step 1-5 by passing `group_id` directly —
 * useful for callers that already resolved a group (legacy ingest path).
 *
 * Returns a payload ready to merge into Lead.create() / lead.update():
 *   { assigned_to_id, group_id, campaign_id, campaign_name, assignee, group, reason }
 */
async function autoAssignLead({
  lead_source,
  language,
  campaign_id,
  group_id,
  transaction,
} = {}) {
  let campaignName = null;
  if (campaign_id) {
    const camp = await Campaign.findByPk(campaign_id);
    campaignName = camp?.name || null;
  }

  // Caller-provided group short-circuits the router — run intra-group RR.
  if (group_id) {
    const group = await Group.findByPk(group_id);
    if (!group || !group.is_active) {
      throw new Error(`Group ${group_id} is not active`);
    }
    const rr = await assignLeadRoundRobin(group_id, campaign_id || null, { transaction });
    return {
      assigned_to_id: rr.user.id,
      group_id,
      campaign_id: campaign_id || null,
      campaign_name: campaignName,
      assignee: rr.user,
      group,
      reason: `caller-provided group ${group.name}`,
    };
  }

  const result = await routeLead({ lead_source, language, campaign_id, transaction });
  return {
    assigned_to_id: result.assignee.id,
    group_id: result.group_id,
    campaign_id: campaign_id || null,
    campaign_name: campaignName,
    assignee: result.assignee,
    group: result.group,
    reason: result.reason,
  };
}

// Legacy export — some callers still import resolveTargetGroupId for the
// ingest path's pre-router group lookup. Keep it as a thin wrapper that
// only attempts the language-group / fallback layers (skip admin rules,
// which the new router handles).
async function resolveTargetGroupId({ group_id, language } = {}) {
  if (group_id) return group_id;
  if (language) {
    const langGroup = await Group.findOne({
      where: { language, is_active: true, type: 'telesales' },
    });
    if (langGroup) return langGroup.id;
  }
  const fallback = await Group.findOne({
    where: { is_active: true, type: 'telesales' },
    order: [['created_at', 'ASC']],
  });
  return fallback?.id || null;
}

module.exports = { autoAssignLead, resolveTargetGroupId };
