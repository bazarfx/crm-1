const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../config/database');

class Campaign extends Model {}

Campaign.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: { type: DataTypes.STRING(255), allowNull: false },
    ad_set_name: { type: DataTypes.STRING(255), allowNull: true },
    ad_name: { type: DataTypes.STRING(255), allowNull: true },
    platform: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: 'facebook',
    },
    language: { type: DataTypes.STRING(32), allowNull: true },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    start_date: { type: DataTypes.DATEONLY, allowNull: true },
    end_date: { type: DataTypes.DATEONLY, allowNull: true },
    budget: { type: DataTypes.DECIMAL(15, 2), allowNull: true },
    created_by: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
    },
  },
  {
    sequelize,
    modelName: 'Campaign',
    tableName: 'campaigns',
    paranoid: true,
    indexes: [
      { fields: ['name'] },
      { fields: ['language'] },
      { fields: ['is_active'] },
      { fields: ['platform'] },
    ],
  },
);

module.exports = Campaign;
