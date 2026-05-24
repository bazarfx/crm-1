const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../config/database');

class Group extends Model {}

Group.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: { type: DataTypes.STRING(128), allowNull: false },
    type: { type: DataTypes.STRING(32), allowNull: true },
    language: { type: DataTypes.STRING(32), allowNull: true },
    description: { type: DataTypes.TEXT, allowNull: true },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    created_by: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
    },
    custom_fields: {
      type: DataTypes.JSONB,
      defaultValue: {},
      allowNull: false,
      comment: 'Dynamic custom fields, structure defined by FieldDefinition registry',
    },
  },
  {
    sequelize,
    modelName: 'Group',
    tableName: 'groups',
    paranoid: true,
    indexes: [
      { fields: ['type'] },
      { fields: ['language'] },
      { fields: ['is_active'] },
    ],
  },
);

module.exports = Group;
