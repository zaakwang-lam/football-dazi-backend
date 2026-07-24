// src/models/PaymentRefund.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const PaymentRefund = sequelize.define('PaymentRefund', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    refundNo: { type: DataTypes.STRING(32), unique: true, allowNull: false, field: 'refund_no' },
    refundId: { type: DataTypes.STRING(64), unique: true, field: 'refund_id' },
    orderNo: { type: DataTypes.STRING(32), allowNull: false, field: 'order_no' },
    amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    reason: { type: DataTypes.STRING(255) },
    status: {
      type: DataTypes.ENUM('processing', 'success', 'failed'),
      defaultValue: 'processing'
    },
    operatorId: { type: DataTypes.INTEGER, field: 'operator_id' },
    completedAt: { type: DataTypes.DATE, field: 'completed_at' }
  }, {
    tableName: 'payment_refunds'
  });
  return PaymentRefund;
};