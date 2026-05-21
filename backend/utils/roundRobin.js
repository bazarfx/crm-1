const { Op } = require('sequelize');
const {
  sequelize,
  Group,
  GroupMember,
  RoundRobinState,
  User,
} = require('../models');

/**
 * Atomically pick the next teleseller in a group's round-robin rotation.
 *
 * Strategy: open a transaction, lock the RoundRobinState row for this
 * (group_id, campaign_id) pair, find the active member at current_index
 * modulo memberCount, advance the pointer, commit. If no RR row exists,
 * create one inside the transaction.
 *
 * Returns: { user, groupMember, state }
 * Throws if the group has no active members.
 */
async function assignLeadRoundRobin(groupId, campaignId = null, opts = {}) {
  const externalTx = opts.transaction || null;
  const tx = externalTx || (await sequelize.transaction());

  try {
    const members = await GroupMember.findAll({
      where: { group_id: groupId, is_active: true },
      include: [
        {
          model: User,
          where: { is_active: true, role: 'tele_sales' },
          required: true,
        },
      ],
      order: [['rr_index', 'ASC'], ['joined_at', 'ASC']],
      transaction: tx,
      lock: tx.LOCK.UPDATE,
    });

    if (members.length === 0) {
      throw new Error(`Group ${groupId} has no active teleseller members`);
    }

    let state = await RoundRobinState.findOne({
      where: {
        group_id: groupId,
        campaign_id: campaignId === null ? { [Op.is]: null } : campaignId,
      },
      transaction: tx,
      lock: tx.LOCK.UPDATE,
    });

    if (!state) {
      state = await RoundRobinState.create(
        {
          group_id: groupId,
          campaign_id: campaignId,
          current_index: 0,
          total_assigned: 0,
        },
        { transaction: tx },
      );
    }

    const idx = state.current_index % members.length;
    const chosen = members[idx];

    state.current_index = (idx + 1) % members.length;
    state.total_assigned += 1;
    state.last_assigned_user_id = chosen.user_id;
    state.last_assigned_at = new Date();
    await state.save({ transaction: tx });

    chosen.rr_index = state.current_index;
    await chosen.save({ transaction: tx });

    await User.update(
      { rr_last_assigned_at: new Date() },
      { where: { id: chosen.user_id }, transaction: tx },
    );

    if (!externalTx) await tx.commit();

    return {
      user: chosen.User,
      groupMember: chosen,
      state,
    };
  } catch (e) {
    if (!externalTx) await tx.rollback();
    throw e;
  }
}

module.exports = { assignLeadRoundRobin };
