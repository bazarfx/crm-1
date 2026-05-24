const { Op } = require('sequelize');
const {
  sequelize,
  RoutingRule,
  RRPointer,
  Group,
  GroupMember,
  User,
} = require('../models');
const { assignLeadRoundRobin } = require('../utils/roundRobin');

// ─── Internal: advance an RRPointer atomically ───────────────────────────
// Picks element at current_index % size, then increments. If the pointer row
// doesn't exist yet we create it. Caller passes the transaction.
async function pickByRR(scopeKey, items, transaction) {
  if (!items?.length) return null;

  let pointer = await RRPointer.findOne({
    where: { scope_key: scopeKey },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!pointer) {
    pointer = await RRPointer.create(
      { scope_key: scopeKey, current_index: 0, total_assigned: 0 },
      { transaction },
    );
  }

  const idx = pointer.current_index % items.length;
  const chosen = items[idx];

  pointer.current_index = (idx + 1) % items.length;
  pointer.total_assigned += 1;
  pointer.last_assigned_at = new Date();
  await pointer.save({ transaction });

  return chosen;
}

// ─── Step 1: admin-configured rules for this exact (source, language) ────
async function rulesFor(leadSource, language, transaction) {
  const rules = await RoutingRule.findAll({
    where: {
      lead_source: leadSource,
      language: language || null,
      is_active: true,
    },
    order: [['position', 'ASC'], ['created_at', 'ASC']],
    transaction,
  });
  return rules;
}

// ─── Step 2: rules for the source with language=null (apply-to-all) ──────
async function fallbackRulesFor(leadSource, transaction) {
  const rules = await RoutingRule.findAll({
    where: {
      lead_source: leadSource,
      language: null,
      is_active: true,
    },
    order: [['position', 'ASC'], ['created_at', 'ASC']],
    transaction,
  });
  return rules;
}

// ─── Step 3: language-matched telesales groups ───────────────────────────
async function languageGroups(language, transaction) {
  if (!language) return [];
  return Group.findAll({
    where: { language, is_active: true, type: 'telesales' },
    order: [['created_at', 'ASC']],
    transaction,
  });
}

// ─── Step 4: telesellers whose languages array contains the language ─────
async function languageTelesellers(language, transaction) {
  if (!language) return [];
  return User.findAll({
    where: {
      role: 'tele_sales',
      is_active: true,
      languages: { [Op.contains]: [language] },
    },
    attributes: ['id', 'first_name', 'last_name', 'languages', 'role'],
    order: [['created_at', 'ASC']],
    transaction,
  });
}

// ─── Helper: rule target → final assignee (+ group context if applicable) ─
// When the rule points at a GROUP, we still run intra-group RR via
// assignLeadRoundRobin so the teleseller picked respects the group's own
// rotation. When the rule points at a USER, that's the direct assignee.
async function resolveRuleTarget(rule, campaignId, transaction) {
  if (rule.target_type === 'group') {
    const group = await Group.findByPk(rule.target_id, { transaction });
    if (!group || !group.is_active) return null;
    try {
      const rr = await assignLeadRoundRobin(group.id, campaignId || null, { transaction });
      return { assignee: rr.user, group, via: `group:${group.name}` };
    } catch {
      // Group has no active members — let the caller try the next rule.
      return null;
    }
  }
  if (rule.target_type === 'user') {
    const user = await User.findByPk(rule.target_id, { transaction });
    if (!user || !user.is_active) return null;
    return { assignee: user, group: null, via: `user-direct:${user.first_name || user.id}` };
  }
  return null;
}

// ─── Main entry: routeLead ───────────────────────────────────────────────
// Returns { assignee, group, group_id, reason } or throws if every fallback
// is empty. The caller wraps the lead-create in the same transaction.
async function routeLead({ lead_source, language, campaign_id, transaction } = {}) {
  const externalTx = transaction || null;
  const tx = externalTx || (await sequelize.transaction());

  try {
    // ─ 1: admin rules for exact (source, language)
    if (lead_source) {
      const exact = await rulesFor(lead_source, language, tx);
      if (exact.length > 0) {
        // Walk the rotation; skip rules whose target is currently unusable
        // (deactivated group, member-less group, etc.) but advance the
        // pointer each time so the rotation stays fair.
        for (let attempt = 0; attempt < exact.length; attempt += 1) {
          const scope = `rule:${lead_source}:${language || '_'}`;
          const rule = await pickByRR(scope, exact, tx);
          const resolved = await resolveRuleTarget(rule, campaign_id, tx);
          if (resolved) {
            if (!externalTx) await tx.commit();
            return {
              ...resolved,
              group_id: resolved.group?.id || null,
              reason: `admin rule (${lead_source}/${language || 'any'}) → ${resolved.via}`,
            };
          }
        }
      }

      // ─ 2: source-only (language=null) rules
      const broad = await fallbackRulesFor(lead_source, tx);
      if (broad.length > 0) {
        for (let attempt = 0; attempt < broad.length; attempt += 1) {
          const scope = `rule:${lead_source}:_`;
          const rule = await pickByRR(scope, broad, tx);
          const resolved = await resolveRuleTarget(rule, campaign_id, tx);
          if (resolved) {
            if (!externalTx) await tx.commit();
            return {
              ...resolved,
              group_id: resolved.group?.id || null,
              reason: `admin rule (${lead_source}/any) → ${resolved.via}`,
            };
          }
        }
      }
    }

    // ─ 3: language-matched telesales groups, RR across groups then within
    const langGroups = await languageGroups(language, tx);
    if (langGroups.length > 0) {
      for (let attempt = 0; attempt < langGroups.length; attempt += 1) {
        const scope = `lang:${language}:groups`;
        const group = await pickByRR(scope, langGroups, tx);
        try {
          const rr = await assignLeadRoundRobin(group.id, campaign_id || null, { transaction: tx });
          if (!externalTx) await tx.commit();
          return {
            assignee: rr.user,
            group,
            group_id: group.id,
            reason: `language group ${group.name} (RR across ${langGroups.length} group${langGroups.length === 1 ? '' : 's'})`,
          };
        } catch {
          // Empty group — try the next one in the rotation.
        }
      }
    }

    // ─ 4: telesellers whose languages array contains the language — direct RR
    const langUsers = await languageTelesellers(language, tx);
    if (langUsers.length > 0) {
      const scope = `lang:${language}:users`;
      const user = await pickByRR(scope, langUsers, tx);
      if (!externalTx) await tx.commit();
      return {
        assignee: user,
        group: null,
        group_id: null,
        reason: `language teleseller (${language})`,
      };
    }

    // No language-aware route matched. Throw — callers (ingest, manual
    // create) catch this and create the lead as `unassigned` so admin
    // can dispatch it manually. We do NOT fall back to "any teleseller"
    // here, because routing a Tamil lead to an English-only agent is
    // worse than parking it in the unassigned queue.
    throw new Error(`No active teleseller speaks ${language || 'this language'}`);
  } catch (e) {
    if (!externalTx) await tx.rollback();
    throw e;
  }
}

module.exports = { routeLead };
