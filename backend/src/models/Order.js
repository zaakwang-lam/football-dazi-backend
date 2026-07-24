// src/models/Order.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Order = sequelize.define('Order', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    orderNo: { type: DataTypes.STRING(32), unique: true, allowNull: false, field: 'order_no' },
    userId: { type: DataTypes.INTEGER, allowNull: false, field: 'user_id' },
    courtId: { type: DataTypes.INTEGER, allowNull: false, field: 'court_id' },
    scheduleId: { type: DataTypes.INTEGER, field: 'schedule_id' },
    amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    payAmount: { type: DataTypes.DECIMAL(10, 2), field: 'pay_amount' },
    status: {
      type: DataTypes.ENUM('pending', 'paid', 'refunded', 'canceled', 'completed'),
      defaultValue: 'pending'
    },
    payMethod: { type: DataTypes.STRING(16), field: 'pay_method' },
    transactionId: { type: DataTypes.STRING(64), field: 'transaction_id' },
    payTime: { type: DataTypes.DATE, field: 'pay_time' },
    refundTime: { type: DataTypes.DATE, field: 'refund_time' },
    contactName: { type: DataTypes.STRING(32), field: 'contact_name' },
    contactPhone: { type: DataTypes.STRING(20), field: 'contact_phone' },
    remark: { type: DataTypes.STRING(255) }
  }, {
    tableName: 'orders'
  });
  return Order;
};