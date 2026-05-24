const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../config/database');

class Lead extends Model {}

Lead.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },

    // ───── IDENTITY ─────
    first_name: { type: DataTypes.STRING(64), allowNull: true },
    last_name: { type: DataTypes.STRING(64), allowNull: true },
    email: { type: DataTypes.STRING(128), allowNull: true },
    phone: { type: DataTypes.STRING(32), allowNull: false },
    mobile: { type: DataTypes.STRING(32), allowNull: true },
    whatsapp_number: { type: DataTypes.STRING(32), allowNull: true },
    new_whatsapp_number: { type: DataTypes.STRING(32), allowNull: true },
    work_phone: { type: DataTypes.STRING(32), allowNull: true },
    date_of_birth: { type: DataTypes.DATEONLY, allowNull: true },
    location: { type: DataTypes.STRING(128), allowNull: true },
    street: { type: DataTypes.STRING(255), allowNull: true },
    city: { type: DataTypes.STRING(64), allowNull: true },
    state: { type: DataTypes.STRING(64), allowNull: true },
    zip_code: { type: DataTypes.STRING(16), allowNull: true },
    country: {
      type: DataTypes.STRING(64),
      allowNull: false,
      defaultValue: 'India',
    },

    // ───── CLASSIFICATION (values come from Config table) ─────
    lead_status: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: 'new',
    },
    lead_source: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: 'facebook_ads',
    },
    lead_category: { type: DataTypes.STRING(32), allowNull: true },
    department: { type: DataTypes.STRING(64), allowNull: true },
    language: { type: DataTypes.STRING(32), allowNull: true },
    preferred_language: { type: DataTypes.STRING(32), allowNull: true },
    contact_method: { type: DataTypes.STRING(32), allowNull: true },
    industry: { type: DataTypes.STRING(64), allowNull: true },

    // ───── TRADING ─────
    trading_experience: { type: DataTypes.STRING(32), allowNull: true },
    current_platform: { type: DataTypes.STRING(64), allowNull: true },
    preferred_market: { type: DataTypes.STRING(64), allowNull: true },

    // ───── INTERACTION ─────
    total_messages: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    messages_sent: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    messages_received: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    follow_ups_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    inbound_clients_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    outbound_clients_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    last_interaction_date: { type: DataTypes.DATE, allowNull: true },
    last_contact_date: { type: DataTypes.DATE, allowNull: true },
    total_attempted_call_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    total_call_duration: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    date_of_consent: { type: DataTypes.DATE, allowNull: true },

    // ───── ARK TERMINAL ─────
    ark_username: { type: DataTypes.STRING(64), allowNull: true },
    ark_account_number: { type: DataTypes.STRING(64), allowNull: true },
    ark_uid: { type: DataTypes.STRING(64), allowNull: true },
    account_opened_date: { type: DataTypes.DATEONLY, allowNull: true },
    account_opened_at: { type: DataTypes.DATE, allowNull: true },
    last_terminal_activity_at: { type: DataTypes.DATE, allowNull: true },
    ftd_at: { type: DataTypes.DATE, allowNull: true },
    deposited_amount: { type: DataTypes.DECIMAL(15, 2), allowNull: true },
    deposited_time: { type: DataTypes.DATE, allowNull: true },

    // ───── DEAL ATTRIBUTION ─────
    // Snapshotted at the moment the lead becomes a deal (status → ftd_done OR
    // ftd_at gets set, whichever fires first). Frozen against later reassignment
    // or user deletion so analytics always attribute the close to the actual
    // teleseller who made it happen.
    closed_by_user_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      comment: 'User who closed the deal (snapshot at FTD time, immutable)',
    },
    closed_by_name: {
      type: DataTypes.STRING(128),
      allowNull: true,
      comment: 'Denormalized full name — survives user delete/rename',
    },
    closed_at: { type: DataTypes.DATE, allowNull: true },

    // ───── CAMPAIGN (denormalized snapshot at ingest) ─────
    campaign_name: { type: DataTypes.STRING(255), allowNull: true },
    ad_set_name: { type: DataTypes.STRING(255), allowNull: true },
    ad_name: { type: DataTypes.STRING(255), allowNull: true },
    ad_platform: { type: DataTypes.STRING(32), allowNull: true },
    facebook_lead_id: { type: DataTypes.STRING(128), allowNull: true, unique: true },
    social_lead_id: { type: DataTypes.STRING(128), allowNull: true },

    // ───── SYSTEM ─────
    quiz_score: { type: DataTypes.INTEGER, allowNull: true },
    quiz_bonus: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
    is_inactive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    is_dnd: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    dnd_at: { type: DataTypes.DATE, allowNull: true },
    cold_date: { type: DataTypes.DATE, allowNull: true },
    is_reactive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    trnf_at: { type: DataTypes.DATE, allowNull: true },

    // ───── TRIAL / DEMO ─────
    is_trial: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    trial_label: { type: DataTypes.STRING(128), allowNull: true },
    trial_scenario: { type: DataTypes.STRING(64), allowNull: true },

    // ───── PAYLOADS ─────
    source_raw: { type: DataTypes.JSONB, allowNull: true },
    ark_raw: { type: DataTypes.JSONB, allowNull: true },

    // ───── DYNAMIC CUSTOM FIELDS ─────
    // Schema is defined in field_definitions; values are validated + coerced
    // by utils/customFieldValidator on every write path.
    custom_fields: {
      type: DataTypes.JSONB,
      defaultValue: {},
      allowNull: false,
      comment: 'Dynamic custom fields, structure defined by FieldDefinition registry',
    },

    // ───── FOREIGN KEYS ─────
    // Lead is ASSIGNED to a user (teleseller or senior). Leads are company
    // property — they are not "owned" by the user they're assigned to.
    assigned_to_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      comment: 'The teleseller or senior this lead is currently assigned to',
    },
    previous_assigned_to_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
    },
    deleted_by: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
    },
    group_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'groups', key: 'id' },
    },
    campaign_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'campaigns', key: 'id' },
    },
  },
  {
    sequelize,
    modelName: 'Lead',
    tableName: 'leads',
    paranoid: true,
    indexes: [
      { fields: ['phone'] },
      { fields: ['ark_username'] },
      { fields: ['facebook_lead_id'], unique: true },
      { fields: ['lead_status'] },
      { fields: ['assigned_to_id'] },
      { fields: ['closed_by_user_id'] },
      { fields: ['language', 'lead_status'] },
      { fields: ['campaign_id', 'lead_status'] },
      { fields: ['group_id'] },
      { fields: ['created_at'] },
      { fields: ['is_trial'] },
    ],
  },
);

module.exports = Lead;
