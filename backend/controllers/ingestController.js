const { Op } = require('sequelize');
const {
  sequelize,
  Lead,
  LeadActivity,
  Campaign,
  Group,
  IngestLog,
  Setting,
} = require('../models');
const { success, error } = require('../utils/responseHelper');
const { verifyIngestToken, clientIp } = require('../utils/webhookVerifier');
const { routeLead } = require('../services/leadRouter');

// Small TTL cache so we don't hit Settings on every ingest call.
const SETTING_TTL_MS = 30 * 1000;
const settingCache = new Map();
async function getSetting(key, fallback) {
  const hit = settingCache.get(key);
  if (hit && Date.now() - hit.ts < SETTING_TTL_MS) return hit.value;
  const row = await Setting.findOne({ where: { key } });
  const value = row?.value ?? fallback;
  settingCache.set(key, { value, ts: Date.now() });
  return value;
}

/**
 * Best-effort field extraction from arbitrary Integrately payload shapes.
 */
function extract(payload) {
  const p = payload || {};
  const get = (...keys) => {
    for (const k of keys) {
      if (p[k] !== undefined && p[k] !== null && p[k] !== '') return p[k];
    }
    return null;
  };
  return {
    facebook_lead_id: get('facebook_lead_id', 'lead_id', 'leadgen_id', 'fb_lead_id'),
    phone: get('phone', 'phone_number', 'mobile', 'whatsapp_number'),
    email: get('email'),
    first_name: get('first_name', 'fname'),
    last_name: get('last_name', 'lname'),
    full_name: get('full_name', 'name'),
    campaign_name: get('campaign_name', 'campaign'),
    ad_set_name: get('ad_set_name', 'adset_name'),
    ad_name: get('ad_name'),
    ad_platform: get('ad_platform', 'platform') || 'facebook',
    language: get('language'),
    city: get('city'),
    state: get('state'),
    country: get('country') || 'India',
  };
}

async function ingest(req, res) {
  const ip = clientIp(req);
  const auth = verifyIngestToken(req);
  if (!auth.ok) {
    await IngestLog.create({
      raw_payload: req.body || {},
      source: 'integrately',
      status: 'error',
      error_message: auth.reason,
      ip_address: ip,
    });
    return error(res, auth.reason, 401);
  }

  // Hard kill-switch from settings.
  const ingestActive = await getSetting('system.ingest_active', { enabled: true });
  if (ingestActive?.enabled === false) {
    await IngestLog.create({
      raw_payload: req.body || {},
      source: 'integrately',
      status: 'error',
      error_message: 'Ingest disabled by system.ingest_active setting',
      ip_address: ip,
    });
    return error(res, 'Lead ingest is currently disabled', 503);
  }

  const payload = req.body || {};
  const data = extract(payload);

  if (!data.phone) {
    await IngestLog.create({
      raw_payload: payload,
      source: 'integrately',
      facebook_lead_id: data.facebook_lead_id,
      status: 'error',
      error_message: 'Missing phone',
      ip_address: ip,
    });
    return error(res, 'phone is required in payload', 400);
  }

  // Split full_name if first/last not given
  if (!data.first_name && data.full_name) {
    const parts = String(data.full_name).trim().split(/\s+/);
    data.first_name = parts.shift() || null;
    data.last_name = parts.join(' ') || null;
  }

  // Duplicate check
  const dupWhere = [{ phone: data.phone }];
  if (data.facebook_lead_id) dupWhere.push({ facebook_lead_id: data.facebook_lead_id });
  const existing = await Lead.findOne({ where: { [Op.or]: dupWhere } });
  if (existing) {
    await IngestLog.create({
      raw_payload: payload,
      source: 'integrately',
      facebook_lead_id: data.facebook_lead_id,
      phone: data.phone,
      matched_lead_id: existing.id,
      status: 'duplicate',
      ip_address: ip,
    });
    return success(
      res,
      { lead_id: existing.id, duplicate: true },
      'Duplicate — existing lead returned',
      200,
    );
  }

  // Find campaign by ILIKE name
  let campaign = null;
  if (data.campaign_name) {
    campaign = await Campaign.findOne({
      where: { name: { [Op.iLike]: data.campaign_name }, is_active: true },
    });
  }

  // Derive language from campaign if not in payload
  const language = data.language || campaign?.language || null;

  // Routing is now centralized in services/leadRouter.routeLead — it walks
  // admin-configured RoutingRules for (facebook_ads, language), then falls
  // back to language groups → language telesellers → any teleseller. The
  // legacy `assignment.mode = manual` setting is intentionally ignored:
  // every lead entering the system must land on an agent.
  let routerResult = null;
  let routerError = null;

  const tx = await sequelize.transaction();
  try {
    try {
      routerResult = await routeLead({
        lead_source: 'facebook_ads',
        language,
        campaign_id: campaign?.id || null,
        transaction: tx,
      });
    } catch (e) {
      routerError = e;
    }

    const ownerId = routerResult?.assignee?.id || null;
    const groupId = routerResult?.group_id || null;

    const lead = await Lead.create(
      {
        first_name: data.first_name,
        last_name: data.last_name,
        email: data.email,
        phone: data.phone,
        city: data.city,
        state: data.state,
        country: data.country,
        language,
        lead_source: 'facebook_ads',
        lead_status: 'new',
        campaign_name: data.campaign_name,
        ad_set_name: data.ad_set_name,
        ad_name: data.ad_name,
        ad_platform: data.ad_platform,
        facebook_lead_id: data.facebook_lead_id,
        source_raw: payload,
        assigned_to_id: ownerId,
        group_id: groupId,
        campaign_id: campaign?.id || null,
      },
      { transaction: tx },
    );

    await LeadActivity.create(
      {
        lead_id: lead.id,
        user_id: ownerId || (await getSystemUserId()),
        activity_type: 'assignment',
        title: ownerId
          ? `Assigned via ${routerResult?.reason || 'round robin'}`
          : `Unassigned — ${routerError?.message || 'router returned no target'}`,
        new_value: ownerId || null,
        metadata: {
          campaign_id: campaign?.id,
          group_id: groupId,
          router_reason: routerResult?.reason || null,
          router_error: routerError?.message || null,
        },
      },
      { transaction: tx },
    );

    await IngestLog.create(
      {
        raw_payload: payload,
        source: 'integrately',
        facebook_lead_id: data.facebook_lead_id,
        phone: data.phone,
        matched_lead_id: lead.id,
        status: 'created',
        assigned_to_user_id: ownerId,
        assigned_to_group_id: groupId,
        ip_address: ip,
      },
      { transaction: tx },
    );

    await tx.commit();
    return success(
      res,
      { lead_id: lead.id, assigned_to_id: ownerId, group_id: groupId, campaign_id: campaign?.id || null },
      'Lead ingested',
      201,
    );
  } catch (e) {
    await tx.rollback();
    await IngestLog.create({
      raw_payload: payload,
      source: 'integrately',
      facebook_lead_id: data.facebook_lead_id,
      phone: data.phone,
      status: 'error',
      error_message: e.message,
      ip_address: ip,
    });
    return error(res, `Ingest failed: ${e.message}`, 500);
  }
}

let cachedSystemUserId = null;
async function getSystemUserId() {
  if (cachedSystemUserId) return cachedSystemUserId;
  const { User } = require('../models');
  const sys = await User.findOne({ where: { role: 'super_admin' } });
  cachedSystemUserId = sys?.id || null;
  return cachedSystemUserId;
}

module.exports = { ingest };
