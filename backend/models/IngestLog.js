const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../config/database');

const INGEST_STATUSES = ['created', 'duplicate', 'error'];

class IngestLog extends Model {}

IngestLog.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    raw_payload: { type: DataTypes.JSONB, allowNull: false },
    source: {
      type: DataTypes.STRING(64),
      allowNull: false,
      defaultValue: 'integrately',
    },
    facebook_lead_id: { type: DataTypes.STRING(128), allowNull: true },
    phone: { type: DataTypes.STRING(32), allowNull: true },
    matched_lead_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'leads', key: 'id' },
    },
    status: {
      type: DataTypes.ENUM(...INGEST_STATUSES),
      allowNull: false,
      defaultValue: 'created',
    },
    error_message: { type: DataTypes.TEXT, allowNull: true },
    assigned_to_user_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
    },
    assigned_to_group_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'groups', key: 'id' },
    },
    ip_address: { type: DataTypes.STRING(64), allowNull: true },
  },
  {
    sequelize,
    modelName: 'IngestLog',
    tableName: 'ingest_logs',
    paranoid: true,
    indexes: [
      { fields: ['facebook_lead_id'] },
      { fields: ['phone'] },
      { fields: ['status'] },
      { fields: ['matched_lead_id'] },
      { fields: ['created_at'] },
    ],
  },
);

IngestLog.INGEST_STATUSES = INGEST_STATUSES;

module.exports = IngestLog;
