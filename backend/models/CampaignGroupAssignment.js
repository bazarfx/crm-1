const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../config/database');

class CampaignGroupAssignment extends Model {}

CampaignGroupAssignment.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    campaign_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'campaigns', key: 'id' },
    },
    group_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'groups', key: 'id' },
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    assigned_by: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
    },
  },
  {
    sequelize,
    modelName: 'CampaignGroupAssignment',
    tableName: 'campaign_group_assignments',
    paranoid: true,
    indexes: [
      { unique: true, fields: ['campaign_id', 'group_id'] },
      { fields: ['campaign_id'] },
      { fields: ['group_id'] },
    ],
  },
);

module.exports = CampaignGroupAssignment;
