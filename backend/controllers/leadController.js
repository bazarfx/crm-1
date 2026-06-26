const { Op } = require('sequelize');
const { Parser } = require('json2csv');
const {
  sequelize,
  Lead,
  LeadActivity,
  User,
  Group,
  Campaign,
  AuditLog,
} = require('../models');
const { success, error, paginated } = require('../utils/responseHelper');
const { detectFtdTransition, buildCloserSnapshot } = require('../utils/dealAttribution');
const { assignLeadRoundRobin } = require('../utils/roundRobin');
const { autoAssignLead } = require('../utils/leadAutoAssign');
const {
  processIncomingCustomFields,
  applyCustomFieldFilters,
  attachDefinitionsToResponse,
  isSkipValidationAllowed,
  recordBypassAudit,
} = require('../utils/customFieldIntegration');

// ─── Assignment helpers ───────────────────────────────────────────────────
// Leads are ASSIGNED to a user — not owned. These helpers reflect that.

const isAssignedToMe = (user, lead) =>
  Boolean(
    user
    && lead
    && lead.assigned_to_id
    && String(lead.assigned_to_id) === String(user.id),
  );

// Frozen credit — set once at FTD time, survives reassignment. A teleseller
// who closed a deal and then handed it off must still be able to OPEN that
// deal from /deals; without this, the page links 403 the moment the lead
// has moved on.
const isClosedByMe = (user, lead) =>
  Boolean(
    user
    && lead
    && lead.closed_by_user_id
    && String(lead.closed_by_user_id) === String(user.id),
  );

const canAlwaysEdit = (user, lead) => {
  if (['super_admin', 'admin', 'floor_manager'].includes(user.role)) return true;
  if (user.role === 'tele_sales' && isAssignedToMe(user, lead)) return true;
  if (user.role === 'senior' && isAssignedToMe(user, lead)) return true;
  return false;
};

// Telesellers and seniors see leads currently assigned to them PLUS deals
// they were credited with closing (closer attribution is frozen at FTD time
// and must survive later reassignment — otherwise the teleseller loses
// visibility of their own closed deals).
// Admin / floor_manager / read-only roles see everything.
const buildScope = (user) => {
  if (['super_admin', 'admin', 'floor_manager', 'back_office', 'auditor'].includes(user.role)) {
    return {};
  }
  if (user.role === 'archive') {
    return { is_inactive: true };
  }
  return {
    [Op.or]: [
      { assigned_to_id: user.id },
      { closed_by_user_id: user.id },
    ],
  };
};

const INCLUDE_ASSIGNEE = [
  { model: User, as: 'assignedTo', attributes: ['id', 'first_name', 'last_name', 'email', 'languages', 'role'] },
  { model: Group, as: 'group', attributes: ['id', 'name', 'language'] },
  { model: Campaign, as: 'campaign', attributes: ['id', 'name', 'language'] },
];

// What tele_sales / senior are allowed to edit on their own leads.
const LIMITED_EDIT_FIELDS = [
  'lead_status', 'lead_category', 'preferred_language', 'contact_method',
  'trading_experience', 'current_platform', 'preferred_market',
  'whatsapp_number', 'new_whatsapp_number', 'last_contact_date',
  'last_interaction_date', 'is_dnd', 'dnd_at', 'is_reactive',
  'follow_ups_count', 'total_attempted_call_count', 'total_call_duration',
  'date_of_consent',
];

