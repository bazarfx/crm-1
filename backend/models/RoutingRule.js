const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../config/database');

// Admin-configured routing target for a (lead_source, language) tuple.
// Multiple rules with the same tuple form an ordered list — the system
// round-robins through that list when leads arrive.
//
// Examples the admin can express:
//   facebook_ads / hindi   → [Group A, Group B]   ← RR across groups, then RR inside whichever group is picked
//   instagram_ads / *      → [User Alice, User Bob] ← RR direct between two users (no group layer)
//   google_ads / tamil     → [Group X]            ← single target, every google_ads/tamil lead goes there
//
// `language = null` means "applies to all languages for this source".
class RoutingRule extends Model {}

RoutingRule.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    lead_source: {
      type: DataTypes.STRING(32),
      allowNull: false,
      comment: 'facebook_ads | instagram_ads | google_ads | direct_ark | manual | referral | ...',
    },
    language: {
      type: DataTypes.STRING(32),
      allowNull: true,
      comment: 'null = applies to ALL languages for this source',
    },
    target_type: {
      type: DataTypes.STRING(16),
      allowNull: false,
      comment: 'group | user',
    },
    target_id: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: 'FK into groups or users depending on target_type',
    },
    position: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: 'Ordering within the same (lead_source, language) bucket',
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    notes: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    created_by: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
    },
  },
  {
    sequelize,
    modelName: 'RoutingRule',
    tableName: 'routing_rules',
    paranoid: true,
    indexes: [
      { fields: ['lead_source', 'language', 'position'] },
      { fields: ['target_type', 'target_id'] },
      { fields: ['is_active'] },
    ],
  },
);

module.exports = RoutingRule;
