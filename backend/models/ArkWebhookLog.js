const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../config/database');

const MATCH_STATUSES = ['matched', 'unmatched', 'error'];

class ArkWebhookLog extends Model {}

ArkWebhookLog.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    raw_payload: { type: DataTypes.JSONB, allowNull: false },
    ark_username: { type: DataTypes.STRING(64), allowNull: true },
    ark_account_number: { type: DataTypes.STRING(64), allowNull: true },
    event_type: { type: DataTypes.STRING(64), allowNull: true },
    matched_lead_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'leads', key: 'id' },
    },
    match_status: {
      type: DataTypes.ENUM(...MATCH_STATUSES),
      allowNull: false,
      defaultValue: 'unmatched',
    },
    processed_at: { type: DataTypes.DATE, allowNull: true },
    error_message: { type: DataTypes.TEXT, allowNull: true },
    ip_address: { type: DataTypes.STRING(64), allowNull: true },
  },
  {
    sequelize,
    modelName: 'ArkWebhookLog',
    tableName: 'ark_webhook_logs',
    paranoid: true,
    indexes: [
      { fields: ['ark_username'] },
      { fields: ['matched_lead_id'] },
      { fields: ['match_status'] },
      { fields: ['event_type'] },
      { fields: ['created_at'] },
    ],
  },
);

ArkWebhookLog.MATCH_STATUSES = MATCH_STATUSES;

module.exports = ArkWebhookLog;
