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
const Banner = require('./Banner')(sequelize);

// ===== 关联关系 =====

User.hasMany(Order, { foreignKey: 'userId', as: 'orders' });
Order.belongsTo(User, { foreignKey: 'userId', as: 'user' });

Court.hasMany(Order, { foreignKey: 'courtId', as: 'orders' });
Order.belongsTo(Court, { foreignKey: 'courtId', as: 'court' });

Court.hasMany(CourtSchedule, { foreignKey: 'courtId', as: 'schedules' });
CourtSchedule.belongsTo(Court, { foreignKey: 'courtId', as: 'court' });

CourtSchedule.hasOne(Order, { foreignKey: 'scheduleId', as: 'order' });
Order.belongsTo(CourtSchedule, { foreignKey: 'scheduleId', as: 'schedule' });

Team.hasMany(TeamMember, { foreignKey: 'teamId', as: 'teamMembers' });
TeamMember.belongsTo(Team, { foreignKey: 'teamId', as: 'team' });

User.hasMany(TeamMember, { foreignKey: 'userId', as: 'teamMemberships' });
TeamMember.belongsTo(User, { foreignKey: 'userId', as: 'user' });

Team.belongsTo(User, { foreignKey: 'captainId', as: 'captain' });

LfgPost.hasMany(LfgJoin, { foreignKey: 'lfgId', as: 'joins' });
LfgJoin.belongsTo(LfgPost, { foreignKey: 'lfgId', as: 'post' });

LfgPost.belongsTo(User, { foreignKey: 'userId', as: 'publisher' });
LfgJoin.belongsTo(User, { foreignKey: 'userId', as: 'user' });

Team.hasMany(Checkin, { foreignKey: 'teamId', as: 'checkins' });
Checkin.belongsTo(Team, { foreignKey: 'teamId', as: 'team' });
Checkin.belongsTo(User, { foreignKey: 'userId', as: 'user' });

Team.hasMany(AaPayment, { foreignKey: 'teamId', as: 'aaPayments' });
AaPayment.belongsTo(Team, { foreignKey: 'teamId', as: 'team' });

Court.belongsTo(User, { foreignKey: 'ownerId', as: 'owner' });
User.hasMany(Court, { foreignKey: 'ownerId', as: 'ownedCourts' });

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
  PaymentRefund,
  Banner
};
