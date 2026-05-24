const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../config/database');

// Generic round-robin pointer keyed by a string scope. Used by the lead
// router for rotations that aren't tied to a single (group, campaign) tuple:
//
//   rule:facebook_ads:hindi   — across routing rules for this tuple
//   rule:facebook_ads:*       — across routing rules with language=null
//   lang:hindi:groups         — across language-matched telesales groups
//   lang:hindi:users          — across telesellers whose primary_language=hindi
//   lang:hindi:users:overflow — across telesellers with hindi in additional_languages
//   any:users                 — final fallback across every active teleseller
//
// Separate from RoundRobinState so the group/campaign rotation stays
// untouched. current_index is interpreted modulo the live target-list size,
// which means adding/removing targets reshuffles naturally without bookkeeping.
class RRPointer extends Model {}

RRPointer.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    scope_key: {
      type: DataTypes.STRING(128),
      allowNull: false,
      unique: true,
    },
    current_index: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    total_assigned: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    last_assigned_at: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    modelName: 'RRPointer',
    tableName: 'rr_pointers',
    paranoid: false,
    indexes: [
      { unique: true, fields: ['scope_key'] },
    ],
  },
);

module.exports = RRPointer;
