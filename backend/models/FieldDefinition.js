const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../config/database');

const VALID_ENTITIES = ['lead', 'user', 'deal', 'campaign', 'group', 'lead_activity'];
const VALID_TYPES = [
  'text', 'long_text', 'number', 'currency', 'percent',
  'date', 'datetime', 'boolean',
  'dropdown', 'multiselect', 'tags',
  'phone', 'email', 'url', 'file_link',
];

class FieldDefinition extends Model {}

FieldDefinition.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    entity_type: {
      // Any registered module key (built-in OR custom). Membership in the
      // module registry is enforced in the controller (cheap cached lookup);
      // the model only enforces the snake_case shape.
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        is: {
          args: /^[a-z][a-z0-9_]{1,49}$/,
          msg: 'entity_type must be snake_case, start with a letter, 2-50 chars',
        },
      },
    },
    field_key: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        is: {
          args: /^[a-z][a-z0-9_]{1,49}$/,
          msg: 'field_key must be snake_case, start with a letter, 2-50 chars',
        },
      },
    },
    label: { type: DataTypes.STRING, allowNull: false },
    field_type: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: { isIn: [VALID_TYPES] },
    },
    options: { type: DataTypes.JSONB, defaultValue: [] },
    validation: { type: DataTypes.JSONB, defaultValue: {} },
    default_value: { type: DataTypes.JSONB, defaultValue: null },
    // Conditional visibility (Zoho "basic conditions"). null = always visible.
    // Shape: { field: '<field_key|native_col>', operator: '<op>', value: <any> }.
    // The field is shown/required ONLY when `values[field] <op> value`. Column
    // already exists in the DB (nullable); this attribute just serializes it —
    // it is not a secret.
    visibility_condition: { type: DataTypes.JSONB, allowNull: true },
    visible_to_roles: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: [
        'super_admin', 'admin', 'schema_editor', 'floor_manager',
        'senior', 'tele_sales', 'back_office', 'auditor',
      ],
    },
    editable_by_roles: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: ['super_admin', 'admin', 'floor_manager', 'senior', 'tele_sales'],
    },
    is_required:         { type: DataTypes.BOOLEAN, defaultValue: false },
    is_filterable:       { type: DataTypes.BOOLEAN, defaultValue: true },
    is_visible_in_list:  { type: DataTypes.BOOLEAN, defaultValue: false },
    helper_text:         { type: DataTypes.STRING },
    section:             { type: DataTypes.STRING, defaultValue: 'custom' },
    display_order:       { type: DataTypes.INTEGER, defaultValue: 100 },
    is_archived:         { type: DataTypes.BOOLEAN, defaultValue: false },
    archived_at:         { type: DataTypes.DATE, allowNull: true },
    archived_by:         { type: DataTypes.UUID, allowNull: true, references: { model: 'users', key: 'id' } },
    created_by:          { type: DataTypes.UUID, allowNull: true, references: { model: 'users', key: 'id' } },
  },
  {
    sequelize,
    modelName: 'FieldDefinition',
    tableName: 'field_definitions',
    timestamps: true,
    paranoid: false,
    indexes: [
      { unique: true, fields: ['entity_type', 'field_key'] },
      { fields: ['entity_type', 'is_archived', 'display_order'] },
    ],
  },
);

FieldDefinition.VALID_ENTITIES = VALID_ENTITIES;
FieldDefinition.VALID_TYPES = VALID_TYPES;

module.exports = FieldDefinition;
