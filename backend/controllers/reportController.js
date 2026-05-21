const { Op, fn, col, literal } = require('sequelize');
const {
  sequelize,
  Lead,
  LeadActivity,
  User,
  Group,
  Campaign,
} = require('../models');
const { success } = require('../utils/responseHelper');

function dateRange(req) {
  const from = req.query.from ? new Date(req.query.from) : null;
  const to = req.query.to ? new Date(req.query.to) : null;
  const where = {};
  if (from || to) {
    where.created_at = {};
    if (from) where.created_at[Op.gte] = from;
    if (to) where.created_at[Op.lte] = to;
  }
  return where;
}

/**
 * Report 1 — Lead funnel by status
 */
async function leadFunnel(req, res) {
  const where = dateRange(req);
  const rows = await Lead.findAll({
    where,
    attributes: ['lead_status', [fn('COUNT', col('id')), 'count']],
    group: ['lead_status'],
    raw: true,
  });
  return success(res, rows);
}

/**
 * Report 2 — Conversion by language / market
 */
async function conversionByLanguage(req, res) {
  const where = dateRange(req);
  const rows = await Lead.findAll({
    where,
    attributes: [
      'language',
      [fn('COUNT', col('id')), 'total'],
      [fn('SUM', literal(`CASE WHEN lead_status = 'account_opened' THEN 1 ELSE 0 END`)), 'account_opened'],
      [fn('SUM', literal(`CASE WHEN lead_status = 'ftd_done' THEN 1 ELSE 0 END`)), 'ftd_done'],
      [fn('SUM', literal('COALESCE(deposited_amount, 0)')), 'total_deposits'],
    ],
    group: ['language'],
    raw: true,
  });
  return success(res, rows);
}

/**
 * Report 3 — Teleseller performance leaderboard
 */
async function tellerPerformance(req, res) {
  const where = dateRange(req);
  const rows = await Lead.findAll({
    where,
    attributes: [
      'lead_owner_id',
      [fn('COUNT', col('Lead.id')), 'leads_assigned'],
      [fn('SUM', literal(`CASE WHEN lead_status = 'account_opened' THEN 1 ELSE 0 END`)), 'accounts_opened'],
      [fn('SUM', literal(`CASE WHEN lead_status = 'ftd_done' THEN 1 ELSE 0 END`)), 'ftds'],
      [fn('SUM', literal('COALESCE(deposited_amount, 0)')), 'total_deposits'],
    ],
    include: [
      {
        model: User,
        as: 'owner',
        attributes: ['id', 'first_name', 'last_name', 'email', 'role'],
        where: { role: 'tele_sales' },
        required: true,
      },
    ],
    group: ['lead_owner_id', 'owner.id'],
    order: [[literal('ftds'), 'DESC']],
    raw: false,
  });
  return success(res, rows);
}

/**
 * Report 4 — Campaign ROI
 */
async function campaignROI(req, res) {
  const where = dateRange(req);
  const rows = await Lead.findAll({
    where,
    attributes: [
      'campaign_id',
      [fn('COUNT', col('Lead.id')), 'leads'],
      [fn('SUM', literal(`CASE WHEN lead_status = 'account_opened' THEN 1 ELSE 0 END`)), 'accounts_opened'],
      [fn('SUM', literal(`CASE WHEN lead_status = 'ftd_done' THEN 1 ELSE 0 END`)), 'ftds'],
      [fn('SUM', literal('COALESCE(deposited_amount, 0)')), 'total_deposits'],
    ],
    include: [
      { model: Campaign, as: 'campaign', attributes: ['id', 'name', 'language', 'budget'] },
    ],
    group: ['campaign_id', 'campaign.id'],
    raw: false,
  });
  return success(res, rows);
}

/**
 * Report 5 — Daily lead volume (trend)
 */
async function dailyVolume(req, res) {
  const where = dateRange(req);
  const rows = await Lead.findAll({
    where,
    attributes: [
      [fn('DATE', col('created_at')), 'day'],
      [fn('COUNT', col('id')), 'leads'],
      [fn('SUM', literal(`CASE WHEN lead_status = 'account_opened' THEN 1 ELSE 0 END`)), 'opened'],
      [fn('SUM', literal(`CASE WHEN lead_status = 'ftd_done' THEN 1 ELSE 0 END`)), 'ftd'],
    ],
    group: [literal('day')],
    order: [[literal('day'), 'ASC']],
    raw: true,
  });
  return success(res, rows);
}

