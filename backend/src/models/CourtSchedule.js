// src/models/CourtSchedule.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const CourtSchedule = sequelize.define('CourtSchedule', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    courtId: { type: DataTypes.INTEGER, allowNull: false, field: 'court_id' },
    date: { type: DataTypes.DATEONLY, allowNull: false },
    timeSlot: { type: DataTypes.STRING(16), allowNull: false, field: 'time_slot' },
    pitchType: { type: DataTypes.STRING(16), allowNull: true, defaultValue: '5人场', field: 'pitch_type' },
    status: {
      type: DataTypes.ENUM('free', 'booked', 'closed'),
      defaultValue: 'free'
    },
    price: { type: DataTypes.DECIMAL(10, 2) },
    floorPrice: { type: DataTypes.DECIMAL(10, 2), field: 'floor_price' },
    pendingFloorPrice: { type: DataTypes.DECIMAL(10, 2), field: 'pending_floor_price' },
    floorEffectiveAt: { type: DataTypes.DATE, field: 'floor_effective_at' },
    orderId: { type: DataTypes.INTEGER, field: 'order_id' }
  }, {
    tableName: 'court_schedules'
  });
  return CourtSchedule;
};