const { Op } = require('sequelize');
const {
  sequelize, Group, GroupMember, User, AuditLog,
} = require('../models');
const { success, error, paginated } = require('../utils/responseHelper');
const {
  processIncomingCustomFields,
  applyCustomFieldFilters,
  attachDefinitionsToResponse,
  isSkipValidationAllowed,
  recordBypassAudit,
} = require('../utils/customFieldIntegration');

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

  const finalWhere = applyCustomFieldFilters(where, req.query, 'Group');

  const { rows, count } = await Group.findAndCountAll({
    where: finalWhere,
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
  const allowSkip = isSkipValidationAllowed(req);
  const { custom_fields, errors: cfErrors, bypassed } =
    await processIncomingCustomFields('group', req.body || {}, null, { skip_validation: allowSkip });
  if (cfErrors.length) return error(res, cfErrors.join('; '), 400);
  const group = await Group.create({
    name,
    type,
    language,
    description,
    custom_fields,
    created_by: req.user.id,
  });
  if (bypassed) {
    await recordBypassAudit({
      AuditLog, req, resource: 'Group', resourceId: group.id, incoming: custom_fields,
    });
  }
  return success(res, group, 'Created', 201);
}

async function update(req, res) {
  const group = await Group.findByPk(req.params.id);
  if (!group) return error(res, 'Group not found', 404);
  const allowed = ['name', 'type', 'language', 'description', 'is_active'];
  for (const k of allowed) {
    if (req.body[k] !== undefined) group[k] = req.body[k];
  }
  let bypassed = false;
  if (req.body.custom_fields !== undefined) {
    const allowSkip = isSkipValidationAllowed(req);
    const result = await processIncomingCustomFields(
      'group',
      { custom_fields: req.body.custom_fields },
      group,
      { skip_validation: allowSkip },
    );
    if (result.errors.length) return error(res, result.errors.join('; '), 400);
    group.custom_fields = result.custom_fields;
    bypassed = !!result.bypassed;
  }
  await group.save();
  if (bypassed) {
    await recordBypassAudit({
      AuditLog, req, resource: 'Group', resourceId: group.id, incoming: group.custom_fields,
    });
  }
  return success(res, group, 'Updated');
}

async function getWithFieldDefs(req, res) {
  const group = await Group.findByPk(req.params.id, {
    include: [{
      model: User,
      as: 'members',
      attributes: ['id', 'first_name', 'last_name', 'email', 'role'],
      through: { attributes: ['rr_index', 'is_active', 'joined_at'] },
    }],
  });
  if (!group) return error(res, 'Group not found', 404);
  const enriched = await attachDefinitionsToResponse('group', group);
  return success(res, enriched);
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
  if (!['tele_sales', 'senior'].includes(user.role)) {
    return error(res, 'Only telesellers and seniors can be group members', 400);
  }

  const activeExisting = await GroupMember.findOne({
    where: { group_id: group.id, user_id, is_active: true },
  });
  if (activeExisting) {
    return error(res, `${user.first_name} is already in this group`, 409);
  }

  const existing = await GroupMember.findOne({
    where: { group_id: group.id, user_id },
    paranoid: false,
  });
  if (existing) {
    if (existing.deletedAt) await existing.restore();
    existing.is_active = true;
    await existing.save();
    return success(res, existing, 'Membership reactivated');
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
  return success(res, member, `${user.first_name} added to ${group.name}`, 201);
}

async function removeMember(req, res) {
  const { id } = req.params;
  // The route param is `:user_id` for the new spec; the legacy frontend
  // pathing used `:userId`. Accept either to avoid breaking existing callers.
  const userId = req.params.user_id || req.params.userId;
  if (!userId) return error(res, 'user_id is required', 400);
  const member = await GroupMember.findOne({ where: { group_id: id, user_id: userId } });
  if (!member) return error(res, 'Membership not found', 404);
  await member.destroy();
  return success(res, null, 'Member removed from group');
}

async function listMembers(req, res) {
  const memberships = await GroupMember.findAll({
    where: { group_id: req.params.id, is_active: true },
    include: [{
      model: User,
      as: 'user',
      attributes: ['id', 'first_name', 'last_name', 'email', 'role', 'languages', 'is_active'],
    }],
    order: [[{ model: User, as: 'user' }, 'first_name', 'ASC']],
  });

  // Filter out memberships whose user record has been soft-deleted (User is
  // paranoid; the include excludes soft-deleted rows by default).
  const filtered = memberships.filter((m) => m.user);

  return success(res, filtered.map((m) => ({
    membership_id: m.id,
    is_senior: m.user?.role === 'senior',
    user: m.user,
  })));
}

async function candidateMembers(req, res) {
  const { search, role, language, in_group } = req.query;
  const group_id = req.params.id;

  const existingMembers = await GroupMember.findAll({
    where: { group_id, is_active: true },
    attributes: ['user_id'],
    raw: true,
  });
  const existingIds = new Set(existingMembers.map((m) => m.user_id));

  // Optional `in_group` filter — restrict candidates to those who are already
  // active members of a specified other group. Combined with the `notIn`
  // existing-members filter, this lets a manager find e.g. "everyone in the
  // English group who isn't yet in this Tamil group".
  let restrictToIds = null;
  if (in_group) {
    const otherMembers = await GroupMember.findAll({
      where: { group_id: in_group, is_active: true },
      attributes: ['user_id'],
      raw: true,
    });
    restrictToIds = otherMembers.map((m) => m.user_id);
    // If the other group is empty, there can be no candidates from it.
    if (restrictToIds.length === 0) return success(res, []);
  }

  const where = {
    is_active: true,
    role: role ? role : { [Op.in]: ['tele_sales', 'senior'] },
  };

  // Compose id constraints. Both `restrictToIds` and `existingIds` may apply;
  // intersect at the JS layer so Sequelize gets a single id clause.
  if (restrictToIds) {
    const filtered = restrictToIds.filter((id) => !existingIds.has(id));
    if (filtered.length === 0) return success(res, []);
    where.id = { [Op.in]: filtered };
  } else if (existingIds.size > 0) {
    where.id = { [Op.notIn]: [...existingIds] };
  }

  if (language) where.languages = { [Op.contains]: [language] };
  if (search) {
    where[Op.or] = [
      { first_name: { [Op.iLike]: `%${search}%` } },
      { last_name: { [Op.iLike]: `%${search}%` } },
      { email: { [Op.iLike]: `%${search}%` } },
    ];
  }

  const candidates = await User.findAll({
    where,
    attributes: ['id', 'first_name', 'last_name', 'email', 'role', 'languages'],
    order: [['first_name', 'ASC']],
    limit: 100,
  });

  return success(res, candidates);
}

// Atomically move a member from one group to another. Recalculates rr_index
// in the destination so the new member joins at the end of the rotation.
// Restores a soft-deleted destination membership if one already exists (e.g.
// the user was previously in this group and got moved out).
async function moveMember(req, res) {
  if (!['super_admin', 'admin'].includes(req.user.role)) {
    return error(res, 'Only admin / super_admin can move members between groups', 403);
  }
  const { user_id, from_group_id, to_group_id } = req.body || {};
  if (!user_id || !from_group_id || !to_group_id) {
    return error(res, 'user_id, from_group_id, to_group_id are required', 400);
  }
  if (from_group_id === to_group_id) {
    return error(res, 'Source and destination groups are the same', 400);
  }

  const [user, fromGroup, toGroup] = await Promise.all([
    User.findByPk(user_id),
    Group.findByPk(from_group_id),
    Group.findByPk(to_group_id),
  ]);
  if (!user) return error(res, 'User not found', 404);
  if (!fromGroup) return error(res, 'Source group not found', 404);
  if (!toGroup) return error(res, 'Destination group not found', 404);

  const tx = await sequelize.transaction();
  try {
    const sourceMembership = await GroupMember.findOne({
      where: { group_id: from_group_id, user_id },
      transaction: tx,
    });
    if (!sourceMembership) {
      await tx.rollback();
      return error(res, 'User is not a member of source group', 404);
    }
    await sourceMembership.destroy({ transaction: tx });

    const existing = await GroupMember.findOne({
      where: { group_id: to_group_id, user_id },
      paranoid: false,
      transaction: tx,
    });
    let destination;
    if (existing) {
      if (existing.deletedAt) await existing.restore({ transaction: tx });
      existing.is_active = true;
      await existing.save({ transaction: tx });
      destination = existing;
    } else {
      const last = await GroupMember.findOne({
        where: { group_id: to_group_id },
        order: [['rr_index', 'DESC']],
        transaction: tx,
      });
      destination = await GroupMember.create(
        {
          group_id: to_group_id,
          user_id,
          rr_index: last ? last.rr_index + 1 : 0,
        },
        { transaction: tx },
      );
    }

    await tx.commit();

    try {
      await AuditLog.create({
        user_id: req.user.id,
        action: 'MOVE_GROUP_MEMBER',
        resource: 'GroupMember',
        resource_id: destination.id,
        old_data: { group_id: from_group_id, group_name: fromGroup.name },
        new_data: { group_id: to_group_id, group_name: toGroup.name, user_id },
        ip_address: req.ip,
      });
    } catch (auditErr) {
      // eslint-disable-next-line no-console
      console.error('audit log write failed for MOVE_GROUP_MEMBER', auditErr);
    }

    return success(res, destination, 'Member moved');
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

module.exports = {
  list, getOne, create, update, remove,
  addMember, removeMember, moveMember,
  listMembers, candidateMembers,
  getWithFieldDefs,
};
