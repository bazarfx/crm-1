const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../config/database');

class RoundRobinState extends Model {}

RoundRobinState.init(
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
    campaign_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'campaigns', key: 'id' },
    },
    current_index: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    total_assigned: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    last_assigned_user_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
    },
    last_assigned_at: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    modelName: 'RoundRobinState',
    tableName: 'round_robin_states',
    paranoid: true,
    indexes: [
      { unique: true, fields: ['group_id', 'campaign_id'] },
      { fields: ['group_id'] },
    ],
  },
);

module.exports = RoundRobinState;
