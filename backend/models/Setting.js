const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../config/database');

class Setting extends Model {}

Setting.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    key: {
      type: DataTypes.STRING(128),
      allowNull: false,
      unique: true,
    },
    value: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    label: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    description: { type: DataTypes.TEXT, allowNull: true },
    // Categories: assignment | display | notifications | system | general
    category: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: 'general',
    },
    // false → super_admin only
    is_editable_by_admin: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    updated_by: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
    },
  },
  {
    sequelize,
    modelName: 'Setting',
    tableName: 'settings',
    paranoid: false,
    indexes: [
      { unique: true, fields: ['key'] },
      { fields: ['category'] },
    ],
  },
);

module.exports = Setting;
