const { Op } = require('sequelize');
const { Campaign, Group, CampaignGroupAssignment, Lead } = require('../models');
const { success, error, paginated } = require('../utils/responseHelper');
const {
  processIncomingCustomFields,
  applyCustomFieldFilters,
  attachDefinitionsToResponse,
  isSkipValidationAllowed,
  recordBypassAudit,
} = require('../utils/customFieldIntegration');
const { AuditLog } = require('../models');

async function list(req, res) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const offset = (page - 1) * limit;

  const where = {};
  if (req.query.language) where.language = req.query.language;
  if (req.query.is_active !== undefined) where.is_active = req.query.is_active === 'true';
  if (req.query.search) where.name = { [Op.iLike]: `%${req.query.search}%` };

  const finalWhere = applyCustomFieldFilters(where, req.query, 'Campaign');

  const { rows, count } = await Campaign.findAndCountAll({
    where: finalWhere,
    order: [['created_at', 'DESC']],
    limit,
    offset,
    include: [
      {
        model: Group,
        as: 'groups',
        through: { attributes: ['is_active'] },
        attributes: ['id', 'name', 'language', 'type'],
      },
    ],
  });

  return paginated(res, rows, { total: count, page, limit });
}

async function getOne(req, res) {
  const campaign = await Campaign.findByPk(req.params.id, {
    include: [{ model: Group, as: 'groups', through: { attributes: ['is_active'] } }],
  });
  if (!campaign) return error(res, 'Campaign not found', 404);

  const leadCount = await Lead.count({ where: { campaign_id: campaign.id } });
  return success(res, { ...campaign.toJSON(), lead_count: leadCount });
}

async function create(req, res) {
  const body = req.body || {};
  if (!body.name) return error(res, 'name is required', 400);
  const allowSkip = isSkipValidationAllowed(req);
  const { custom_fields, errors: cfErrors, bypassed } =
    await processIncomingCustomFields('campaign', body, null, { skip_validation: allowSkip });
  if (cfErrors.length) return error(res, cfErrors.join('; '), 400);
  const campaign = await Campaign.create({ ...body, custom_fields, created_by: req.user.id });
  if (bypassed) {
    await recordBypassAudit({
      AuditLog, req, resource: 'Campaign', resourceId: campaign.id, incoming: custom_fields,
    });
  }
  return success(res, campaign, 'Created', 201);
}

async function update(req, res) {
  const campaign = await Campaign.findByPk(req.params.id);
  if (!campaign) return error(res, 'Campaign not found', 404);
  const allowed = [
    'name', 'ad_set_name', 'ad_name', 'platform', 'language',
    'is_active', 'start_date', 'end_date', 'budget',
  ];
  for (const k of allowed) {
    if (req.body[k] !== undefined) campaign[k] = req.body[k];
  }
  let bypassed = false;
  if (req.body.custom_fields !== undefined) {
    const allowSkip = isSkipValidationAllowed(req);
    const result = await processIncomingCustomFields(
      'campaign',
      { custom_fields: req.body.custom_fields },
      campaign,
      { skip_validation: allowSkip },
    );
    if (result.errors.length) return error(res, result.errors.join('; '), 400);
    campaign.custom_fields = result.custom_fields;
    bypassed = !!result.bypassed;
  }
  await campaign.save();
  if (bypassed) {
    await recordBypassAudit({
      AuditLog, req, resource: 'Campaign', resourceId: campaign.id, incoming: campaign.custom_fields,
    });
  }
  return success(res, campaign, 'Updated');
}

async function getWithFieldDefs(req, res) {
  const campaign = await Campaign.findByPk(req.params.id, {
    include: [{ model: Group, as: 'groups', through: { attributes: ['is_active'] } }],
  });
  if (!campaign) return error(res, 'Campaign not found', 404);
  const enriched = await attachDefinitionsToResponse('campaign', campaign);
  return success(res, enriched);
}

async function remove(req, res) {
  const campaign = await Campaign.findByPk(req.params.id);
  if (!campaign) return error(res, 'Campaign not found', 404);
  await campaign.destroy();
  return success(res, null, 'Deleted');
}

async function assignGroup(req, res) {
  const { group_id } = req.body || {};
  if (!group_id) return error(res, 'group_id is required', 400);

  const campaign = await Campaign.findByPk(req.params.id);
  if (!campaign) return error(res, 'Campaign not found', 404);
  const group = await Group.findByPk(group_id);
  if (!group) return error(res, 'Group not found', 404);

  const existing = await CampaignGroupAssignment.findOne({
    where: { campaign_id: campaign.id, group_id },
    paranoid: false,
  });
  if (existing) {
    if (existing.deletedAt) await existing.restore();
    existing.is_active = true;
    existing.assigned_by = req.user.id;
    await existing.save();
    return success(res, existing, 'Re-assigned');
  }

  const a = await CampaignGroupAssignment.create({
    campaign_id: campaign.id,
    group_id,
    assigned_by: req.user.id,
  });
  return success(res, a, 'Assigned', 201);
}

async function unassignGroup(req, res) {
  const { id, groupId } = req.params;
  const a = await CampaignGroupAssignment.findOne({
    where: { campaign_id: id, group_id: groupId },
  });
  if (!a) return error(res, 'Assignment not found', 404);
  await a.destroy();
  return success(res, null, 'Unassigned');
}

module.exports = {
  list, getOne, create, update, remove, assignGroup, unassignGroup,
  getWithFieldDefs,
};
