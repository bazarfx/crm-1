const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const VALID_LEVELS = ['none', 'all', 'own', 'group', 'read'];

// Per-user permission override. Used by users with role='custom' — those users
// don't inherit anything from RolePermission; their entire permission map lives
// in this table. The permission resolver short-circuits to this table whenever
// it sees role='custom'.
const UserPermission = sequelize.define(
  'UserPermission',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
    },
    permission_key: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    level: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'none',
      validate: { isIn: [VALID_LEVELS] },
    },
    updated_by: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
    },
  },
  {
    tableName: 'user_permissions',
    timestamps: true,
    paranoid: false, // hard-delete on permission edit; full row replacement
    underscored: true,
    indexes: [
      { unique: true, fields: ['user_id', 'permission_key'] },
      { fields: ['user_id'] },
    ],
  },
);

UserPermission.VALID_LEVELS = VALID_LEVELS;

module.exports = UserPermission;
