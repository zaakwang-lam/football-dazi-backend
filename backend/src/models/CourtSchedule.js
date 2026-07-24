// src/models/CourtSchedule.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const CourtSchedule = sequelize.define('CourtSchedule', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    courtId: { type: DataTypes.INTEGER, allowNull: false, field: 'court_id' },
    date: { type: DataTypes.DATEONLY, allowNull: false },
    timeSlot: { type: DataTypes.STRING(16), allowNull: false, field: 'time_slot' },
    status: {
      type: DataTypes.ENUM('free', 'booked', 'closed'),
      defaultValue: 'free'
    },
    price: { type: DataTypes.DECIMAL(10, 2) },
    orderId: { type: DataTypes.INTEGER, field: 'order_id' }
  }, {
    tableName: 'court_schedules'
  });
  return CourtSchedule;
};