const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../config/database');

// A teleseller/senior can ask to undo a deal they closed (e.g. ARK reported
// FTD against the wrong lead, the deposit later reversed, etc.). Admin or
// super_admin reviews and either approves (clears ftd_at / deposit /
// closer snapshot, reverts status) or rejects with notes.
class DealUndoRequest extends Model {}

DealUndoRequest.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    lead_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'leads', key: 'id' },
    },
    requested_by_user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
    },
    reason: { type: DataTypes.TEXT, allowNull: false },
    status: {
      type: DataTypes.STRING(16),
      allowNull: false,
      defaultValue: 'pending', // pending | approved | rejected | cancelled
    },
    reviewed_by_user_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
    },
    reviewed_at: { type: DataTypes.DATE, allowNull: true },
    review_notes: { type: DataTypes.TEXT, allowNull: true },

    // Snapshot of the deal at the moment the request was filed — used for
    // auditing and to remind the reviewer what they're undoing.
    snapshot: { type: DataTypes.JSONB, allowNull: true },
  },
  {
    sequelize,
    modelName: 'DealUndoRequest',
    tableName: 'deal_undo_requests',
    paranoid: true,
    indexes: [
      { fields: ['lead_id'] },
      { fields: ['requested_by_user_id'] },
      { fields: ['status'] },
      { fields: ['status', 'created_at'] },
    ],
  },
);

module.exports = DealUndoRequest;
