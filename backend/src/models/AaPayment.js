// src/models/AaPayment.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const AaPayment = sequelize.define('AaPayment', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    teamId: { type: DataTypes.INTEGER, allowNull: false, field: 'team_id' },
    initiatorId: { type: DataTypes.INTEGER, allowNull: false, field: 'initiator_id' },
    title: { type: DataTypes.STRING(64) },
    totalAmount: { type: DataTypes.DECIMAL(10, 2), field: 'total_amount' },
    perAmount: { type: DataTypes.DECIMAL(10, 2), field: 'per_amount' },
    payerId: { type: DataTypes.INTEGER, field: 'payer_id' },
    status: {
      type: DataTypes.ENUM('pending', 'paid', 'closed'),
      defaultValue: 'pending'
    }
  }, {
    tableName: 'aa_payments'
  });
  return AaPayment;
};