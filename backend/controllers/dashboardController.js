const { Lead, User, Campaign, sequelize } = require('../models');
const { Op } = require('sequelize');
const { success, error } = require('../utils/responseHelper');

const isManagement = (role) => ['super_admin', 'admin', 'floor_manager'].includes(role);

const startOfDay = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const startOfWeek = () => {
  const d = new Date();
  const day = d.getDay();
  // Monday-first week: shift back to Monday (Sunday treated as previous week's tail).
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff); d.setHours(0, 0, 0, 0);
  return d;
};
const startOfMonth = () => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d; };

const yesterdayRange = () => {
  const start = new Date(); start.setDate(start.getDate() - 1); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setHours(23, 59, 59, 999);
  return [start, end];
};

exports.summary = async (req, res) => {
  try {
    // Paranoid soft-delete is the codebase convention — there is no
    // `is_deleted` column on Lead, so we let Sequelize's paranoid filter
    // exclude soft-deleted rows automatically.
    const today = startOfDay();
    const week = startOfWeek();
    const month = startOfMonth();
    const [yStart, yEnd] = yesterdayRange();

    const [
      leadsToday, leadsYesterday, leadsWeek, leadsMonth,
      dealsToday, dealsYesterday, dealsWeek, dealsMonth,
      depositsToday, depositsWeek, depositsMonth,
    ] = await Promise.all([
      Lead.count({ where: { createdAt: { [Op.gte]: today } } }),
      Lead.count({ where: { createdAt: { [Op.between]: [yStart, yEnd] } } }),
      Lead.count({ where: { createdAt: { [Op.gte]: week } } }),
      Lead.count({ where: { createdAt: { [Op.gte]: month } } }),
      Lead.count({ where: { ftd_at: { [Op.gte]: today } } }),
      Lead.count({ where: { ftd_at: { [Op.between]: [yStart, yEnd] } } }),
      Lead.count({ where: { ftd_at: { [Op.gte]: week } } }),
      Lead.count({ where: { ftd_at: { [Op.gte]: month } } }),
      Lead.sum('deposited_amount', { where: { ftd_at: { [Op.gte]: today } } }),
      Lead.sum('deposited_amount', { where: { ftd_at: { [Op.gte]: week } } }),
      Lead.sum('deposited_amount', { where: { ftd_at: { [Op.gte]: month } } }),
    ]);

    return success(res, {
      today: {
        leads: leadsToday,
        leads_delta_vs_yesterday: leadsToday - leadsYesterday,
        deals: dealsToday,
        deals_delta_vs_yesterday: dealsToday - dealsYesterday,
        deposits_total: parseFloat(depositsToday || 0),
      },
      this_week: {
        leads: leadsWeek,
        deals: dealsWeek,
        deposits_total: parseFloat(depositsWeek || 0),
      },
      this_month: {
        leads: leadsMonth,
        deals: dealsMonth,
        deposits_total: parseFloat(depositsMonth || 0),
      },
    });
  } catch (e) {
    console.error('Dashboard summary error:', e);
    return error(res, e.message, 500);
  }
};