/**
 * Report 6 — Activity heatmap (calls per user per day)
 */
async function callActivity(req, res) {
  const where = {
    activity_type: 'call',
    ...(req.query.from || req.query.to
      ? {
          completed_at: {
            ...(req.query.from && { [Op.gte]: new Date(req.query.from) }),
            ...(req.query.to && { [Op.lte]: new Date(req.query.to) }),
          },
        }
      : {}),
  };
  const rows = await LeadActivity.findAll({
    where,
    attributes: [
      'user_id',
      [fn('DATE', col('LeadActivity.completed_at')), 'day'],
      [fn('COUNT', col('LeadActivity.id')), 'calls'],
      [fn('SUM', col('call_duration')), 'duration_sec'],
    ],
    include: [
      { model: User, as: 'user', attributes: ['id', 'first_name', 'last_name', 'email'] },
    ],
    group: ['user_id', literal('day'), 'user.id'],
    order: [[literal('day'), 'DESC']],
    raw: false,
  });
  return success(res, rows);
}

/**
 * Report 7 — Group summary
 */
async function groupSummary(req, res) {
  const groups = await Group.findAll({
    include: [
      { association: 'members', attributes: ['id'], through: { attributes: ['is_active'] } },
      { association: 'leads', attributes: ['id', 'lead_status', 'deposited_amount'] },
    ],
  });
  const data = groups.map((g) => {
    const json = g.toJSON();
    const leads = json.leads || [];
    return {
      id: json.id,
      name: json.name,
      type: json.type,
      language: json.language,
      member_count: (json.members || []).length,
      lead_count: leads.length,
      account_opened: leads.filter((l) => l.lead_status === 'account_opened').length,
      ftd_done: leads.filter((l) => l.lead_status === 'ftd_done').length,
      total_deposits: leads.reduce((sum, l) => sum + Number(l.deposited_amount || 0), 0),
    };
  });
  return success(res, data);
}

/* ============================================================
 * DASHBOARD SUMMARY — shaped to match frontend /dashboard page
 * Returns { stats, pipeline, languages, sources, trend_30d,
 *          top_campaigns, last_leads } per role.
 * ============================================================ */
