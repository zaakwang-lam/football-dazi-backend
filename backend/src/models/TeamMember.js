// src/models/TeamMember.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const TeamMember = sequelize.define('TeamMember', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    teamId: { type: DataTypes.INTEGER, allowNull: false, field: 'team_id' },
    userId: { type: DataTypes.INTEGER, allowNull: false, field: 'user_id' },
    role: { type: DataTypes.ENUM('captain', 'vice', 'player'), defaultValue: 'player' },
    position: { type: DataTypes.STRING(16) },
    status: { type: DataTypes.TINYINT, defaultValue: 1 }
  }, {
    tableName: 'team_members'
  });
  return TeamMember;
};