const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * Role — dynamic, hierarchical roles (Zoho-style role tree).
 *
 * `key` is the stable slug stored on User.role and RolePermission.role, so the
 * existing permission machinery keeps working unchanged: a role is just a row
 * here whose `key` keys the permission tables. System roles ship pre-seeded
 * (see utils/roles.js); admins can create custom roles at runtime.
 *
 * The tree is modelled with a self-referential `parent_role_id`. The hierarchy
 * is currently used for org visualisation + management; data-sharing
 * enforcement (a parent role seeing subordinate records) can layer on top of
 * `getDescendantKeys()` later without a schema change.
 */
const Role = sequelize.define(
  'Role',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    // Immutable slug. Matches User.role / RolePermission.role values.
    key: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: true,
    },
    name: { type: DataTypes.STRING(96), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    // Hex colour for badges/dots in the UI.
    color: { type: DataTypes.STRING(16), allowNull: true, defaultValue: '#64748B' },
    parent_role_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'roles', key: 'id' },
    },
    // System roles cannot be deleted and keep their key forever.
    is_system: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    // Whether users can be assigned this role (the "custom" sentinel is
    // assignable but hidden from the tree, for per-user permission users).
    is_assignable: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    // Whether this role appears as a node in the hierarchy tree.
    show_in_tree: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    // Zoho-style toggle reserved for future hierarchy-based data sharing.
    share_data_with_peers: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    display_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    created_by: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
    },
  },
  {
    tableName: 'roles',
    paranoid: true,
    indexes: [
      { unique: true, fields: ['key'] },
      { fields: ['parent_role_id'] },
    ],
  }
);

module.exports = Role;
