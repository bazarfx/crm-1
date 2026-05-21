const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../config/database');

class GroupMember extends Model {}

GroupMember.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    group_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'groups', key: 'id' },
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
    },
    joined_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    rr_index: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    sequelize,
    modelName: 'GroupMember',
    tableName: 'group_members',
    paranoid: true,
    indexes: [
      { unique: true, fields: ['group_id', 'user_id'] },
      { fields: ['group_id'] },
      { fields: ['user_id'] },
      { fields: ['group_id', 'rr_index'] },
    ],
  },
);

module.exports = GroupMember;
