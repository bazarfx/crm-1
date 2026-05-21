const { sequelize, testConnection } = require('../config/database');

const Config = require('./Config');
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

// ─────────────────────────────────────────────────────────────────────────────
// ASSOCIATIONS
// ─────────────────────────────────────────────────────────────────────────────

// User self-reference (org tree)
User.belongsTo(User, { as: 'parent', foreignKey: 'parent_node_id' });
User.hasMany(User, { as: 'reports', foreignKey: 'parent_node_id' });

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
Lead.belongsTo(User, { as: 'owner', foreignKey: 'lead_owner_id' });
Lead.belongsTo(User, { as: 'previousOwner', foreignKey: 'previous_lead_owner_id' });
Lead.belongsTo(Group, { as: 'group', foreignKey: 'group_id' });
Lead.belongsTo(Campaign, { as: 'campaign', foreignKey: 'campaign_id' });
User.hasMany(Lead, { foreignKey: 'lead_owner_id', as: 'ownedLeads' });
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
};
