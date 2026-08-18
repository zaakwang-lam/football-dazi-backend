// src/models/LfgJoin.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const LfgJoin = sequelize.define('LfgJoin', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    lfgId: { type: DataTypes.INTEGER, allowNull: false, field: 'lfg_id' },
    userId: { type: DataTypes.INTEGER, allowNull: false, field: 'user_id' },
    // 用 STRING 兼容历史库里 ENUM 不一致的情况，避免 Data truncated 导致 500
    status: {
      type: DataTypes.STRING(32),
      defaultValue: 'pending',
      allowNull: false
    }
  }, {
    tableName: 'lfg_joins',
    indexes: [
      { unique: true, fields: ['lfg_id', 'user_id'], name: 'uk_lfg_user' }
    ]
  });
  return LfgJoin;
};
