// src/models/Checkin.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Checkin = sequelize.define('Checkin', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    teamId: { type: DataTypes.INTEGER, allowNull: false, field: 'team_id' },
    userId: { type: DataTypes.INTEGER, allowNull: false, field: 'user_id' },
    scheduleId: { type: DataTypes.INTEGER, field: 'schedule_id' },
    checkInTime: { type: DataTypes.DATE, defaultValue: DataTypes.NOW, field: 'check_in_time' },
    longitude: { type: DataTypes.DECIMAL(10, 6) },
    latitude: { type: DataTypes.DECIMAL(9, 6) },
    status: { type: DataTypes.ENUM('normal', 'late', 'manual'), defaultValue: 'normal' }
  }, {
    tableName: 'checkins'
  });
  return Checkin;
};