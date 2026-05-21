const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../config/database');

class AuditLog extends Model {}

AuditLog.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
    },
    action: { type: DataTypes.STRING(64), allowNull: false },
    resource: { type: DataTypes.STRING(64), allowNull: false },
    resource_id: { type: DataTypes.UUID, allowNull: true },
    old_data: { type: DataTypes.JSONB, allowNull: true },
    new_data: { type: DataTypes.JSONB, allowNull: true },
    ip_address: { type: DataTypes.STRING(64), allowNull: true },
    user_agent: { type: DataTypes.TEXT, allowNull: true },
  },
  {
    sequelize,
    modelName: 'AuditLog',
    tableName: 'audit_logs',
    paranoid: true,
    indexes: [
      { fields: ['user_id'] },
      { fields: ['resource', 'resource_id'] },
      { fields: ['action'] },
      { fields: ['created_at'] },
    ],
  },
);

module.exports = AuditLog;
