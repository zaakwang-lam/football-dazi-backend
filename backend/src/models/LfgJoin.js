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
    },
    contactName: { type: DataTypes.STRING(32), allowNull: true, field: 'contact_name' },
    contactPhone: { type: DataTypes.STRING(20), allowNull: true, field: 'contact_phone' },
    teamName: { type: DataTypes.STRING(64), allowNull: true, field: 'team_name' },
    teamId: { type: DataTypes.INTEGER, allowNull: true, field: 'team_id' }
  }, {
    tableName: 'lfg_joins'
  });
  return LfgJoin;
};
