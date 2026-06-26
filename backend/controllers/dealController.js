const { Op } = require('sequelize');
const {
  sequelize,
  Lead,
  User,
  Group,
  Campaign,
} = require('../models');
const { success, error } = require('../utils/responseHelper');
const { applyCustomFieldFilters } = require('../utils/customFieldIntegration');

// A "deal" is just a Lead with ftd_at set — same table, different lens.
const ASSIGN_COL = 'assigned_to_id';

const isManagement = (role) =>
  ['super_admin', 'admin', 'floor_manager'].includes(role);
const isReadOnly = (role) => ['back_office', 'auditor'].includes(role);

// Telesellers / seniors see deals they CLOSED (closer attribution is the
// frozen snapshot — survives reassignment) OR deals currently assigned to
// them. Scoping by assigned_to alone strips closers of their own deals the
// moment the lead gets handed off (e.g., to a senior for onboarding) —
// which is exactly the case where admin still sees the deal but the
// teleseller's /deals page goes empty.
function buildScope(user) {
  if (isManagement(user.role) || isReadOnly(user.role)) return {};
  if (user.role === 'archive') return { is_inactive: true };
  return {
    [Op.or]: [
      { closed_by_user_id: user.id },
      { [ASSIGN_COL]: user.id },
    ],
  };
}

const INCLUDE_DEAL = [
  { model: User, as: 'assignedTo', attributes: ['id', 'first_name', 'last_name', 'role', 'languages'] },
  { model: User, as: 'closedBy', attributes: ['id', 'first_name', 'last_name', 'role'] },
  { model: Group, as: 'group', attributes: ['id', 'name', 'language'] },
  { model: Campaign, as: 'campaign', attributes: ['id', 'name', 'language'] },
];

// Shared WHERE builder — list + stats must agree, otherwise filtering the
// table would leave the stat tiles showing unrelated totals.
function buildWhere(req, { includeSearch = true } = {}) {
  const where = { ...buildScope(req.user), ftd_at: { [Op.ne]: null } };

  if (req.query.assignee_id) where[ASSIGN_COL] = req.query.assignee_id;
  if (req.query.closed_by_id) where.closed_by_user_id = req.query.closed_by_id;
  if (req.query.group_id) where.group_id = req.query.group_id;
  if (req.query.campaign_id) where.campaign_id = req.query.campaign_id;
  if (req.query.lead_source) where.lead_source = req.query.lead_source;
  if (req.query.language) where.language = req.query.language;

  if (req.query.ftd_from || req.query.ftd_to) {
    const range = { [Op.ne]: null };
    if (req.query.ftd_from) range[Op.gte] = new Date(req.query.ftd_from);
    if (req.query.ftd_to) range[Op.lte] = new Date(req.query.ftd_to);
    where.ftd_at = range;
  }

  if (req.query.deposit_min || req.query.deposit_max) {
    const dep = {};
    if (req.query.deposit_min) dep[Op.gte] = parseFloat(req.query.deposit_min);
    if (req.query.deposit_max) dep[Op.lte] = parseFloat(req.query.deposit_max);
    where.deposited_amount = dep;
  }

  if (includeSearch && req.query.search) {
    const q = `%${req.query.search}%`;
    where[Op.or] = [
      { first_name: { [Op.iLike]: q } },
      { last_name: { [Op.iLike]: q } },
      { phone: { [Op.iLike]: q } },
      { email: { [Op.iLike]: q } },
      { ark_username: { [Op.iLike]: q } },
      { ark_account_number: { [Op.iLike]: q } },
    ];
  }

  return where;
}

