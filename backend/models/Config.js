const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../config/database');

class Config extends Model {}

Config.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    category: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    key: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    label: {
      type: DataTypes.STRING(128),
      allowNull: false,
    },
    color: {
      type: DataTypes.STRING(16),
      allowNull: true,
    },
    sort_order: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: 'Config',
    tableName: 'configs',
    paranoid: true,
    indexes: [
      { fields: ['category'] },
      { unique: true, fields: ['category', 'key'] },
    ],
  },
);

module.exports = Config;
