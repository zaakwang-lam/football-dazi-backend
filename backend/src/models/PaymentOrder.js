// src/models/PaymentOrder.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const PaymentOrder = sequelize.define('PaymentOrder', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    orderNo: { type: DataTypes.STRING(32), unique: true, allowNull: false, field: 'order_no' },
    transactionId: { type: DataTypes.STRING(64), unique: true, field: 'transaction_id' },
    userId: { type: DataTypes.INTEGER, allowNull: false, field: 'user_id' },
    courtId: { type: DataTypes.INTEGER, field: 'court_id' },
    businessType: { type: DataTypes.ENUM('court_book', 'aa_payment'), field: 'business_type' },
    amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    status: {
      type: DataTypes.ENUM('pending', 'paid', 'refunded', 'canceled'),
      defaultValue: 'pending'
    },
    payMethod: { type: DataTypes.STRING(16), field: 'pay_method' },
    payTime: { type: DataTypes.DATE, field: 'pay_time' },
    prepayId: { type: DataTypes.STRING(64), field: 'prepay_id' }
  }, {
    tableName: 'payment_orders'
  });
  return PaymentOrder;
};