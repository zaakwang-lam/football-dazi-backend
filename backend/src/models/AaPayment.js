// src/models/AaPayment.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const AaPayment = sequelize.define('AaPayment', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    teamId: { type: DataTypes.INTEGER, allowNull: false, field: 'team_id' },
    lfgId: { type: DataTypes.INTEGER, field: 'lfg_id' },
    initiatorId: { type: DataTypes.INTEGER, allowNull: false, field: 'initiator_id' },
    title: { type: DataTypes.STRING(64) },
    remark: { type: DataTypes.STRING(255) },
    totalAmount: { type: DataTypes.DECIMAL(10, 2), field: 'total_amount', defaultValue: 0 },
    perAmount: { type: DataTypes.DECIMAL(10, 2), field: 'per_amount', defaultValue: 0 },
    matchEnded: { type: DataTypes.TINYINT, field: 'match_ended', defaultValue: 0 },
    status: { type: DataTypes.STRING(16), defaultValue: 'draft' }
  }, {
    tableName: 'aa_payments'
  });
  return AaPayment;
};
