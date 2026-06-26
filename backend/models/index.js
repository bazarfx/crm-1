const { sequelize, testConnection } = require('../config/database');

const Config = require('./Config');
const Role = require('./Role');
const Module = require('./Module');
const ModuleRecord = require('./ModuleRecord');
const User = require('./User');
const Group = require('./Group');
const GroupMember = require('./GroupMember');
const Campaign = require('./Campaign');
const CampaignGroupAssignment = require('./CampaignGroupAssignment');
const Lead = require('./Lead');
const LeadActivity = require('./LeadActivity');
const ArkWebhookLog = require('./ArkWebhookLog');
const IngestLog = require('./IngestLog');
const RoundRobinState = require('./RoundRobinState');
const AuditLog = require('./AuditLog');
const RefreshToken = require('./RefreshToken');
const Setting = require('./Setting');
const RolePermission = require('./RolePermission');
const UserPermission = require('./UserPermission');
const DealUndoRequest = require('./DealUndoRequest');
const RoutingRule = require('./RoutingRule');
const RRPointer = require('./RRPointer');
const FieldDefinition = require('./FieldDefinition');

// ─────────────────────────────────────────────────────────────────────────────
// ASSOCIATIONS
// ─────────────────────────────────────────────────────────────────────────────

// User self-reference (org tree)
User.belongsTo(User, { as: 'parent', foreignKey: 'parent_node_id' });
User.hasMany(User, { as: 'reports', foreignKey: 'parent_node_id' });

// Role hierarchy (self-referential tree). User.role holds Role.key as a string
// — a deliberate loose coupling so custom roles need no FK migration.
Role.belongsTo(Role, { as: 'parent', foreignKey: 'parent_role_id' });
Role.hasMany(Role, { as: 'children', foreignKey: 'parent_role_id' });
Role.belongsTo(User, { as: 'createdBy', foreignKey: 'created_by' });

// Module registry + generic records. Loose-coupled by `key`/`module_key`
// string (== FieldDefinition.entity_type) — no FK to Module, like Role.key.
Module.belongsTo(User, { as: 'createdBy', foreignKey: 'created_by' });
ModuleRecord.belongsTo(User, { as: 'createdBy', foreignKey: 'created_by' });

// Group ↔ User (creator)
Group.belongsTo(User, { as: 'creator', foreignKey: 'created_by' });

// Group ↔ User via GroupMember
Group.belongsToMany(User, {
  through: GroupMember,
  foreignKey: 'group_id',
  otherKey: 'user_id',
  as: 'members',
});
User.belongsToMany(Group, {
  through: GroupMember,
  foreignKey: 'user_id',
  otherKey: 'group_id',
  as: 'groups',
});
GroupMember.belongsTo(Group, { foreignKey: 'group_id' });
GroupMember.belongsTo(User, { foreignKey: 'user_id' });
// Aliased duplicates so include({ as: 'user' / 'group' }) works in newer
// endpoints (dashboard, candidate listing, member listing). The unaliased
// associations above are kept for existing callers.
GroupMember.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
GroupMember.belongsTo(Group, { foreignKey: 'group_id', as: 'group' });
Group.hasMany(GroupMember, { foreignKey: 'group_id', as: 'memberships' });
User.hasMany(GroupMember, { foreignKey: 'user_id', as: 'memberships' });

// Campaign ↔ User (creator)
Campaign.belongsTo(User, { as: 'creator', foreignKey: 'created_by' });

// Campaign ↔ Group via CampaignGroupAssignment
Campaign.belongsToMany(Group, {
  through: CampaignGroupAssignment,
  foreignKey: 'campaign_id',
  otherKey: 'group_id',
  as: 'groups',
});
Group.belongsToMany(Campaign, {
  through: CampaignGroupAssignment,
  foreignKey: 'group_id',
  otherKey: 'campaign_id',
  as: 'campaigns',
});
CampaignGroupAssignment.belongsTo(Campaign, { foreignKey: 'campaign_id' });
CampaignGroupAssignment.belongsTo(Group, { foreignKey: 'group_id' });
CampaignGroupAssignment.belongsTo(User, { as: 'assigner', foreignKey: 'assigned_by' });

// Lead ↔ User / Group / Campaign
// Lead is ASSIGNED to a user — `assignedTo` alias, NOT `owner`.
Lead.belongsTo(User, { as: 'assignedTo', foreignKey: 'assigned_to_id' });
Lead.belongsTo(User, { as: 'previousAssignedTo', foreignKey: 'previous_assigned_to_id' });
Lead.belongsTo(User, { as: 'closedBy', foreignKey: 'closed_by_user_id' });
Lead.belongsTo(User, { as: 'deletedBy', foreignKey: 'deleted_by' });
Lead.belongsTo(Group, { as: 'group', foreignKey: 'group_id' });
Lead.belongsTo(Campaign, { as: 'campaign', foreignKey: 'campaign_id' });
User.hasMany(Lead, { foreignKey: 'assigned_to_id', as: 'assignedLeads' });
Group.hasMany(Lead, { foreignKey: 'group_id', as: 'leads' });
Campaign.hasMany(Lead, { foreignKey: 'campaign_id', as: 'leads' });

