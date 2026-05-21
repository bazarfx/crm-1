const { Op } = require('sequelize');
const { Group, GroupMember, User } = require('../models');
const { success, error, paginated } = require('../utils/responseHelper');

async function list(req, res) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const offset = (page - 1) * limit;

  const where = {};
  if (req.query.type) where.type = req.query.type;
  if (req.query.language) where.language = req.query.language;
  if (req.query.is_active !== undefined) where.is_active = req.query.is_active === 'true';
  if (req.query.search) {
    where.name = { [Op.iLike]: `%${req.query.search}%` };
  }

  const { rows, count } = await Group.findAndCountAll({
    where,
    order: [['created_at', 'DESC']],
    limit,
    offset,
    include: [
      {
        model: User,
        as: 'members',
        attributes: ['id', 'first_name', 'last_name', 'email', 'role'],
        through: { attributes: ['rr_index', 'is_active', 'joined_at'] },
      },
    ],
  });

  return paginated(res, rows, { total: count, page, limit });
}

async function getOne(req, res) {
  const group = await Group.findByPk(req.params.id, {
    include: [
      {
        model: User,
        as: 'members',
        attributes: ['id', 'first_name', 'last_name', 'email', 'role'],
        through: { attributes: ['rr_index', 'is_active', 'joined_at'] },
      },
    ],
  });
  if (!group) return error(res, 'Group not found', 404);
  return success(res, group);
}

async function create(req, res) {
  const { name, type, language, description } = req.body || {};
  if (!name) return error(res, 'name is required', 400);
  const group = await Group.create({
    name,
    type,
    language,
    description,
    created_by: req.user.id,
  });
  return success(res, group, 'Created', 201);
}

async function update(req, res) {
  const group = await Group.findByPk(req.params.id);
  if (!group) return error(res, 'Group not found', 404);
  const allowed = ['name', 'type', 'language', 'description', 'is_active'];
  for (const k of allowed) {
    if (req.body[k] !== undefined) group[k] = req.body[k];
  }
  await group.save();
  return success(res, group, 'Updated');
}

async function remove(req, res) {
  const group = await Group.findByPk(req.params.id);
  if (!group) return error(res, 'Group not found', 404);
  await group.destroy();
  return success(res, null, 'Deleted');
}

async function addMember(req, res) {
  const { user_id } = req.body || {};
  if (!user_id) return error(res, 'user_id is required', 400);

  const group = await Group.findByPk(req.params.id);
  if (!group) return error(res, 'Group not found', 404);

  const user = await User.findByPk(user_id);
  if (!user) return error(res, 'User not found', 404);

  const existing = await GroupMember.findOne({
    where: { group_id: group.id, user_id },
    paranoid: false,
  });
  if (existing) {
    if (existing.deletedAt) await existing.restore();
    existing.is_active = true;
    await existing.save();
    return success(res, existing, 'Member re-activated');
  }

  const last = await GroupMember.findOne({
    where: { group_id: group.id },
    order: [['rr_index', 'DESC']],
  });

  const member = await GroupMember.create({
    group_id: group.id,
    user_id,
    rr_index: last ? last.rr_index + 1 : 0,
  });
  return success(res, member, 'Member added', 201);
}

async function removeMember(req, res) {
  const { id, userId } = req.params;
  const member = await GroupMember.findOne({ where: { group_id: id, user_id: userId } });
  if (!member) return error(res, 'Membership not found', 404);
  await member.destroy();
  return success(res, null, 'Member removed');
}

module.exports = { list, getOne, create, update, remove, addMember, removeMember };
