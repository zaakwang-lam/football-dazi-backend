// src/models/AaPaymentItem.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const AaPaymentItem = sequelize.define('AaPaymentItem', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    paymentId: { type: DataTypes.INTEGER, allowNull: false, field: 'payment_id' },
    userId: { type: DataTypes.INTEGER, field: 'user_id' },
    displayName: { type: DataTypes.STRING(32), field: 'display_name' },
    amount: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
    included: { type: DataTypes.TINYINT, defaultValue: 1 },
    payStatus: {
      type: DataTypes.STRING(16),
      defaultValue: 'unpaid',
      field: 'pay_status'
    },
    outTradeNo: { type: DataTypes.STRING(32), field: 'out_trade_no' },
    transactionId: { type: DataTypes.STRING(64), field: 'transaction_id' }
  }, {
    tableName: 'aa_payment_items'
  });
  return AaPaymentItem;
};
