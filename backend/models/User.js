const { DataTypes, Model } = require('sequelize');
const bcrypt = require('bcrypt');
const { sequelize } = require('../config/database');

const ROLES = [
  'super_admin',
  'admin',
  'floor_manager',
  'senior',
  'tele_sales',
  'back_office',
  'auditor',
  'archive',
];

class User extends Model {
  async comparePassword(plain) {
    return bcrypt.compare(plain, this.password);
  }

  toSafeJSON() {
    const json = this.toJSON();
    delete json.password;
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
      type: DataTypes.ENUM(...ROLES),
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
    native_language: { type: DataTypes.STRING(32), allowNull: true },
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
  },
  {
    sequelize,
    modelName: 'User',
    tableName: 'users',
    paranoid: true,
    defaultScope: {
      attributes: { exclude: ['password'] },
    },
    scopes: {
      withPassword: { attributes: { include: ['password'] } },
    },
    indexes: [
      { fields: ['email'], unique: true },
      { fields: ['role'] },
      { fields: ['is_active'] },
      { fields: ['parent_node_id'] },
    ],
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
