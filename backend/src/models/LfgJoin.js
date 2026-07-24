// src/models/LfgJoin.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const LfgJoin = sequelize.define('LfgJoin', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    lfgId: { type: DataTypes.INTEGER, allowNull: false, field: 'lfg_id' },
    userId: { type: DataTypes.INTEGER, allowNull: false, field: 'user_id' },
    status: {
      type: DataTypes.ENUM('pending', 'confirmed', 'rejected'),
      defaultValue: 'pending'
    }
  }, {
    tableName: 'lfg_joins'
  });
  return LfgJoin;
};