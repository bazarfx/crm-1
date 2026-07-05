const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../config/database');

// Zoho-style "Saved Filters" / "Saved Views".
//
// A user saves a NAMED filter set for a given list-entity (leads, users,
// deals, campaigns, groups, or any custom module key). They can then switch
// between their saved views like Zoho's left-rail filter list.
//
// Ownership + sharing:
//   • owner_id      → the creator. Their own views are always visible to them.
//   • is_shared     → when true the view is visible to EVERY user for that
//                     entity (a team/org view). Only admin-tier roles may set
//                     this; regular users' views stay private.
//   • is_default    → at most one per (owner_id, entity_type). The controller
//                     clears the flag on the owner's other views when set.
//
// The saved state mirrors the shape the list page already speaks:
//   • filters   → the page's FLAT filter object, including cf_* custom-field
//                 keys (e.g. { status:'new', cf_risk:'high' }).
//   • criteria  → the advanced-criteria object { match, rules:[...] } — the
//                 same shape used by AssignmentRule.criteria / utils/criteria.
//   • columns   → array of visible column keys (column chooser state).
//   • sort      → { field, dir } for the default sort of this view.
//
// entity_type is a loose string (== Module.key / FieldDefinition.entity_type),
// deliberately NOT an FK — new custom modules need no migration here.
class SavedView extends Model {}

SavedView.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    entity_type: {
      type: DataTypes.STRING(32),
      allowNull: false,
      comment: "List-entity this view belongs to: 'lead' | 'user' | 'deal' | 'campaign' | 'group' | <module key>.",
    },
    name: {
      type: DataTypes.STRING(120),
      allowNull: false,
    },
    owner_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      comment: 'Creator of the view. Their own views are always visible to them.',
    },
    is_shared: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'When true the view is visible to all users for this entity.',
    },
    filters: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
      comment: "The page's flat filter object incl. cf_* custom-field keys.",
    },
    criteria: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'Advanced criteria { match:"and"|"or", rules:[...] } — null for simple filters.',
    },
    columns: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'Array of visible column keys (column-chooser state).',
    },
    sort: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'Default sort for this view: { field, dir }.',
    },
    is_default: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'At most one per (owner_id, entity_type) — the owner\'s default view.',
    },
    position: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: 'Ordering within the saved-views rail (lower shows first).',
    },
    created_by: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
    },
  },
  {
    sequelize,
    modelName: 'SavedView',
    tableName: 'saved_views',
    paranoid: true,
    indexes: [
      { fields: ['entity_type', 'owner_id'] },
      { fields: ['entity_type', 'is_shared'] },
      { fields: ['owner_id', 'entity_type', 'is_default'] },
    ],
  },
);

module.exports = SavedView;