// ─── List ─────────────────────────────────────────────────────────────────
async function list(req, res) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  const offset = (page - 1) * limit;
  const sortBy = req.query.sort_by || 'created_at';
  const sortOrder = (req.query.sort_order || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  const where = { ...buildScope(req.user) };

  // Accept either a single value or a comma-separated list — the filter
  // drawer sends multi-select arrays as `?status=new,contacted` etc.
  const multi = (v) => {
    if (v === undefined || v === null || v === '') return undefined;
    if (Array.isArray(v)) return v.length > 1 ? { [Op.in]: v } : v[0];
    const parts = String(v).split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0) return undefined;
    return parts.length > 1 ? { [Op.in]: parts } : parts[0];
  };

  const statusFilter = multi(req.query.status || req.query.lead_status);
  if (statusFilter !== undefined) where.lead_status = statusFilter;
  const langFilter = multi(req.query.language);
  if (langFilter !== undefined) where.language = langFilter;
  const sourceFilter = multi(req.query.lead_source || req.query.source);
  if (sourceFilter !== undefined) where.lead_source = sourceFilter;
  if (req.query.campaign_id) where.campaign_id = req.query.campaign_id;
  if (req.query.group_id) where.group_id = req.query.group_id;
  if (req.query.is_dnd !== undefined) where.is_dnd = req.query.is_dnd === 'true';

  // assignee_id (new) — also accept legacy lead_owner_id / owner_id for back-compat
  const assigneeQ = req.query.assignee_id || req.query.assigned_to_id
    || req.query.lead_owner_id || req.query.owner_id;
  if (assigneeQ) where.assigned_to_id = assigneeQ;

  if (req.query.search) {
    const q = `%${req.query.search}%`;
    where[Op.or] = [
      { first_name: { [Op.iLike]: q } },
      { last_name: { [Op.iLike]: q } },
      { email: { [Op.iLike]: q } },
      { phone: { [Op.iLike]: q } },
      { ark_username: { [Op.iLike]: q } },
    ];
  }

  if (req.query.from || req.query.to) {
    where.created_at = {};
    if (req.query.from) where.created_at[Op.gte] = new Date(req.query.from);
    if (req.query.to) where.created_at[Op.lte] = new Date(req.query.to);
  }

  // Custom-field filters: any `cf_<field_key>=value` query param is
  // appended as a JSONB ->> predicate. Keys are whitelisted snake_case;
  // values are passed through sequelize.where with bind parameters.
  // Qualify with "Lead" because INCLUDE_ASSIGNEE joins users (which also
  // has a custom_fields column post-AA migration).
  const finalWhere = await applyCustomFieldFilters(where, req.query, 'Lead', 'lead');

  // `distinct: true` + `col: 'id'` makes Sequelize count distinct lead IDs
  // rather than the join-multiplied row count from INCLUDE_ASSIGNEE.
  // `subQuery: false` keeps LIMIT/OFFSET working with the includes — without
  // it Sequelize wraps the query in a subselect and the includes' WHERE
  // conditions silently drop. The combination is the canonical "don't
  // multiply rows from an include" pattern for findAndCountAll.
  const result = await Lead.findAndCountAll({
    where: finalWhere,
    order: [[sortBy, sortOrder]],
    limit,
    offset,
    include: INCLUDE_ASSIGNEE,
    distinct: true,
    col: 'id',
    subQuery: false,
  });

  // Spec test 1/2 expect `data.items` + `data.pagination`. paginated() puts rows
  // at top-level — return the spec-shaped envelope instead.
  return success(res, {
    items: result.rows,
    pagination: {
      total: result.count,
      page,
      limit,
      totalPages: Math.ceil(result.count / limit),
    },
  });
}

// ─── Get one ──────────────────────────────────────────────────────────────
async function getOne(req, res) {
  const lead = await Lead.findByPk(req.params.id, {
    include: [
      ...INCLUDE_ASSIGNEE,
      { model: User, as: 'previousAssignedTo', attributes: ['id', 'first_name', 'last_name', 'email'] },
      {
        model: LeadActivity,
        as: 'activities',
        include: [{ model: User, as: 'user', attributes: ['id', 'first_name', 'last_name', 'email'] }],
        order: [['created_at', 'DESC']],
        limit: 100,
        required: false,
      },
    ],
  });
  if (!lead) return error(res, 'Lead not found', 404);

  if ((req.user.role === 'tele_sales' || req.user.role === 'senior')
      && !isAssignedToMe(req.user, lead)
      && !isClosedByMe(req.user, lead)) {
    return error(res, 'You can only view leads assigned to you or deals you closed', 403);
  }
  return success(res, lead);
}

// ─── Create ───────────────────────────────────────────────────────────────
// Every lead entering the system gets routed via round robin. If the caller
// explicitly passes an assigned_to_id (admin override) we honour it and skip
// RR. Otherwise we auto-assign based on language → campaign → fallback so
// leads can never land in the unassigned pool.
async function create(req, res) {
  const body = { ...req.body };
  // Accept legacy field name from older clients.
  if (body.lead_owner_id && !body.assigned_to_id) body.assigned_to_id = body.lead_owner_id;
  delete body.lead_owner_id;

  if (!body.phone) return error(res, 'phone is required', 400);

  // Idempotency guard: if an active lead with this phone (or facebook_lead_id)
  // already exists, return it instead of double-creating. The partial unique
  // index on leads(phone) WHERE deleted_at IS NULL would also block the insert,
  // but the explicit check gives the caller a clean 200 + existing row payload
  // rather than a 500 from a constraint violation.
  const dupOr = [{ phone: body.phone }];
  if (body.facebook_lead_id) dupOr.push({ facebook_lead_id: body.facebook_lead_id });
  const dup = await Lead.findOne({ where: { [Op.or]: dupOr } });
  if (dup) {
    return success(res, dup, 'Lead already exists — returning existing row', 200);
  }

  // Validate + coerce any custom_fields payload BEFORE auto-assigning, so a
  // bad schema patch rejects fast without burning a round-robin slot.
  // super_admin / schema_editor can pass ?skip_validation=true to bypass
  // (heavily audit-logged below) — anyone else gets the validated path.
  const allowSkipCreate = isSkipValidationAllowed(req);
  const { custom_fields, errors: cfErrors, bypassed: bypassedCreate } =
    await processIncomingCustomFields('lead', body, null, { skip_validation: allowSkipCreate });
  if (cfErrors.length) return error(res, cfErrors.join('; '), 400);
  body.custom_fields = custom_fields;

  let assignmentReason = null;
  if (!body.assigned_to_id) {
    try {
      const assignment = await autoAssignLead({
        lead_source: body.lead_source || 'manual',
        language: body.language,
        campaign_id: body.campaign_id,
        group_id: body.group_id,
      });
      body.assigned_to_id = assignment.assigned_to_id;
      body.group_id = assignment.group_id;
      if (assignment.campaign_id && !body.campaign_id) body.campaign_id = assignment.campaign_id;
      if (assignment.campaign_name && !body.campaign_name) body.campaign_name = assignment.campaign_name;
      assignmentReason = assignment.reason;
      if (!body.lead_status) body.lead_status = 'new';
    } catch (e) {
      // No matching agent anywhere — still create the lead, mark it
      // unassigned so admin can pick it up via /leads?lead_status=unassigned.
      body.assigned_to_id = null;
      body.lead_status = 'unassigned';
      assignmentReason = `no auto-assign target (${e.message})`;
    }
  } else {
    assignmentReason = 'caller-supplied assignee';
    if (!body.lead_status) body.lead_status = 'new';
  }

  const lead = await Lead.create(body);
  await LeadActivity.create({
    lead_id: lead.id,
    user_id: req.user.id,
    activity_type: 'assignment',
    title: 'Lead manually created',
    description: `Created by ${req.user.email}. Assigned via ${assignmentReason}.`,
  });
  await AuditLog.create({
    user_id: req.user.id,
    action: 'CREATE',
    resource: 'Lead',
    resource_id: lead.id,
    new_data: lead.toJSON(),
    ip_address: req.ip,
  });

  if (bypassedCreate) {
    await recordBypassAudit({
      AuditLog, req, resource: 'Lead', resourceId: lead.id, incoming: body.custom_fields,
    });
  }
  return success(res, lead, 'Lead created', 201);
}

