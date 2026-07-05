const { DataTypes, Model } = require('sequelize');
const bcrypt = require('bcrypt');
const { sequelize } = require('../config/database');

const ROLES = [
  'super_admin',
  'admin',
  'schema_editor',
  'floor_manager',
  'senior',
  'tele_sales',
  'back_office',
  'auditor',
  'archive',
  'custom',
];

class User extends Model {
  async comparePassword(plain) {
    return bcrypt.compare(plain, this.password);
  }

  toSafeJSON() {
    const json = this.toJSON();
    delete json.password;
    // 2FA material must never leave the server, even if a scope accidentally
    // included it. Belt-and-suspenders alongside defaultScope exclusion.
    delete json.two_factor_secret;
    delete json.two_factor_pending_secret;
    delete json.two_factor_backup_codes;
    return json;
  }
}

User.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    first_name: { type: DataTypes.STRING(64), allowNull: true },
    last_name: { type: DataTypes.STRING(64), allowNull: true },
    email: {
      type: DataTypes.STRING(128),
      allowNull: false,
      unique: true,
      validate: { isEmail: true },
    },
    password: { type: DataTypes.STRING(255), allowNull: false },
    role: {
      // STRING, not ENUM, so custom roles created at runtime are valid values.
      // `ROLES` lists the built-in system roles; the `roles` table is the live
      // registry (see models/Role + utils/roles).
      type: DataTypes.STRING(64),
      allowNull: false,
      defaultValue: 'tele_sales',
    },
    department: { type: DataTypes.STRING(64), allowNull: true },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    last_login_at: { type: DataTypes.DATE, allowNull: true },
    avatar_url: { type: DataTypes.STRING(512), allowNull: true },
    languages: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: [],
      allowNull: false,
      comment: 'Languages this user speaks. Round robin assigns leads matching any of these.',
    },
    second_language: { type: DataTypes.STRING(32), allowNull: true },
    third_language: { type: DataTypes.STRING(32), allowNull: true },
    gallabox_user_id: { type: DataTypes.STRING(128), allowNull: true },
    parent_node_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
    },
    alias: { type: DataTypes.STRING(64), allowNull: true },
    rr_last_assigned_at: { type: DataTypes.DATE, allowNull: true },
    rr_daily_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    must_change_password: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    custom_fields: {
      type: DataTypes.JSONB,
      defaultValue: {},
      allowNull: false,
      comment: 'Dynamic custom fields, structure defined by FieldDefinition registry',
    },
    // ── Two-factor auth (opt-in TOTP) ─────────────────────────────────────────
    // These are NEVER serialized: excluded from defaultScope + stripped in
    // toSafeJSON(). Only readable via the `withTwoFactor` scope on the server.
    two_factor_enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    two_factor_secret: {
      // Confirmed base32 TOTP secret. Null until 2FA is enabled.
      type: DataTypes.STRING(64),
      allowNull: true,
    },
    two_factor_pending_secret: {
      // Base32 secret generated during /setup but not yet confirmed via /enable.
      type: DataTypes.STRING(64),
      allowNull: true,
    },
    two_factor_backup_codes: {
      // Array of bcrypt-hashed one-time backup codes. Null / [] when none.
      type: DataTypes.JSONB,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: 'User',
    tableName: 'users',
    paranoid: true,
    defaultScope: {
      // 2FA secrets follow the same rule as `password`: never in default reads.
      attributes: {
        exclude: [
          'password',
          'two_factor_secret',
          'two_factor_pending_secret',
          'two_factor_backup_codes',
        ],
      },
    },
    scopes: {
      withPassword: { attributes: { include: ['password'] } },
      // Server-only: re-includes 2FA material for setup/verify flows.
      withTwoFactor: {
        attributes: {
          include: [
            'two_factor_secret',
            'two_factor_pending_secret',
            'two_factor_backup_codes',
          ],
        },
      },
    },
    indexes: [
      { fields: ['email'], unique: true },
      { fields: ['role'] },
      { fields: ['is_active'] },
      { fields: ['parent_node_id'] },
      { fields: ['languages'], using: 'GIN' },
    ],
    validate: {
      languagesRequiredForOperators() {
        if (['tele_sales', 'senior'].includes(this.role)) {
          if (!Array.isArray(this.languages) || this.languages.length === 0) {
            throw new Error('At least one language is required for tele_sales and senior roles');
          }
        }
      },
      validLanguageValues() {
        const VALID = ['english', 'tamil', 'telugu', 'hindi', 'marathi', 'gujarati', 'bengali', 'kannada', 'malayalam', 'punjabi'];
        if (Array.isArray(this.languages)) {
          for (const l of this.languages) {
            if (!VALID.includes(l)) throw new Error(`Invalid language: ${l}`);
          }
        }
      },
      noDuplicateLanguages() {
        if (Array.isArray(this.languages)) {
          const set = new Set(this.languages);
          if (set.size !== this.languages.length) throw new Error('Duplicate languages not allowed');
        }
      },
    },
    hooks: {
      beforeCreate: async (user) => {
        if (user.password) {
          const rounds = Number(process.env.BCRYPT_ROUNDS) || 10;
          user.password = await bcrypt.hash(user.password, rounds);
        }
      },
      beforeUpdate: async (user) => {
        if (user.changed('password')) {
          const rounds = Number(process.env.BCRYPT_ROUNDS) || 10;
          user.password = await bcrypt.hash(user.password, rounds);
        }
      },
    },
  },
);

User.ROLES = ROLES;

module.exports = User;
