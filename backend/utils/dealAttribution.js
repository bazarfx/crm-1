const { User } = require('../models');

/**
 * Detect whether a lead transition should be treated as "the deal closed":
 *   - lead_status transitioning into 'ftd_done'
 *   - ftd_at being set on a lead that did not previously have one
 *
 * The result includes which conditions triggered, so callers can also
 * use it to attach closed_at on the same write.
 */
function detectFtdTransition({ oldLead, updates }) {
  const becameFtd =
    updates.lead_status === 'ftd_done' && oldLead.lead_status !== 'ftd_done';
  const newFtdAt = !!updates.ftd_at && !oldLead.ftd_at;
  return {
    triggered: becameFtd || newFtdAt,
    becameFtd,
    newFtdAt,
  };
}

/**
 * Resolve the user who should get credit for this close and return a
 * `{ closed_by_user_id, closed_by_name, closed_at }` payload ready to merge
 * into the lead update.
 *
 * Credit rules:
 *   1. The teleseller the lead is currently assigned to (the assignee did the work).
 *   2. If unassigned at close time, fall back to the actor making the request
 *      (an admin who manually marked it).
 *   3. If neither exists, leave nulls and let the analytics layer drop it.
 *
 * `closed_at` always reflects when the system observed the close — either the
 * incoming `ftd_at` value or `new Date()`.
 */
async function buildCloserSnapshot({ lead, updates, actorUser }) {
  const closerId = lead.assigned_to_id || actorUser?.id || null;
  let closerName = null;

  if (closerId) {
    // If the closer IS the actor we already have their name on the JWT user
    // object — skip the DB hit.
    if (actorUser && String(closerId) === String(actorUser.id)) {
      closerName = `${actorUser.first_name || ''} ${actorUser.last_name || ''}`.trim() || null;
    } else {
      const u = await User.findByPk(closerId, {
        attributes: ['first_name', 'last_name'],
        paranoid: false,
      });
      if (u) closerName = `${u.first_name || ''} ${u.last_name || ''}`.trim() || null;
    }
  }

  const closedAt = updates.ftd_at instanceof Date
    ? updates.ftd_at
    : (updates.ftd_at ? new Date(updates.ftd_at) : new Date());

  return {
    closed_by_user_id: closerId,
    closed_by_name: closerName,
    closed_at: closedAt,
  };
}

module.exports = { detectFtdTransition, buildCloserSnapshot };
