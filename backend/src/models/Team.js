// src/models/Team.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Team = sequelize.define('Team', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(64), allowNull: false },
    captainId: { type: DataTypes.INTEGER, allowNull: false, field: 'captain_id' },
    logo: { type: DataTypes.STRING(255) },
    district: { type: DataTypes.STRING(32) },
    motto: { type: DataTypes.STRING(128) },
    description: { type: DataTypes.TEXT },
    founded: { type: DataTypes.DATEONLY },
    level: { type: DataTypes.INTEGER, defaultValue: 1 },
    recruitment: { type: DataTypes.BOOLEAN, defaultValue: true },
    attendance: { type: DataTypes.INTEGER, defaultValue: 0 },
    wins: { type: DataTypes.INTEGER, defaultValue: 0 },
    draws: { type: DataTypes.INTEGER, defaultValue: 0 },
    losses: { type: DataTypes.INTEGER, defaultValue: 0 },
    members: { type: DataTypes.INTEGER, defaultValue: 1 },
    status: { type: DataTypes.TINYINT, defaultValue: 1 }
  }, {
    tableName: 'teams'
  });
  return Team;
};