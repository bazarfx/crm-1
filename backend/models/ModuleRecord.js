const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * ModuleRecord — one shared table holding the records of ALL custom modules.
 *
 * The values column is deliberately named `custom_fields` (matching every
 * other entity) so the entire dynamic stack reuses unchanged: validation
 * (processIncomingCustomFields/validateAndCoerce), filtering
 * (applyCustomFieldFilters), the field-admin raw JSONB SQL, and the frontend
 * DynamicForm/DynamicCell/DynamicFilter components. `module_key` discriminates
 * which module a row belongs to (== Module.key == FieldDefinition.entity_type).
 *
 * Global define supplies created_at/updated_at/deleted_at + paranoid soft
 * delete, so this model only declares its own columns.
 */
const ModuleRecord = sequelize.define(
  'ModuleRecord',
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    module_key: { type: DataTypes.STRING(64), allowNull: false },
    custom_fields: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    created_by: { type: DataTypes.UUID, allowNull: true, references: { model: 'users', key: 'id' } },
  },
  {
    tableName: 'module_records',
    paranoid: true,
    indexes: [
      { fields: ['module_key', 'created_at'] },
      { fields: ['custom_fields'], using: 'gin' },
    ],
  },
);

module.exports = ModuleRecord;
