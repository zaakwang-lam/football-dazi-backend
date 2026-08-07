// src/models/index.js
// 模型索引 + 关联关系
const { sequelize } = require('../utils/db');

const User = require('./User')(sequelize);
const Court = require('./Court')(sequelize);
const CourtSchedule = require('./CourtSchedule')(sequelize);
const Order = require('./Order')(sequelize);
const Team = require('./Team')(sequelize);
const TeamMember = require('./TeamMember')(sequelize);
const LfgPost = require('./LfgPost')(sequelize);
const LfgJoin = require('./LfgJoin')(sequelize);
const Checkin = require('./Checkin')(sequelize);
const AaPayment = require('./AaPayment')(sequelize);
const Admin = require('./Admin')(sequelize);
const PaymentOrder = require('./PaymentOrder')(sequelize);
const PaymentRefund = require('./PaymentRefund')(sequelize);

// ===== 关联关系 =====

// 用户和订单
User.hasMany(Order, { foreignKey: 'userId', as: 'orders' });
Order.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// 场地和订单
Court.hasMany(Order, { foreignKey: 'courtId', as: 'orders' });
Order.belongsTo(Court, { foreignKey: 'courtId', as: 'court' });

// 场地和排期
Court.hasMany(CourtSchedule, { foreignKey: 'courtId', as: 'schedules' });
CourtSchedule.belongsTo(Court, { foreignKey: 'courtId', as: 'court' });

// 排期和订单
CourtSchedule.hasOne(Order, { foreignKey: 'scheduleId', as: 'order' });
Order.belongsTo(CourtSchedule, { foreignKey: 'scheduleId', as: 'schedule' });

// 球队和成员（as 必须唯一，不能与 Team 表字段重名）
Team.hasMany(TeamMember, { foreignKey: 'teamId', as: 'teamMembers' });
TeamMember.belongsTo(Team, { foreignKey: 'teamId', as: 'team' });

// 用户和球队成员
User.hasMany(TeamMember, { foreignKey: 'userId', as: 'teamMemberships' });
TeamMember.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// 球队和队长
Team.belongsTo(User, { foreignKey: 'captainId', as: 'captain' });

// 凑人和报名
LfgPost.hasMany(LfgJoin, { foreignKey: 'lfgId', as: 'joins' });
LfgJoin.belongsTo(LfgPost, { foreignKey: 'lfgId', as: 'post' });

LfgPost.belongsTo(User, { foreignKey: 'userId', as: 'publisher' });
LfgJoin.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// 球队考勤
Team.hasMany(Checkin, { foreignKey: 'teamId', as: 'checkins' });
Checkin.belongsTo(Team, { foreignKey: 'teamId', as: 'team' });
Checkin.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// AA 收款
Team.hasMany(AaPayment, { foreignKey: 'teamId', as: 'aaPayments' });
AaPayment.belongsTo(Team, { foreignKey: 'teamId', as: 'team' });

// 球场归属小程序用户（ownerId = users.id）
// 历史错误地把 ownerId 指到 admins，导致小程序注册球场时 FK 失败：
// "Cannot add or update a child row"
Court.belongsTo(User, { foreignKey: 'ownerId', as: 'owner' });
User.hasMany(Court, { foreignKey: 'ownerId', as: 'ownedCourts' });

// 支付订单
PaymentOrder.belongsTo(User, { foreignKey: 'userId', as: 'user' });
PaymentOrder.belongsTo(Court, { foreignKey: 'courtId', as: 'court' });

module.exports = {
  sequelize,
  User,
  Court,
  CourtSchedule,
  Order,
  Team,
  TeamMember,
  LfgPost,
  LfgJoin,
  Checkin,
  AaPayment,
  Admin,
  PaymentOrder,
  PaymentRefund
};
