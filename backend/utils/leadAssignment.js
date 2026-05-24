const { Op } = require('sequelize');
const {
  sequelize,
  User,
  GroupMember,
  RRPointer,
} = require('../models');

const VALID_ROLES = { tele_sales: 'tele_sales', senior: 'senior' };

/**
 * Atomically pick the next user from candidates who speak `language`
 * for the given role. Optional group_id narrows the candidate pool to
 * active members of that group (only if at least one candidate is in
 * the group — otherwise falls back to the language pool).
 *
 * Returns { assignee, error, candidates }:
 *   • assignee = User instance OR null if no one matches
 *   • error    = human-readable reason when assignee is null
 *   • candidates = pool size considered (0 if none)
 */
async function assignLeadByLanguage({ language, group_id = null, role = 'tele_sales' }) {
  if (!language) return { assignee: null, error: 'language is required', candidates: 0 };
  if (!VALID_ROLES[role]) {
    return { assignee: null, error: `Invalid role for assignment: ${role}`, candidates: 0 };
  }

  return await sequelize.transaction(async (t) => {
    let candidates = await User.findAll({
      where: {
        role,
        is_active: true,
        languages: { [Op.contains]: [language] },
      },
      order: [['created_at', 'ASC']],
      transaction: t,
    });

    if (group_id && candidates.length > 0) {
      const memberships = await GroupMember.findAll({
        where: {
          group_id,
          user_id: { [Op.in]: candidates.map((u) => u.id) },
          is_active: true,
        },
        transaction: t,
      });
      const memberIds = new Set(memberships.map((m) => m.user_id));
      const filtered = candidates.filter((u) => memberIds.has(u.id));
      if (filtered.length > 0) candidates = filtered;
    }

    if (candidates.length === 0) {
      return {
        assignee: null,
        error: `No active ${role} speaks ${language}`,
        candidates: 0,
        reason: 'no_language_match',
      };
    }

    const scopeKey = `lang_${role}_${language}`;
    let pointer = await RRPointer.findOne({
      where: { scope_key: scopeKey },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!pointer) {
      pointer = await RRPointer.create(
        { scope_key: scopeKey, current_index: 0, total_assigned: 0 },
        { transaction: t },
      );
    }

    const idx = pointer.current_index % candidates.length;
    const chosen = candidates[idx];

    pointer.current_index = (pointer.current_index + 1) % candidates.length;
    pointer.total_assigned += 1;
    pointer.last_assigned_at = new Date();
    await pointer.save({ transaction: t });

    return {
      assignee: chosen,
      error: null,
      candidates: candidates.length,
      assigned_index: idx,
    };
  });
}

const assignToTeleseller = (language, group_id = null) =>
  assignLeadByLanguage({ language, group_id, role: 'tele_sales' });

const assignToSenior = (language) =>
  assignLeadByLanguage({ language, role: 'senior' });

module.exports = {
  assignLeadByLanguage,
  assignToTeleseller,
  assignToSenior,
};