// ─── Update (general PATCH /:id) ──────────────────────────────────────────
async function update(req, res) {
  const lead = await Lead.findByPk(req.params.id);
  if (!lead) return error(res, 'Lead not found', 404);
  if (!canAlwaysEdit(req.user, lead)) {
    return error(res, 'You can only edit leads assigned to you', 403);
  }

  // `language` is derived from the campaign at ingest and frozen for the
  // lifetime of the lead — telesellers/admins edit `preferred_language` for
  // the customer's choice instead. Changing language post-ingest would
  // detach the lead from its language group/routing.
  const PROTECTED = ['id', 'createdAt', 'updatedAt', 'deletedAt', 'deleted_at', 'deleted_by', 'language'];
  // Tele_sales / senior cannot reassign or change source via general update.
  const restrictToWhitelist = (req.user.role === 'tele_sales' || req.user.role === 'senior');

  const updates = {};
  const oldStatus = lead.lead_status;
  let customFieldsPatch = null;
  for (const k of Object.keys(req.body)) {
    if (k === 'lead_owner_id') {
      if (restrictToWhitelist || PROTECTED.includes('assigned_to_id')) continue;
      updates.assigned_to_id = req.body[k];
      continue;
    }
    if (k === 'custom_fields') {
      // tele_sales / senior CAN edit custom_fields on their own leads — the
      // per-field editable_by_roles guard happens inside the validator. We
      // don't whitelist-block it like the legacy native fields.
      customFieldsPatch = req.body[k];
      continue;
    }
    if (PROTECTED.includes(k)) continue;
    if (restrictToWhitelist && !LIMITED_EDIT_FIELDS.includes(k)) continue;
    updates[k] = req.body[k];
  }

  let bypassedUpdate = false;
  if (customFieldsPatch !== null) {
    const allowSkip = isSkipValidationAllowed(req);
    const { custom_fields, errors: cfErrors, bypassed } = await processIncomingCustomFields(
      'lead',
      { custom_fields: customFieldsPatch },
      lead,
      { skip_validation: allowSkip },
    );
    if (cfErrors.length) return error(res, cfErrors.join('; '), 400);
    updates.custom_fields = custom_fields;
    bypassedUpdate = !!bypassed;
  }

  // Detect ftd_done / ftd_at transition and snapshot the closer, same as
  // updateStatus() — guarantees both code paths attribute the deal.
  const transition = detectFtdTransition({ oldLead: lead, updates });
  if (transition.triggered && !lead.closed_by_user_id) {
    Object.assign(updates, await buildCloserSnapshot({
      lead, updates, actorUser: req.user,
    }));
  }

  const oldData = lead.toJSON();
  const oldPreferred = lead.preferred_language;
  let reroutedTo = null; // set when auto-RR moves the lead to a new agent
  await lead.update(updates);

  if (transition.triggered && updates.closed_by_user_id) {
    await LeadActivity.create({
      lead_id: lead.id,
      user_id: req.user.id,
      activity_type: 'deal_closed',
      title: 'Deal closed',
      description: `Credit: ${updates.closed_by_name || 'unknown'}`,
    });
  }

  // ─── Auto re-route on preferred_language change ─────────────────────────
  // When a teleseller (or anyone) sets a new preferred_language on a lead
  // that hasn't reached FTD yet, push the lead into the matching language
  // group's round-robin queue. This keeps the customer with an agent who
  // speaks the language they actually want — without waiting for a manager
  // to do it manually.
  //
  // Skipped when:
  //   • lead is already a deal (ftd_done OR ftd_at set) — finished deals
  //     shouldn't shuffle owners
  //   • preferred_language is unset/cleared
  //   • the value is unchanged
  //   • no telesales group exists for that language (logged, lead stays put)
  const newPreferred = updates.preferred_language;
  const preferredChanged =
    Object.prototype.hasOwnProperty.call(updates, 'preferred_language')
    && newPreferred
    && String(newPreferred).trim() !== ''
    && String(newPreferred) !== String(oldPreferred || '');
  const isAlreadyDeal = lead.lead_status === 'ftd_done' || Boolean(lead.ftd_at);

  if (preferredChanged && !isAlreadyDeal) {
    try {
      const targetGroup = await Group.findOne({
        where: { language: newPreferred, is_active: true, type: 'telesales' },
      });

      if (!targetGroup) {
        await LeadActivity.create({
          lead_id: lead.id,
          user_id: req.user.id,
          activity_type: 'reassignment_skipped',
          title: `No telesales group for "${newPreferred}"`,
          description:
            'Preferred language updated but no active group found for that language — lead stays with current owner.',
          old_value: String(oldPreferred || ''),
          new_value: String(newPreferred),
        });
      } else {
        // RR transaction: pick next active member, then atomically swap the
        // lead's assignee + group inside the same tx so the rotation pointer
        // never advances without the lead actually moving.
        const tx = await sequelize.transaction();
        try {
          const rr = await assignLeadRoundRobin(targetGroup.id, lead.campaign_id || null, {
            transaction: tx,
          });
          const newAssigneeId = rr.user.id;
          const oldAssigneeId = lead.assigned_to_id;
          const sameAssignee = String(newAssigneeId) === String(oldAssigneeId);

          // Always update group_id (the lead now belongs to the new language
          // group), but only rotate previous_assigned_to_id when the assignee
          // actually changed — avoids logging a self-handoff.
          await lead.update(
            sameAssignee
              ? { group_id: targetGroup.id }
              : {
                  previous_assigned_to_id: oldAssigneeId,
                  assigned_to_id: newAssigneeId,
                  group_id: targetGroup.id,
                },
            { transaction: tx },
          );

          await LeadActivity.create(
            {
              lead_id: lead.id,
              user_id: req.user.id,
              activity_type: 'reassignment_history',
              title: sameAssignee
                ? `Re-routed (${newPreferred}) — kept with same agent`
                : `Re-routed via round-robin (${newPreferred})`,
              description: sameAssignee
                ? `Preferred language changed ${oldPreferred || '—'} → ${newPreferred}. RR picked the current assignee, no handoff needed.`
                : `Preferred language changed ${oldPreferred || '—'} → ${newPreferred}. Routed to ${rr.user.first_name || ''} ${rr.user.last_name || ''}`.trim(),
              old_value: oldAssigneeId || '',
              new_value: newAssigneeId,
              metadata: {
                is_historical: true,
                old_assignee_id: oldAssigneeId,
                new_assignee_id: newAssigneeId,
                trigger: 'auto_reroute_on_preferred_language',
                old_preferred_language: oldPreferred || null,
                new_preferred_language: newPreferred,
              },
            },
            { transaction: tx },
          );

          await AuditLog.create(
            {
              user_id: req.user.id,
              action: 'AUTO_REASSIGN_LANG',
              resource: 'Lead',
              resource_id: lead.id,
              old_data: { assigned_to_id: oldAssigneeId, preferred_language: oldPreferred },
              new_data: { assigned_to_id: newAssigneeId, preferred_language: newPreferred, group_id: targetGroup.id },
              ip_address: req.ip,
            },
            { transaction: tx },
          );

          await tx.commit();
          if (!sameAssignee) {
            reroutedTo = `${rr.user.first_name || ''} ${rr.user.last_name || ''}`.trim() || 'next agent';
          }
        } catch (e) {
          await tx.rollback();
          // Don't fail the whole PATCH — the preferred_language change has
          // already persisted. Log so admins can re-route manually if RR
          // couldn't find a target.
          // eslint-disable-next-line no-console
          console.error('Auto-RR on preferred_language change failed:', e);
          await LeadActivity.create({
            lead_id: lead.id,
            user_id: req.user.id,
            activity_type: 'reassignment_skipped',
            title: `Auto re-route failed (${newPreferred})`,
            description: `Round-robin could not pick a member: ${e.message}`,
            old_value: String(oldPreferred || ''),
            new_value: String(newPreferred),
          });
        }
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Auto-RR lookup failed:', e);
    }
  }

  // Log status changes specifically
  if (updates.lead_status && updates.lead_status !== oldStatus) {
    await LeadActivity.create({
      lead_id: lead.id,
      user_id: req.user.id,
      activity_type: 'status_change',
      title: `Status: ${oldStatus} → ${updates.lead_status}`,
      old_value: String(oldStatus ?? ''),
      new_value: String(updates.lead_status ?? ''),
    });
    await AuditLog.create({
      user_id: req.user.id,
      action: 'CHANGE_LEAD_STATUS',
      resource: 'Lead',
      resource_id: lead.id,
      old_data: { lead_status: oldStatus },
      new_data: { lead_status: updates.lead_status },
      ip_address: req.ip,
    });
  }

  await AuditLog.create({
    user_id: req.user.id,
    action: 'UPDATE',
    resource: 'Lead',
    resource_id: lead.id,
    old_data: oldData,
    new_data: lead.toJSON(),
    ip_address: req.ip,
  });

  if (bypassedUpdate) {
    await recordBypassAudit({
      AuditLog, req, resource: 'Lead', resourceId: lead.id, incoming: updates.custom_fields,
    });
  }

  const refreshed = await Lead.findByPk(lead.id, { include: INCLUDE_ASSIGNEE });
  const message = reroutedTo
    ? `Lead updated and re-routed to ${reroutedTo} (${newPreferred || 'new language'})`
    : 'Lead updated';
  return success(res, refreshed, message);
}

// ─── Update status (PATCH /:id/status) ────────────────────────────────────
async function updateStatus(req, res) {
  const lead = await Lead.findByPk(req.params.id);
  if (!lead) return error(res, 'Lead not found', 404);
  if (!canAlwaysEdit(req.user, lead)) {
    return error(res, 'You can only update status on leads assigned to you', 403);
  }

  const { lead_status, notes } = req.body || {};
  if (!lead_status) return error(res, 'lead_status is required', 400);

  const oldStatus = lead.lead_status;
  const updates = { lead_status, last_contact_date: new Date() };

  if (lead_status === 'account_opened' && !lead.account_opened_at) {
    updates.account_opened_at = new Date();
  }
  if (lead_status === 'ftd_done' && !lead.ftd_at) {
    updates.ftd_at = new Date();
    if (!lead.account_opened_at) updates.account_opened_at = new Date();
  }

  // Snapshot the closer at the moment of transition so analytics survive any
  // later reassignment or user delete.
  const transition = detectFtdTransition({ oldLead: lead, updates });
  if (transition.triggered && !lead.closed_by_user_id) {
    Object.assign(updates, await buildCloserSnapshot({
      lead, updates, actorUser: req.user,
    }));
  }

  await lead.update(updates);

  await LeadActivity.create({
    lead_id: lead.id,
    user_id: req.user.id,
    activity_type: 'status_change',
    title: `Status: ${oldStatus} → ${lead_status}`,
    description: notes || null,
    old_value: String(oldStatus ?? ''),
    new_value: String(lead_status ?? ''),
  });

  if (transition.triggered && updates.closed_by_user_id) {
    await LeadActivity.create({
      lead_id: lead.id,
      user_id: req.user.id,
      activity_type: 'deal_closed',
      title: 'Deal closed',
      description: `Credit: ${updates.closed_by_name || 'unknown'}`,
    });
  }

  await AuditLog.create({
    user_id: req.user.id,
    action: 'CHANGE_LEAD_STATUS',
    resource: 'Lead',
    resource_id: lead.id,
    old_data: { lead_status: oldStatus },
    new_data: { lead_status, notes },
    ip_address: req.ip,
  });

  return success(res, lead, 'Status updated');
}

// ─── Assign (PATCH /:id/assign — and /reassign as a synonym) ──────────────
async function assign(req, res) {
  if (!['super_admin', 'admin', 'floor_manager'].includes(req.user.role)) {
    return error(res, 'Only admin / floor manager can change lead assignment', 403);
  }

  const lead = await Lead.findByPk(req.params.id);
  if (!lead) return error(res, 'Lead not found', 404);

  // Accept new_assignee_id (preferred) or new_owner_id / user_id (legacy).
  const newAssigneeId = req.body?.new_assignee_id || req.body?.new_owner_id || req.body?.user_id;
  const { reason } = req.body || {};
  if (!newAssigneeId) return error(res, 'new_assignee_id is required', 400);

  const newAssignee = await User.findByPk(newAssigneeId);
  if (!newAssignee) return error(res, 'Assignee not found', 404);
  if (!newAssignee.is_active) return error(res, 'Cannot assign to inactive user', 400);

  // Source-based assignment rules.
  // BRUTE-FORCE OVERRIDE: super_admin / admin can override the source rule —
  // they get full assignment authority. The "must be tele_sales or senior"
  // rule still applies (assigning to back_office / auditor would be nonsense)
  // but admins are no longer blocked from putting a direct_ark lead onto a
  // teleseller when that's what the business needs.
  const isAdminOverride = ['super_admin', 'admin'].includes(req.user.role);
  if (!isAdminOverride && lead.lead_source === 'direct_ark' && newAssignee.role !== 'senior') {
    return error(res, 'Direct ARK leads can only be assigned to seniors', 400);
  }
  if (!['tele_sales', 'senior'].includes(newAssignee.role)) {
    return error(res, 'Leads can only be assigned to telesellers or seniors', 400);
  }

  const oldAssigneeId = lead.assigned_to_id;
  const oldAssignee = oldAssigneeId ? await User.findByPk(oldAssigneeId) : null;
  const oldAssigneeName = oldAssignee
    ? `${oldAssignee.first_name || ''} ${oldAssignee.last_name || ''}`.trim()
    : 'unassigned';
  const newAssigneeName = `${newAssignee.first_name || ''} ${newAssignee.last_name || ''}`.trim();

  await lead.update({
    previous_assigned_to_id: oldAssigneeId,
    assigned_to_id: newAssigneeId,
  });

  // Activity rows are HISTORY, not current state. Explicit type +
  // `is_historical: true` metadata so no frontend code accidentally reads
  // an activity user_id and renders it as the lead's current assignee.
  await LeadActivity.create({
    lead_id: lead.id,
    user_id: req.user.id,
    activity_type: 'reassignment_history',
    title: `Reassigned from ${oldAssigneeName} to ${newAssigneeName}`,
    description: `Lead reassignment event — NOT a current assignment. Current assignee is ${newAssigneeName}.${reason ? ` Reason: ${reason}` : ''}`,
    old_value: oldAssigneeId || '',
    new_value: newAssigneeId,
    metadata: {
      is_historical: true,
      old_assignee_id: oldAssigneeId,
      old_assignee_name: oldAssigneeName,
      new_assignee_id: newAssigneeId,
      new_assignee_name: newAssigneeName,
      reason: reason || null,
    },
  });

  await AuditLog.create({
    user_id: req.user.id,
    action: 'ASSIGN_LEAD',
    resource: 'Lead',
    resource_id: lead.id,
    old_data: { assigned_to_id: oldAssigneeId },
    new_data: { assigned_to_id: newAssigneeId, reason: reason || null },
    ip_address: req.ip,
  });

  const refreshed = await Lead.findByPk(lead.id, { include: INCLUDE_ASSIGNEE });
  return success(res, refreshed, 'Lead assigned');
}

// `reassign` is just an alias for `assign` for back-compat with old clients.
const reassign = assign;

// ─── Soft delete (DELETE /:id) ────────────────────────────────────────────
async function softDelete(req, res) {
  const lead = await Lead.findByPk(req.params.id);
  if (!lead) return error(res, 'Lead not found', 404);

  await lead.update({ deleted_by: req.user.id });
  await lead.destroy(); // paranoid → sets deletedAt without removing the row

  await AuditLog.create({
    user_id: req.user.id,
    action: 'DELETE',
    resource: 'Lead',
    resource_id: lead.id,
    new_data: { deleted_by: req.user.id },
    ip_address: req.ip,
  });
  return success(res, null, 'Lead moved to recycle bin');
}

// ─── Activities ───────────────────────────────────────────────────────────
async function addActivity(req, res) {
  const lead = await Lead.findByPk(req.params.id);
  if (!lead) return error(res, 'Lead not found', 404);
  if (!canAlwaysEdit(req.user, lead)) {
    return error(res, 'You can only log activity on leads assigned to you', 403);
  }

  // Validate any custom_fields blob on the activity itself (e.g. an
  // "Outcome category" dropdown defined as a lead_activity field).
  const allowSkip = isSkipValidationAllowed(req);
  const { custom_fields, errors: cfErrors, bypassed } =
    await processIncomingCustomFields('lead_activity', req.body || {}, null, { skip_validation: allowSkip });
  if (cfErrors.length) return error(res, cfErrors.join('; '), 400);

  const activity = await LeadActivity.create({
    ...req.body,
    custom_fields,
    lead_id: lead.id,
    user_id: req.user.id,
  });

  if (bypassed) {
    await recordBypassAudit({
      AuditLog, req, resource: 'LeadActivity', resourceId: activity.id, incoming: custom_fields,
    });
  }

  if (req.body?.activity_type === 'call') {
    await lead.update({
      total_attempted_call_count: (lead.total_attempted_call_count || 0) + 1,
      total_call_duration: (lead.total_call_duration || 0) + (Number(req.body?.call_duration) || 0),
      last_contact_date: new Date(),
      last_interaction_date: new Date(),
    });
  }

  await AuditLog.create({
    user_id: req.user.id,
    action: 'LOG_ACTIVITY',
    resource: 'Lead',
    resource_id: lead.id,
    new_data: {
      activity_type: activity.activity_type,
      title: activity.title,
      description: activity.description,
    },
    ip_address: req.ip,
  });

  return success(res, activity, 'Activity logged', 201);
}

async function getActivities(req, res) {
  const activities = await LeadActivity.findAll({
    where: { lead_id: req.params.id },
    include: [{ model: User, as: 'user', attributes: ['id', 'first_name', 'last_name', 'role'] }],
    order: [['created_at', 'DESC']],
  });
  return success(res, activities);
}

// ─── Notes shortcut ───────────────────────────────────────────────────────
async function addNote(req, res) {
  const lead = await Lead.findByPk(req.params.id);
  if (!lead) return error(res, 'Lead not found', 404);
  if (!canAlwaysEdit(req.user, lead)) {
    return error(res, 'You can only add notes to leads assigned to you', 403);
  }
  const { title, description, metadata } = req.body || {};
  if (!description) return error(res, 'description is required', 400);

  const note = await LeadActivity.create({
    lead_id: lead.id,
    user_id: req.user.id,
    activity_type: 'note',
    title: title || 'Note',
    description,
    metadata: metadata || null,
  });

  await AuditLog.create({
    user_id: req.user.id,
    action: 'ADD_NOTE',
    resource: 'Lead',
    resource_id: lead.id,
    new_data: { title: note.title, description: note.description },
    ip_address: req.ip,
  });

  return success(res, note, 'Note added', 201);
}

// ─── Log call shortcut ────────────────────────────────────────────────────
async function logCall(req, res) {
  const lead = await Lead.findByPk(req.params.id);
  if (!lead) return error(res, 'Lead not found', 404);
  if (!canAlwaysEdit(req.user, lead)) {
    return error(res, 'You can only log calls on leads assigned to you', 403);
  }
  const { call_duration, call_outcome, description } = req.body || {};

  const tx = await sequelize.transaction();
  try {
    const activity = await LeadActivity.create(
      {
        lead_id: lead.id,
        user_id: req.user.id,
        activity_type: 'call',
        title: `Call: ${call_outcome || 'logged'}`,
        description: description || null,
        call_duration: call_duration || 0,
        call_outcome: call_outcome || null,
        completed_at: new Date(),
      },
      { transaction: tx },
    );

    lead.total_attempted_call_count = (lead.total_attempted_call_count || 0) + 1;
    lead.total_call_duration = (lead.total_call_duration || 0) + (Number(call_duration) || 0);
    lead.last_contact_date = new Date();
    lead.last_interaction_date = new Date();
    await lead.save({ transaction: tx });

    await tx.commit();

    // Audit log is created after commit so a write failure on the audit row
    // can't roll back the call log itself — call counts are user-visible state.
    // Wrapped in try/catch for the same reason: an audit row failing must not
    // turn a successful call log into a 500 for the teleseller.
    try {
      await AuditLog.create({
        user_id: req.user.id,
        action: 'LOG_CALL',
        resource: 'Lead',
        resource_id: lead.id,
        new_data: {
          call_outcome: call_outcome || null,
          call_duration: Number(call_duration) || 0,
          description: description || null,
        },
        ip_address: req.ip,
      });
    } catch (auditErr) {
      // eslint-disable-next-line no-console
      console.error('audit log write failed for LOG_CALL', auditErr);
    }

    return success(res, activity, 'Call logged', 201);
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

// ─── Reassignments away from me ───────────────────────────────────────────
// Returns the reassignment events where the calling user was the previous
// (now-displaced) assignee. Powers the "Recently reassigned away from you"
// banner on the teleseller / senior dashboards.
async function reassignmentsFromMe(req, res) {
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
  const since = req.query.since ? new Date(req.query.since) : null;
  // Accept either the legacy `reassignment` type or the new explicit
  // `reassignment_history` type — same semantics, just clearer naming.
  const where = {
    activity_type: { [Op.in]: ['reassignment', 'reassignment_history'] },
    old_value: String(req.user.id),
  };
  if (since && !Number.isNaN(since.getTime())) {
    where.created_at = { [Op.gt]: since };
  }
  const activities = await LeadActivity.findAll({
    where,
    include: [
      {
        model: User,
        as: 'user',
        attributes: ['id', 'first_name', 'last_name', 'email', 'role'],
      },
      {
        model: Lead,
        as: 'lead',
        attributes: ['id', 'first_name', 'last_name', 'phone', 'lead_status', 'assigned_to_id'],
        include: [
          {
            model: User,
            as: 'assignedTo',
            attributes: ['id', 'first_name', 'last_name', 'email'],
          },
        ],
      },
    ],
    order: [['created_at', 'DESC']],
    limit,
  });
  return success(res, activities);
}

// ─── CSV export ───────────────────────────────────────────────────────────
async function exportCsv(req, res) {
  const where = buildScope(req.user);
  const leads = await Lead.findAll({
    where,
    order: [['created_at', 'DESC']],
    limit: 10000,
  });

  const fields = [
    'id', 'first_name', 'last_name', 'email', 'phone', 'whatsapp_number',
    'lead_status', 'lead_source', 'language', 'campaign_name', 'ad_name',
    'ark_username', 'ark_account_number', 'deposited_amount', 'ftd_at',
    'assigned_to_id', 'created_at',
  ];
  const parser = new Parser({ fields });
  const csv = parser.parse(leads.map((l) => l.toJSON()));

  res.header('Content-Type', 'text/csv');
  res.attachment(`leads-${new Date().toISOString().slice(0, 10)}.csv`);
  return res.send(csv);
}

// ─── Unassigned summary ──────────────────────────────────────────────────
// Snapshot of leads waiting for manual assignment — admins/floor managers
// use it to dispatch leads that the round-robin couldn't route.
async function unassignedSummary(req, res) {
  const where = {
    [Op.or]: [{ assigned_to_id: null }, { lead_status: 'unassigned' }],
  };

  const totalCount = await Lead.count({ where });

  const byLanguage = await Lead.findAll({
    where,
    attributes: [
      'language',
      'lead_source',
      [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
    ],
    group: ['language', 'lead_source'],
    raw: true,
  });

  const oldest = await Lead.findOne({
    where,
    order: [['created_at', 'ASC']],
    attributes: ['id', 'first_name', 'last_name', 'createdAt', 'language'],
  });

  const oldestCreatedAt = oldest ? (oldest.createdAt || oldest.get?.('createdAt')) : null;

  return success(res, {
    total: totalCount,
    by_language: byLanguage.map((r) => ({
      language: r.language,
      lead_source: r.lead_source,
      count: parseInt(r.count, 10),
    })),
    oldest_lead: oldest
      ? {
        id: oldest.id,
        name: `${oldest.first_name || ''} ${oldest.last_name || ''}`.trim(),
        language: oldest.language,
        created_at: oldestCreatedAt,
        age_hours: oldestCreatedAt
          ? Math.floor((Date.now() - new Date(oldestCreatedAt).getTime()) / (1000 * 60 * 60))
          : null,
      }
      : null,
  });
}

// ─── Bulk-assign ─────────────────────────────────────────────────────────
async function bulkAssign(req, res) {
  if (!['super_admin', 'admin', 'floor_manager'].includes(req.user.role)) {
    return error(res, 'Only admin / floor manager can bulk-assign', 403);
  }

  const { lead_ids, new_assignee_id, run_round_robin } = req.body || {};
  if (!Array.isArray(lead_ids) || lead_ids.length === 0) {
    return error(res, 'lead_ids must be a non-empty array', 400);
  }

  const leads = await Lead.findAll({ where: { id: { [Op.in]: lead_ids } } });
  if (leads.length === 0) return error(res, 'No leads found', 404);

  const results = [];

  if (run_round_robin) {
    const { assignToTeleseller, assignToSenior } = require('../utils/leadAssignment');
    for (const lead of leads) {
      const isDirect = lead.lead_source === 'direct_ark';
      const { assignee } = isDirect
        ? await assignToSenior(lead.language)
        : await assignToTeleseller(lead.language, lead.group_id);
      if (assignee) {
        await lead.update({ assigned_to_id: assignee.id, lead_status: 'new' });
        results.push({
          lead_id: lead.id,
          assigned_to: `${assignee.first_name} ${assignee.last_name}`.trim(),
          status: 'ok',
        });
      } else {
        results.push({ lead_id: lead.id, assigned_to: null, status: 'no_match' });
      }
    }
  } else if (new_assignee_id) {
    const assignee = await User.findByPk(new_assignee_id);
    if (!assignee) return error(res, 'Assignee not found', 404);
    if (!assignee.is_active) return error(res, 'Cannot assign to inactive user', 400);

    for (const lead of leads) {
      const langMatch = (assignee.languages || []).includes(lead.language);
      await lead.update({ assigned_to_id: assignee.id, lead_status: 'new' });
      results.push({
        lead_id: lead.id,
        assigned_to: `${assignee.first_name} ${assignee.last_name}`.trim(),
        status: 'ok',
        language_match: langMatch,
      });
    }
  } else {
    return error(res, 'Either new_assignee_id or run_round_robin: true is required', 400);
  }

  await AuditLog.create({
    user_id: req.user.id,
    action: 'BULK_ASSIGN_LEADS',
    resource: 'Lead',
    new_data: { count: results.length, results, run_round_robin: !!run_round_robin },
    ip_address: req.ip,
  }).catch(() => {});

  const okCount = results.filter((r) => r.status === 'ok').length;
  return success(res, { results, total: results.length }, `${okCount} leads assigned`);
}

// ─── Detail with field definitions ───────────────────────────────────────
// Returns the same lead getOne returns, but with a `custom_fields_with_meta`
// envelope: one entry per active FieldDefinition, value alongside label,
// type, options, etc. Lets a detail page render every field without a
// second round-trip to /field-definitions.
async function getWithFieldDefs(req, res) {
  const lead = await Lead.findByPk(req.params.id, { include: INCLUDE_ASSIGNEE });
  if (!lead) return error(res, 'Lead not found', 404);

  if ((req.user.role === 'tele_sales' || req.user.role === 'senior')
      && !isAssignedToMe(req.user, lead)
      && !isClosedByMe(req.user, lead)) {
    return error(res, 'You can only view leads assigned to you or deals you closed', 403);
  }

  const enriched = await attachDefinitionsToResponse('lead', lead);
  return success(res, enriched);
}

module.exports = {
  list, getOne, create, update, updateStatus, assign, reassign,
  softDelete, remove: softDelete, addActivity, getActivities,
  addNote, logCall, exportCsv, reassignmentsFromMe,
  unassignedSummary, bulkAssign,
  getWithFieldDefs,
};