async function dashboardSummary(req, res) {
  const { role, id: userId } = req.user;

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const isTeleSales = role === 'tele_sales';
  const isManager = role === 'floor_manager' || role === 'senior';

  // ───── TELE SALES — own scope only ─────
  if (isTeleSales) {
    const ownWhere = { lead_owner_id: userId };

    const [myLeads, myCallsToday, myFtds, pipelineRows, lastLeads] = await Promise.all([
      Lead.count({ where: ownWhere }),
      LeadActivity.count({
        where: {
          user_id: userId,
          activity_type: 'call',
          created_at: { [Op.gte]: startOfDay },
        },
      }),
      Lead.count({ where: { ...ownWhere, ftd_at: { [Op.ne]: null } } }),
      Lead.findAll({
        where: ownWhere,
        attributes: ['lead_status', [fn('COUNT', col('id')), 'count']],
        group: ['lead_status'],
        raw: true,
      }),
      Lead.findAll({
        where: ownWhere,
        order: [['created_at', 'DESC']],
        limit: 5,
        attributes: ['id', 'first_name', 'last_name', 'lead_status', 'last_contact_date'],
      }),
    ]);

    return success(res, {
      stats: {
        my_leads: myLeads,
        my_calls_today: myCallsToday,
        my_ftds: myFtds,
      },
      pipeline: pipelineRows.map((r) => ({ status: r.lead_status, count: Number(r.count) })),
      languages: [],
      sources: [],
      trend_30d: [],
      top_campaigns: [],
      last_leads: lastLeads.map((l) => ({
        id: l.id,
        name: [l.first_name, l.last_name].filter(Boolean).join(' ') || '—',
        status: l.lead_status,
        last_contact_at: l.last_contact_date,
      })),
    });
  }

  // ───── MANAGER / ADMIN / READ-ONLY — company-wide ─────
  const [
    totalLeads,
    leadsToday,
    arkAccounts,
    totalFtds,
    teamCallsToday,
    pipelineRows,
    languageRows,
    sourceRows,
    trendRows,
    campaignRows,
    recentLeads,
  ] = await Promise.all([
    Lead.count(),
    Lead.count({ where: { created_at: { [Op.gte]: startOfDay } } }),
    Lead.count({ where: { ark_account_number: { [Op.ne]: null } } }),
    Lead.count({ where: { ftd_at: { [Op.ne]: null } } }),
    LeadActivity.count({
      where: {
        activity_type: 'call',
        created_at: { [Op.gte]: startOfDay },
      },
    }),
    Lead.findAll({
      attributes: ['lead_status', [fn('COUNT', col('id')), 'count']],
      group: ['lead_status'],
      raw: true,
    }),
    Lead.findAll({
      attributes: ['language', [fn('COUNT', col('id')), 'count']],
      where: { language: { [Op.ne]: null } },
      group: ['language'],
      order: [[literal('count'), 'DESC']],
      raw: true,
    }),
    Lead.findAll({
      attributes: ['lead_source', [fn('COUNT', col('id')), 'count']],
      group: ['lead_source'],
      order: [[literal('count'), 'DESC']],
      raw: true,
    }),
    Lead.findAll({
      attributes: [
        [fn('TO_CHAR', col('created_at'), 'YYYY-MM-DD'), 'date'],
        [fn('COUNT', col('id')), 'count'],
      ],
      where: { created_at: { [Op.gte]: thirtyDaysAgo } },
      group: [literal('date')],
      order: [[literal('date'), 'ASC']],
      raw: true,
    }),
    Lead.findAll({
      attributes: [
        'campaign_id',
        [fn('COUNT', col('Lead.id')), 'leads'],
        [fn('SUM', literal(`CASE WHEN lead_status IN ('account_opened','ftd_done') THEN 1 ELSE 0 END`)), 'conversions'],
      ],
      where: { campaign_id: { [Op.ne]: null } },
      include: [{ model: Campaign, as: 'campaign', attributes: ['id', 'name'] }],
      group: ['campaign_id', 'campaign.id'],
      order: [[literal('leads'), 'DESC']],
      limit: 5,
      subQuery: false,
    }),
    Lead.findAll({
      order: [['created_at', 'DESC']],
      limit: 5,
      attributes: ['id', 'first_name', 'last_name', 'lead_status', 'last_contact_date'],
    }),
  ]);

  const baseStats = {
    total_leads: totalLeads,
    leads_today: leadsToday,
    ark_accounts: arkAccounts,
    total_ftds: totalFtds,
  };

  const stats = isManager
    ? {
        ...baseStats,
        team_leads_today: leadsToday,
        team_calls: teamCallsToday,
        team_ftds: totalFtds,
      }
    : baseStats;

  return success(res, {
    stats,
    pipeline: pipelineRows.map((r) => ({ status: r.lead_status, count: Number(r.count) })),
    languages: languageRows.map((r) => ({ language: r.language, count: Number(r.count) })),
    sources: sourceRows.map((r) => ({ source: r.lead_source, count: Number(r.count) })),
    trend_30d: trendRows.map((r) => ({ date: r.date, count: Number(r.count) })),
    top_campaigns: campaignRows.map((r) => {
      const json = r.toJSON();
      return {
        name: json.campaign?.name || '—',
        leads: Number(json.leads || 0),
        conversions: Number(json.conversions || 0),
      };
    }),
    last_leads: recentLeads.map((l) => ({
      id: l.id,
      name: [l.first_name, l.last_name].filter(Boolean).join(' ') || '—',
      status: l.lead_status,
      last_contact_at: l.last_contact_date,
    })),
  });
}

/* ============================================================
 * FTD REPORT
 * ============================================================ */