exports.topPerformers = async (req, res) => {
  if (!isManagement(req.user.role)) {
    return error(res, 'Only management can view top performers', 403);
  }
  try {
    const { range = 'today', limit = 10 } = req.query;
    let since;
    if (range === 'today') since = startOfDay();
    else if (range === 'week') since = startOfWeek();
    else if (range === 'month') since = startOfMonth();
    else return error(res, 'range must be today, week, or month', 400);

    const ftdRows = await Lead.findAll({
      where: {
        ftd_at: { [Op.gte]: since },
        assigned_to_id: { [Op.ne]: null },
      },
      attributes: [
        'assigned_to_id',
        [sequelize.fn('COUNT', sequelize.col('id')), 'ftd_count'],
        [sequelize.fn('SUM', sequelize.col('deposited_amount')), 'total_deposit'],
      ],
      group: ['assigned_to_id'],
      having: sequelize.literal('COUNT(id) > 0'),
      order: [[sequelize.literal('ftd_count'), 'DESC']],
      raw: true,
    });

    const userIds = ftdRows.map((r) => r.assigned_to_id);
    if (userIds.length === 0) {
      return success(res, { range, since, items: [], total_telesellers_with_ftds: 0 });
    }

    const users = await User.findAll({
      where: { id: { [Op.in]: userIds }, role: { [Op.in]: ['tele_sales', 'senior'] } },
      attributes: ['id', 'first_name', 'last_name', 'languages', 'role', 'email', 'is_active'],
    });
    const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

    const leadCounts = await Lead.findAll({
      where: {
        assigned_to_id: { [Op.in]: userIds },
        createdAt: { [Op.gte]: since },
      },
      attributes: [
        'assigned_to_id',
        [sequelize.fn('COUNT', sequelize.col('id')), 'lead_count'],
      ],
      group: ['assigned_to_id'],
      raw: true,
    });
    const leadCountMap = Object.fromEntries(
      leadCounts.map((r) => [r.assigned_to_id, parseInt(r.lead_count, 10)]),
    );

    const filtered = ftdRows
      .filter((r) => userMap[r.assigned_to_id])
      .slice(0, parseInt(limit, 10))
      .map((r, idx) => {
        const u = userMap[r.assigned_to_id];
        return {
          rank: idx + 1,
          user_id: r.assigned_to_id,
          first_name: u.first_name,
          last_name: u.last_name,
          email: u.email,
          role: u.role,
          languages: u.languages || [],
          is_active: u.is_active,
          ftd_count: parseInt(r.ftd_count, 10),
          total_deposit: parseFloat(r.total_deposit || 0),
          leads_worked: leadCountMap[r.assigned_to_id] || 0,
        };
      });

    return success(res, {
      range,
      since,
      items: filtered,
      total_telesellers_with_ftds: ftdRows.length,
    });
  } catch (e) {
    console.error('Top performers error:', e);
    return error(res, e.message, 500);
  }
};

exports.topCampaigns = async (req, res) => {
  if (!isManagement(req.user.role)) {
    return error(res, 'Only management can view top campaigns', 403);
  }
  try {
    const { range = 'week', limit = 10 } = req.query;
    let since;
    if (range === 'today') since = startOfDay();
    else if (range === 'week') since = startOfWeek();
    else if (range === 'month') since = startOfMonth();
    else since = null;

    const baseWhere = { campaign_id: { [Op.ne]: null } };

    const totals = await Lead.findAll({
      where: since ? { ...baseWhere, createdAt: { [Op.gte]: since } } : baseWhere,
      attributes: [
        'campaign_id',
        [sequelize.fn('COUNT', sequelize.col('id')), 'leads'],
        [sequelize.fn('SUM', sequelize.literal('CASE WHEN ftd_at IS NOT NULL THEN 1 ELSE 0 END')), 'deals'],
        [sequelize.fn('SUM', sequelize.col('deposited_amount')), 'total_deposit'],
      ],
      group: ['campaign_id'],
      raw: true,
    });

    const enriched = totals
      .map((row) => {
        const leads = parseInt(row.leads, 10);
        const deals = parseInt(row.deals, 10);
        return {
          campaign_id: row.campaign_id,
          leads,
          deals,
          conversion_rate: leads > 0 ? Math.round((deals / leads) * 1000) / 10 : 0,
          total_deposit: parseFloat(row.total_deposit || 0),
        };
      })
      .filter((r) => r.leads > 0)
      .sort((a, b) => b.conversion_rate - a.conversion_rate)
      .slice(0, parseInt(limit, 10));

    const campaignIds = enriched.map((r) => r.campaign_id);
    const campaigns = campaignIds.length
      ? await Campaign.findAll({
        where: { id: { [Op.in]: campaignIds } },
        attributes: ['id', 'name', 'language', 'platform', 'status'],
      })
      : [];
    const campaignMap = Object.fromEntries(campaigns.map((c) => [c.id, c]));

    const items = enriched.map((r, idx) => {
      const c = campaignMap[r.campaign_id];
      return {
        rank: idx + 1,
        campaign_id: r.campaign_id,
        name: c?.name || 'Unknown campaign',
        language: c?.language,
        platform: c?.platform,
        status: c?.status,
        leads: r.leads,
        deals: r.deals,
        conversion_rate: r.conversion_rate,
        total_deposit: r.total_deposit,
      };
    });

    return success(res, { range, since, items });
  } catch (e) {
    console.error('Top campaigns error:', e);
    return error(res, e.message, 500);
  }
};
