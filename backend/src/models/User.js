// src/models/User.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const User = sequelize.define('User', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    openid: { type: DataTypes.STRING(64), unique: true, allowNull: true },
    unionid: { type: DataTypes.STRING(64), allowNull: true },
    nickname: { type: DataTypes.STRING(64), allowNull: true },
    avatarUrl: { type: DataTypes.STRING(255), field: 'avatar_url' },
    phone: { type: DataTypes.STRING(20), allowNull: true },
    gender: { type: DataTypes.TINYINT, defaultValue: 0 },  // 0未知 1男 2女
    city: { type: DataTypes.STRING(32), defaultValue: '广州' },
    level: { type: DataTypes.STRING(32), defaultValue: '业余' },
    status: { type: DataTypes.TINYINT, defaultValue: 1 }
  }, {
    tableName: 'users'
  });
  return User;
};