const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../config/database');

class LeadActivity extends Model {}

LeadActivity.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    lead_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'leads', key: 'id' },
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
    },
    activity_type: {
      type: DataTypes.STRING(32),
      allowNull: false,
    },
    title: { type: DataTypes.STRING(255), allowNull: true },
    description: { type: DataTypes.TEXT, allowNull: true },
    old_value: { type: DataTypes.STRING(255), allowNull: true },
    new_value: { type: DataTypes.STRING(255), allowNull: true },
    call_duration: { type: DataTypes.INTEGER, allowNull: true },
    call_outcome: { type: DataTypes.STRING(64), allowNull: true },
    scheduled_at: { type: DataTypes.DATE, allowNull: true },
    completed_at: { type: DataTypes.DATE, allowNull: true },
    metadata: { type: DataTypes.JSONB, allowNull: true },
    custom_fields: {
      type: DataTypes.JSONB,
      defaultValue: {},
      allowNull: false,
      comment: 'Dynamic custom fields, structure defined by FieldDefinition registry',
    },
  },
  {
    sequelize,
    modelName: 'LeadActivity',
    tableName: 'lead_activities',
    paranoid: true,
    indexes: [
      { fields: ['lead_id'] },
      { fields: ['user_id'] },
      { fields: ['activity_type'] },
      { fields: ['lead_id', 'created_at'] },
    ],
  },
);

module.exports = LeadActivity;
