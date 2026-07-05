const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../config/database');

// Zoho-style Assignment Rule.
//
// Admins define an ORDERED list of rules (by `position`). When a lead arrives
// and has no assignee yet, the engine walks rules in ascending `position`
// order and picks the FIRST active rule whose CRITERIA match the lead. That
// rule then assigns the lead to a user — directly (`assign_strategy = 'user'`)
// or by round-robin across its `targets` (`assign_strategy = 'round_robin'`).
//
// This sits IN FRONT of the existing RoutingRule / language-group cascade:
// if no assignment rule matches, the lead falls through to the current
// routing engine unchanged.
//
//   match_type = 'all'       → matches every lead (a catch-all rule)
//   match_type = 'criteria'  → matches when `criteria` ({match,rules}) is true
//
//   targets = [{ type:'user'|'group', id:<uuid> }, ...]
//     • assign_strategy 'user'        → targets[0] is used
//     • assign_strategy 'round_robin' → rr_index rotates over the whole list
//
// `criteria` reuses the exact shape from utils/criteria.js:
//   { match:'and'|'or', rules:[{ field, source, type, operator, value, value2 }] }
class AssignmentRule extends Model {}

AssignmentRule.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(120),
      allowNull: false,
    },
    description: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    module: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: 'lead',
      comment: 'Entity this rule applies to. Only "lead" is wired today.',
    },
    match_type: {
      type: DataTypes.STRING(16),
      allowNull: false,
      defaultValue: 'criteria',
      comment: "'all' = matches every record | 'criteria' = matches the criteria JSON",
    },
    criteria: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'Zoho-style { match:"and"|"or", rules:[...] }. Null when match_type = "all".',
    },
    assign_strategy: {
      type: DataTypes.STRING(24),
      allowNull: false,
      defaultValue: 'user',
      comment: "'user' = assign to targets[0] | 'round_robin' = rotate over targets",
    },
    targets: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
      comment: 'Array of { type:"user"|"group", id:<uuid> }. One for "user", many for "round_robin".',
    },
    rr_index: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: 'Round-robin cursor over `targets` (interpreted modulo targets.length).',
    },
    position: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: 'Evaluation order — lower positions are checked first.',
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    created_by: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
    },
  },
  {
    sequelize,
    modelName: 'AssignmentRule',
    tableName: 'assignment_rules',
    paranoid: true,
    indexes: [
      { fields: ['module', 'is_active', 'position'] },
      { fields: ['is_active'] },
    ],
  },
);

module.exports = AssignmentRule;