// ─── List ─────────────────────────────────────────────────────────────────
async function list(req, res) {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const offset = (page - 1) * limit;

    const allowedSorts = ['ftd_at', 'deposited_amount', 'first_name', 'last_contact_date', 'created_at'];
    const sortBy = allowedSorts.includes(req.query.sort_by) ? req.query.sort_by : 'ftd_at';
    const sortDir = (req.query.sort_dir || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    // Deals share the leads table — same JSONB blob, same cf_ filter
    // semantics as the leads list. Append cf_ predicates after the deal-
    // specific scope so they compose cleanly with assignee/source/etc.
    // Qualify with "Lead" because INCLUDE_DEAL joins users/groups/campaigns
    // (users now also has a custom_fields column).
    const where = await applyCustomFieldFilters(buildWhere(req), req.query, 'Lead', 'lead');

    const result = await Lead.findAndCountAll({
      where,
      order: [[sortBy, sortDir]],
      limit,
      offset,
      include: INCLUDE_DEAL,
    });

    return success(res, {
      items: result.rows,
      pagination: {
        total: result.count,
        page,
        limit,
        totalPages: Math.ceil(result.count / limit),
      },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('Deal list error:', e);
    return error(res, e.message || 'Failed to load deals', 500);
  }
}

// ─── Stats ────────────────────────────────────────────────────────────────
async function stats(req, res) {
  try {
    // Honor the same filters the list uses (group/language/campaign/etc.) so
    // the stat tiles + leaderboard reflect what's actually on screen. Skip
    // the free-text search — it filters individual rows, not aggregates.
    const where = buildWhere(req, { includeSearch: false });

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [total, totalDeposits, avgDeposit, todayCount, thisMonthCount] = await Promise.all([
      Lead.count({ where }),
      Lead.sum('deposited_amount', { where }),
      Lead.findOne({
        where,
        attributes: [[sequelize.fn('AVG', sequelize.col('deposited_amount')), 'avg']],
        raw: true,
      }),
      Lead.count({ where: { ...where, ftd_at: { [Op.gte]: startOfToday } } }),
      Lead.count({ where: { ...where, ftd_at: { [Op.gte]: startOfMonth } } }),
    ]);

    const bySource = await Lead.findAll({
      where,
      attributes: [
        'lead_source',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
        [sequelize.fn('SUM', sequelize.col('deposited_amount')), 'total'],
      ],
      group: ['lead_source'],
      raw: true,
    });

    // Leaderboard: who CLOSED the deals, not who currently owns them. Grouped
    // by the user FK + the denormalized name snapshot — so closers whose
    // accounts have since been deleted still show up by name.
    const byCloser = await Lead.findAll({
      where,
      attributes: [
        'closed_by_user_id',
        'closed_by_name',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
        [sequelize.fn('SUM', sequelize.col('deposited_amount')), 'total'],
      ],
      group: ['closed_by_user_id', 'closed_by_name'],
      order: [[sequelize.fn('SUM', sequelize.col('deposited_amount')), 'DESC']],
      limit: 10,
      raw: true,
    });

    const closerIds = byCloser.map((r) => r.closed_by_user_id).filter(Boolean);
    const closers = closerIds.length
      ? await User.findAll({
          where: { id: { [Op.in]: closerIds } },
          attributes: ['id', 'first_name', 'last_name', 'role'],
          paranoid: false, // include soft-deleted users — analytics needs them
        })
      : [];
    const closerMap = Object.fromEntries(closers.map((u) => [u.id, u.toJSON()]));

    return success(res, {
      total,
      totalDeposits: parseFloat(totalDeposits || 0),
      avgDeposit: parseFloat(avgDeposit?.avg || 0),
      todayCount,
      thisMonthCount,
      bySource: bySource.map((r) => ({
        source: r.lead_source,
        count: parseInt(r.count, 10),
        total: parseFloat(r.total || 0),
      })),
      byCloser: byCloser.map((r) => {
        const user = r.closed_by_user_id ? closerMap[r.closed_by_user_id] : null;
        const displayName =
          (user && `${user.first_name || ''} ${user.last_name || ''}`.trim())
          || r.closed_by_name
          || 'Unattributed';
        return {
          closer_id: r.closed_by_user_id,
          closer_name: displayName,
          closer_role: user?.role || null,
          user, // null when closer was deleted hard or never set
          count: parseInt(r.count, 10),
          total: parseFloat(r.total || 0),
        };
      }),
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('Deal stats error:', e);
    return error(res, e.message || 'Failed to load deal stats', 500);
  }
}

module.exports = { list, stats };
