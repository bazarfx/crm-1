const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ALL_ROLES = [
  'super_admin', 'admin', 'floor_manager', 'senior',
  'tele_sales', 'back_office', 'auditor', 'archive', 'custom',
];

const VALID_LEVELS = ['none', 'all', 'own', 'group', 'read'];

const RolePermission = sequelize.define(
  'RolePermission',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    role: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: { isIn: [ALL_ROLES] },
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
    category: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'general',
    },
    description: {
      type: DataTypes.STRING,
    },
    updated_by: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' }, // matches User.tableName
    },
  },
  {
    tableName: 'RolePermissions',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['role', 'permission_key'] },
      { fields: ['role'] },
      { fields: ['category'] },
    ],
  }
);

// ─── LAYER 1 PROTECTION ─────────────────────────────────────────────
// super_admin row cannot be modified or deleted via Sequelize, EVER.
// (Layer 2 short-circuits in utils/permissions.js; Layer 3 rejects in
//  the controller; this is the deepest safety net.)
// ───────────────────────────────────────────────────────────────────

RolePermission.addHook('beforeUpdate', (rp) => {
  const previousRole = rp._previousDataValues?.role || rp.getDataValue('role');
  if (previousRole === 'super_admin') {
    throw new Error(
      'LOCKED: super_admin permissions cannot be modified. Super admin always has full access.'
    );
  }
});

RolePermission.addHook('beforeDestroy', (rp) => {
  if (rp.role === 'super_admin') {
    throw new Error('LOCKED: super_admin permission rows cannot be deleted.');
  }
});

RolePermission.addHook('beforeBulkUpdate', (options) => {
  // Reject bulk updates that would touch super_admin
  const whereRole = options.where?.role;
  if (
    whereRole === 'super_admin' ||
    (Array.isArray(whereRole) && whereRole.includes('super_admin'))
  ) {
    throw new Error('LOCKED: super_admin permissions cannot be bulk-modified.');
  }
});

RolePermission.ALL_ROLES = ALL_ROLES;
RolePermission.VALID_LEVELS = VALID_LEVELS;

module.exports = RolePermission;