async function ftdReport(req, res) {
  const { date_from, date_to, group_id, user_id } = req.query;
  const where = { ftd_at: { [Op.ne]: null } };
  if (date_from || date_to) {
    where.ftd_at = { [Op.ne]: null };
    const range = {};
    if (date_from) range[Op.gte] = new Date(date_from);
    if (date_to) range[Op.lte] = new Date(date_to);
    where.ftd_at = { ...range, [Op.ne]: null };
  }
  if (user_id) where.lead_owner_id = user_id;
  if (group_id) where.group_id = group_id;

  const leads = await Lead.findAll({
    where,
    include: [
      { model: User, as: 'owner', attributes: ['first_name', 'last_name'] },
      { model: Campaign, as: 'campaign', attributes: ['name'] },
    ],
    order: [['ftd_at', 'DESC']],
  });

  const totalAmount = leads.reduce((s, l) => s + Number(l.deposited_amount || 0), 0);
  const avgAmount = leads.length ? totalAmount / leads.length : 0;
  const daysBetween = (d1, d2) =>
    !d1 || !d2 ? 0 : Math.round(Math.abs(new Date(d2) - new Date(d1)) / 86400000);
  const avgDays = leads.length
    ? leads.reduce((s, l) => s + daysBetween(l.created_at, l.ftd_at), 0) / leads.length
    : 0;

  const buckets = { '0_10k': 0, '10k_50k': 0, '50k_1L': 0, 'above_1L': 0 };
  leads.forEach((l) => {
    const amt = Number(l.deposited_amount || 0);
    if (amt < 10000) buckets['0_10k']++;
    else if (amt < 50000) buckets['10k_50k']++;
    else if (amt < 100000) buckets['50k_1L']++;
    else buckets['above_1L']++;
  });

  return success(res, {
    summary: {
      total_ftd: leads.length,
      total_amount: Number(totalAmount.toFixed(2)),
      avg_amount: Number(avgAmount.toFixed(2)),
      avg_days_to_ftd: Number(avgDays.toFixed(1)),
      amount_buckets: buckets,
    },
    leads: leads.map((l) => ({
      id: l.id,
      lead_name: [l.first_name, l.last_name].filter(Boolean).join(' '),
      phone: l.phone,
      ftd_at: l.ftd_at,
      deposited_amount: l.deposited_amount,
      ark_account_number: l.ark_account_number,
      owner_name: l.owner ? `${l.owner.first_name} ${l.owner.last_name}` : null,
      campaign_name: l.campaign?.name,
      language: l.language,
      days_to_ftd: daysBetween(l.created_at, l.ftd_at),
    })),
  });
}

/* ============================================================
 * LEADS BY SOURCE
 * ============================================================ */
async function leadsBySource(req, res) {
  const where = dateRange(req);
  const rows = await Lead.findAll({
    where,
    attributes: [
      'lead_source',
      [fn('COUNT', col('id')), 'count'],
      [fn('SUM', literal(`CASE WHEN ftd_at IS NOT NULL THEN 1 ELSE 0 END`)), 'ftd_count'],
    ],
    group: ['lead_source'],
    order: [[literal('count'), 'DESC']],
    raw: true,
  });
  return success(
    res,
    rows.map((r) => ({
      source: r.lead_source,
      count: Number(r.count),
      ftd_count: Number(r.ftd_count),
      conversion_rate: Number(r.count)
        ? Number(((Number(r.ftd_count) / Number(r.count)) * 100).toFixed(1))
        : 0,
    })),
  );
}

/* ============================================================
 * ARK CONVERSION
 * ============================================================ */
async function arkConversion(req, res) {
  const [totalArk, totalFtd, pendingFtd, ftdLeads] = await Promise.all([
    Lead.count({ where: { ark_account_number: { [Op.ne]: null } } }),
    Lead.count({ where: { ftd_at: { [Op.ne]: null } } }),
    Lead.count({ where: { ark_account_number: { [Op.ne]: null }, ftd_at: null } }),
    Lead.findAll({
      where: { ftd_at: { [Op.ne]: null }, account_opened_at: { [Op.ne]: null } },
      attributes: ['account_opened_at', 'ftd_at', 'deposited_amount', 'lead_owner_id'],
      raw: true,
    }),
  ]);

  const daysBetween = (d1, d2) =>
    !d1 || !d2 ? 0 : Math.round(Math.abs(new Date(d2) - new Date(d1)) / 86400000);

  const avgDays = ftdLeads.length
    ? ftdLeads.reduce((s, l) => s + daysBetween(l.account_opened_at, l.ftd_at), 0) /
      ftdLeads.length
    : 0;

  const buckets = { '0_10k': 0, '10k_50k': 0, '50k_1L': 0, 'above_1L': 0 };
  ftdLeads.forEach((l) => {
    const amt = Number(l.deposited_amount || 0);
    if (amt < 10000) buckets['0_10k']++;
    else if (amt < 50000) buckets['10k_50k']++;
    else if (amt < 100000) buckets['50k_1L']++;
    else buckets['above_1L']++;
  });

  const converters = {};
  ftdLeads.forEach((l) => {
    if (!l.lead_owner_id) return;
    if (!converters[l.lead_owner_id]) converters[l.lead_owner_id] = { count: 0, amount: 0 };
    converters[l.lead_owner_id].count++;
    converters[l.lead_owner_id].amount += Number(l.deposited_amount || 0);
  });
  const ownerIds = Object.keys(converters);
  const owners = ownerIds.length
    ? await User.findAll({
        where: { id: { [Op.in]: ownerIds } },
        attributes: ['id', 'first_name', 'last_name'],
      })
    : [];
  const topConverters = owners
    .map((u) => ({
      name: `${u.first_name} ${u.last_name}`,
      ftd_count: converters[u.id].count,
      total_amount: Number(converters[u.id].amount.toFixed(2)),
    }))
    .sort((a, b) => b.total_amount - a.total_amount)
    .slice(0, 10);

  return success(res, {
    total_ark: totalArk,
    total_ftd: totalFtd,
    pending_ftd: pendingFtd,
    avg_days_account_to_ftd: Number(avgDays.toFixed(1)),
    amount_buckets: buckets,
    top_converters: topConverters,
  });
}

