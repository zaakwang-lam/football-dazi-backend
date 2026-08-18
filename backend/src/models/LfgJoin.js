// src/models/LfgJoin.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const LfgJoin = sequelize.define('LfgJoin', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    lfgId: { type: DataTypes.INTEGER, allowNull: false, field: 'lfg_id' },
    userId: { type: DataTypes.INTEGER, allowNull: false, field: 'user_id' },
    status: {
      type: DataTypes.STRING(32),
      defaultValue: 'pending',
      allowNull: false
    }
  }, {
    tableName: 'lfg_joins'
  });
  return LfgJoin;
};