// LeadActivity
LeadActivity.belongsTo(Lead, { foreignKey: 'lead_id', as: 'lead' });
LeadActivity.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
Lead.hasMany(LeadActivity, { foreignKey: 'lead_id', as: 'activities' });
User.hasMany(LeadActivity, { foreignKey: 'user_id', as: 'activities' });

// ArkWebhookLog
ArkWebhookLog.belongsTo(Lead, { foreignKey: 'matched_lead_id', as: 'lead' });
Lead.hasMany(ArkWebhookLog, { foreignKey: 'matched_lead_id', as: 'arkLogs' });

// IngestLog
IngestLog.belongsTo(Lead, { foreignKey: 'matched_lead_id', as: 'lead' });
IngestLog.belongsTo(User, { foreignKey: 'assigned_to_user_id', as: 'assignedUser' });
IngestLog.belongsTo(Group, { foreignKey: 'assigned_to_group_id', as: 'assignedGroup' });
Lead.hasMany(IngestLog, { foreignKey: 'matched_lead_id', as: 'ingestLogs' });

// RoundRobinState
RoundRobinState.belongsTo(Group, { foreignKey: 'group_id', as: 'group' });
RoundRobinState.belongsTo(Campaign, { foreignKey: 'campaign_id', as: 'campaign' });
RoundRobinState.belongsTo(User, { foreignKey: 'last_assigned_user_id', as: 'lastUser' });

// AuditLog
AuditLog.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
User.hasMany(AuditLog, { foreignKey: 'user_id', as: 'auditLogs' });

// RefreshToken
RefreshToken.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
User.hasMany(RefreshToken, { foreignKey: 'user_id', as: 'refreshTokens' });

// Setting (audited last editor)
Setting.belongsTo(User, { foreignKey: 'updated_by', as: 'updatedBy' });

// RolePermission (audited last editor)
RolePermission.belongsTo(User, { foreignKey: 'updated_by', as: 'updatedBy' });

// UserPermission — per-user permission overlay for role='custom' users.
UserPermission.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
UserPermission.belongsTo(User, { foreignKey: 'updated_by', as: 'updatedBy' });
User.hasMany(UserPermission, { foreignKey: 'user_id', as: 'permissions' });

// DealUndoRequest — links to the lead being undone, the requester, and the
// reviewer (admin/super_admin who approves or rejects).
DealUndoRequest.belongsTo(Lead, { foreignKey: 'lead_id', as: 'lead' });
DealUndoRequest.belongsTo(User, { foreignKey: 'requested_by_user_id', as: 'requestedBy' });
DealUndoRequest.belongsTo(User, { foreignKey: 'reviewed_by_user_id', as: 'reviewedBy' });
Lead.hasMany(DealUndoRequest, { foreignKey: 'lead_id', as: 'undoRequests' });
User.hasMany(DealUndoRequest, { foreignKey: 'requested_by_user_id', as: 'undoRequestsRaised' });

// RoutingRule — admin lookup convenience. target_id is polymorphic (group or
// user) so we deliberately do NOT add a hasMany on either side; the resolver
// fetches by target_type + target_id explicitly.
RoutingRule.belongsTo(User, { foreignKey: 'created_by', as: 'createdBy' });

// FieldDefinition — dynamic custom-field registry. Both audit-author edges
// resolve to User. Polymorphic over entity_type (lead/user/deal/…) so there's
// no association to a target entity; the validator looks it up by string.
FieldDefinition.belongsTo(User, { foreignKey: 'created_by', as: 'createdBy' });
FieldDefinition.belongsTo(User, { foreignKey: 'archived_by', as: 'archivedBy' });

// ─────────────────────────────────────────────────────────────────────────────
// SYNC
// ─────────────────────────────────────────────────────────────────────────────
async function syncDatabase({ alter = false, force = false } = {}) {
  await testConnection();
  await sequelize.sync({ alter, force });
  return sequelize;
}

module.exports = {
  sequelize,
  testConnection,
  syncDatabase,
  Config,
  Role,
  Module,
  ModuleRecord,
  User,
  Group,
  GroupMember,
  Campaign,
  CampaignGroupAssignment,
  Lead,
  LeadActivity,
  ArkWebhookLog,
  IngestLog,
  RoundRobinState,
  AuditLog,
  RefreshToken,
  Setting,
  RolePermission,
  UserPermission,
  DealUndoRequest,
  RoutingRule,
  RRPointer,
  FieldDefinition,
};