/* ============================================================
 * DAILY PIPELINE (single day breakdown)
 * ============================================================ */
async function dailyPipeline(req, res) {
  const dateStr = req.query.date || new Date().toISOString().slice(0, 10);
  const dayStart = new Date(`${dateStr}T00:00:00Z`);
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

  const dayRange = { [Op.gte]: dayStart, [Op.lt]: dayEnd };

  const [leadsReceived, callsMade, accountsOpened, ftdToday, hourly] = await Promise.all([
    Lead.count({ where: { created_at: dayRange } }),
    LeadActivity.count({ where: { activity_type: 'call', created_at: dayRange } }),
    Lead.count({ where: { account_opened_at: dayRange } }),
    Lead.count({ where: { ftd_at: dayRange } }),
    Lead.findAll({
      where: { created_at: dayRange },
      attributes: [
        [fn('EXTRACT', literal('HOUR FROM created_at')), 'hour'],
        [fn('COUNT', col('id')), 'count'],
      ],
      group: [literal('hour')],
      order: [[literal('hour'), 'ASC']],
      raw: true,
    }),
  ]);

  return success(res, {
    date: dateStr,
    leads_received: leadsReceived,
    calls_made: callsMade,
    accounts_opened: accountsOpened,
    ftd_today: ftdToday,
    hourly_breakdown: hourly.map((h) => ({ hour: Number(h.hour), count: Number(h.count) })),
  });
}

/* ============================================================
 * MY DASHBOARD — teleseller personal dashboard
 * Stats they personally care about: their leads, their calls,
 * their conversions, the groups they belong to.
 * ============================================================ */
async function myDashboard(req, res) {
  const userId = req.user.id;
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(startOfDay);
  startOfWeek.setDate(startOfDay.getDate() - startOfDay.getDay());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const ownLeadWhere = { lead_owner_id: userId };

  const [
    totalLeads,
    leadsThisMonth,
    leadsThisWeek,
    callTotal,
    callToday,
    statusBreakdown,
    callOutcomes,
    recentLeads,
    durationRow,
  ] = await Promise.all([
    Lead.count({ where: ownLeadWhere }),
    Lead.count({ where: { ...ownLeadWhere, created_at: { [Op.gte]: startOfMonth } } }),
    Lead.count({ where: { ...ownLeadWhere, created_at: { [Op.gte]: startOfWeek } } }),
    LeadActivity.count({ where: { user_id: userId, activity_type: 'call' } }),
    LeadActivity.count({
      where: {
        user_id: userId,
        activity_type: 'call',
        created_at: { [Op.gte]: startOfDay },
      },
    }),
    Lead.findAll({
      where: ownLeadWhere,
      attributes: ['lead_status', [fn('COUNT', col('id')), 'count']],
      group: ['lead_status'],
      raw: true,
    }),
    LeadActivity.findAll({
      where: { user_id: userId, activity_type: 'call', call_outcome: { [Op.ne]: null } },
      attributes: ['call_outcome', [fn('COUNT', col('id')), 'count']],
      group: ['call_outcome'],
      order: [[literal('count'), 'DESC']],
      raw: true,
    }),
    Lead.findAll({
      where: ownLeadWhere,
      order: [['updated_at', 'DESC']],
      limit: 10,
      attributes: [
        'id', 'first_name', 'last_name', 'phone',
        'lead_status', 'language', 'last_contact_date',
        'ftd_at', 'ark_account_number',
      ],
    }),
    Lead.findOne({
      where: ownLeadWhere,
      attributes: [[fn('SUM', col('total_call_duration')), 'total_duration']],
      raw: true,
    }),
  ]);

  const findCount = (status) => {
    const row = statusBreakdown.find((s) => s.lead_status === status);
    return Number(row?.count || 0);
  };
  const findOutcomeCount = (outcome) => {
    const row = callOutcomes.find((o) => o.call_outcome === outcome);
    return Number(row?.count || 0);
  };

  const ftdCount = findCount('ftd_done');
  const totalDurationSecs = Number(durationRow?.total_duration || 0);

  const overview = {
    total_leads: totalLeads,
    leads_this_month: leadsThisMonth,
    leads_this_week: leadsThisWeek,
    ftd_count: ftdCount,
    conversion_rate: totalLeads ? Number(((ftdCount / totalLeads) * 100).toFixed(1)) : 0,
    account_opened: findCount('account_opened'),
  };

  const callStats = {
    total_calls: callTotal,
    calls_today: callToday,
    interested: findOutcomeCount('interested'),
    not_interested: findOutcomeCount('not_interested'),
    no_answer: findOutcomeCount('no_answer'),
    busy: findOutcomeCount('busy'),
    call_back_pending: findCount('call_back'),
    total_duration_minutes: Math.round(totalDurationSecs / 60),
  };

  const groupStats = await getMyGroupStats(userId);

  return success(res, {
    overview,
    call_stats: callStats,
    call_outcomes: callOutcomes.map((o) => ({
      outcome: o.call_outcome,
      count: Number(o.count),
    })),
    status_breakdown: statusBreakdown.map((s) => ({
      status: s.lead_status,
      count: Number(s.count),
    })),
    recent_leads: recentLeads,
    group_stats: groupStats,
  });
}

