// src/models/LfgPost.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const LfgPost = sequelize.define('LfgPost', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.INTEGER, allowNull: false, field: 'user_id' },
    teamId: { type: DataTypes.INTEGER, field: 'team_id' },
    type: { type: DataTypes.ENUM('sub', 'war'), allowNull: false },  // sub=凑人(找人顶,参与者为个人) / war=约战(球队vs球队)
    matchTypes: { type: DataTypes.JSON, field: 'match_types' },  // 人制多选 ["11人制","7人制","5人制"] (2026-07-28 新增)
    title: { type: DataTypes.STRING(64) },
    location: { type: DataTypes.STRING(128) },
    fee: { type: DataTypes.DECIMAL(10, 2) },  // 人均费用（元），可空 (2026-07-28 新增)
    playTime: { type: DataTypes.DATE, field: 'play_time' },
    needCount: { type: DataTypes.INTEGER, defaultValue: 1, field: 'need_count' },
    level: { type: DataTypes.STRING(32) },
    contact: { type: DataTypes.STRING(64) },
    description: { type: DataTypes.TEXT },
    status: { type: DataTypes.ENUM('open', 'closed', 'full', 'finished'), defaultValue: 'open' },  // finished=已失效(比赛日结束,不再展示)
    joinedCount: { type: DataTypes.INTEGER, defaultValue: 0, field: 'joined_count' }
  }, {
    tableName: 'lfg_posts'
  });
  return LfgPost;
};