const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * Module — the registry of CRM modules (Zoho-style "Modules").
 *
 * `key` is a snake_case slug that IS the `entity_type` used by FieldDefinition
 * and the `module_key` on ModuleRecord — the same loose-coupling-by-string the
 * roles registry uses (no FK migrations). The 6 built-ins (lead/user/deal/…)
 * are seeded as system modules that map to their OWN tables; custom modules
 * store their rows in the shared `module_records` table.
 */
const Module = sequelize.define(
  'Module',
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    key: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    label_singular: { type: DataTypes.STRING(96), allowNull: false },
    label_plural: { type: DataTypes.STRING(96), allowNull: false },
    icon: { type: DataTypes.STRING(48), allowNull: true },
    color: { type: DataTypes.STRING(16), allowNull: true, defaultValue: '#64748B' },
    description: { type: DataTypes.TEXT, allowNull: true },
    // System modules (the built-ins) cannot be deleted and keep their key.
    is_system: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    display_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    created_by: { type: DataTypes.UUID, allowNull: true, references: { model: 'users', key: 'id' } },
  },
  {
    tableName: 'modules',
    paranoid: true,
    indexes: [
      { unique: true, fields: ['key'] },
      { fields: ['is_active', 'display_order'] },
    ],
  },
);

module.exports = Module;