// Helper: stats for every group this user belongs to.
async function getMyGroupStats(userId) {
  const { GroupMember } = require('../models');

  const memberships = await GroupMember.findAll({
    where: { user_id: userId, is_active: true },
    include: [{ model: Group, attributes: ['id', 'name', 'language'] }],
  });

  const out = [];
  for (const m of memberships) {
    const group = m.Group;
    if (!group) continue;

    const members = await GroupMember.findAll({
      where: { group_id: group.id, is_active: true },
      attributes: ['user_id'],
      raw: true,
    });
    const memberIds = members.map((x) => x.user_id);
    if (memberIds.length === 0) continue;

    const [totalLeads, ftdLeads, accountsOpened] = await Promise.all([
      Lead.count({ where: { lead_owner_id: { [Op.in]: memberIds } } }),
      Lead.count({
        where: { lead_owner_id: { [Op.in]: memberIds }, ftd_at: { [Op.ne]: null } },
      }),
      Lead.count({
        where: { lead_owner_id: { [Op.in]: memberIds }, ark_account_number: { [Op.ne]: null } },
      }),
    ]);

    const topRows = await Lead.findAll({
      where: { lead_owner_id: { [Op.in]: memberIds } },
      attributes: ['lead_owner_id', [fn('COUNT', col('id')), 'lead_count']],
      group: ['lead_owner_id'],
      order: [[literal('lead_count'), 'DESC']],
      limit: 3,
      raw: true,
    });
    const topUserIds = topRows.map((r) => r.lead_owner_id).filter(Boolean);
    const topUsers = topUserIds.length
      ? await User.findAll({
          where: { id: { [Op.in]: topUserIds } },
          attributes: ['id', 'first_name', 'last_name'],
          raw: true,
        })
      : [];
    const userMap = Object.fromEntries(topUsers.map((u) => [u.id, u]));
    const topPerformers = topRows.map((r) => {
      const u = userMap[r.lead_owner_id];
      return {
        name: u ? `${u.first_name} ${u.last_name}` : '—',
        leads: Number(r.lead_count),
      };
    });

    out.push({
      group_id: group.id,
      group_name: group.name,
      language: group.language,
      total_members: memberIds.length,
      total_leads: totalLeads,
      ftd_count: ftdLeads,
      accounts_opened: accountsOpened,
      conversion_rate: totalLeads
        ? Number(((ftdLeads / totalLeads) * 100).toFixed(1))
        : 0,
      top_performers: topPerformers,
    });
  }

  return out;
}

module.exports = {
  leadFunnel,
  conversionByLanguage,
  tellerPerformance,
  campaignROI,
  dailyVolume,
  callActivity,
  groupSummary,
  // ── new endpoints ──
  dashboardSummary,
  ftdReport,
  leadsBySource,
  arkConversion,
  dailyPipeline,
  myDashboard,
};
