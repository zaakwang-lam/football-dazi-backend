// src/models/LfgPost.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const LfgPost = sequelize.define('LfgPost', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.INTEGER, allowNull: false, field: 'user_id' },
    teamId: { type: DataTypes.INTEGER, field: 'team_id' },
    type: { type: DataTypes.ENUM('sub', 'war', 'join'), allowNull: false },
    title: { type: DataTypes.STRING(64) },
    location: { type: DataTypes.STRING(128) },
    playTime: { type: DataTypes.DATE, field: 'play_time' },
    needCount: { type: DataTypes.INTEGER, defaultValue: 1, field: 'need_count' },
    level: { type: DataTypes.STRING(32) },
    contact: { type: DataTypes.STRING(64) },
    description: { type: DataTypes.TEXT },
    status: { type: DataTypes.ENUM('open', 'closed', 'full'), defaultValue: 'open' },
    joinedCount: { type: DataTypes.INTEGER, defaultValue: 0, field: 'joined_count' }
  }, {
    tableName: 'lfg_posts'
  });
  return LfgPost;
};