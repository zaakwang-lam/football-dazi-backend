// src/controllers/court-dashboard.js
// 球场方 Dashboard 数据 (court_admin 限定)
const { Order, Court, CourtSchedule, User } = require('../models');
const { success, fail, BizError, ErrorCode } = require('../utils/response');
const { Op, fn, col, literal } = require('sequelize');

/**
 * GET /api/admin/courts/dashboard
 * 球场方 Dashboard: 4 指标 + 待处理订单 + 最近订单
 *
 * 路由顺序: 必须在 /api/admin/courts/:id 之前注册, 否则被当成 :id='dashboard'
 *
 * ⚠️ 仅 court_admin 角色 + 关联 courtId (super_admin 直接返回错误)
 */
async function getCourtDashboard(req, res) {
  const admin = req.admin;
  if (admin.role !== 'court_admin') {
    throw new BizError(ErrorCode.FORBIDDEN, '仅球场方账号可访问');
  }
  if (!admin.courtId) {
    throw new BizError(ErrorCode.FORBIDDEN, '球场方账号未关联球场，请联系管理员');
  }

  const courtId = admin.courtId;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today.getTime() - 86400000);

  const [
    todayOrders,
    yesterdayOrders,
    todayRevenue,
    yesterdayRevenue,
    newCustomers,
    yesterdayNewCustomers,
    courtInfo,
    pendingList,
    recentList
  ] = await Promise.all([
    Order.count({ where: { courtId, created_at: { [Op.gte]: today } } }),
    Order.count({ where: { courtId, created_at: { [Op.gte]: yesterday, [Op.lt]: today } } }),
    Order.sum('pay_amount', { where: { courtId, pay_time: { [Op.gte]: today }, status: { [Op.in]: ['paid', 'completed'] } } }),
    Order.sum('pay_amount', { where: { courtId, pay_time: { [Op.gte]: yesterday, [Op.lt]: today }, status: { [Op.in]: ['paid', 'completed'] } } }),
    Order.count({ where: { courtId, created_at: { [Op.gte]: today }, userId: { [Op.not]: null } }, distinct: true, col: 'userId' }),
    Order.count({ where: { courtId, created_at: { [Op.gte]: yesterday, [Op.lt]: today }, userId: { [Op.not]: null } }, distinct: true, col: 'userId' }),
    Court.findByPk(courtId, { attributes: ['id', 'name', 'rating'] }),
    Order.findAll({
      where: { courtId, status: 'booked' },
      include: [
        { model: User, as: 'user', attributes: ['id', 'nickname', 'avatarUrl', 'phone'] },
        { model: CourtSchedule, as: 'schedule', attributes: ['id', 'date', 'timeSlot'] }
      ],
      order: [['created_at', 'DESC']],
      limit: 10
    }),
    Order.findAll({
      where: { courtId },
      include: [
        { model: User, as: 'user', attributes: ['id', 'nickname', 'avatarUrl', 'phone'] },
        { model: CourtSchedule, as: 'schedule', attributes: ['id', 'date', 'timeSlot'] }
      ],
      order: [['created_at', 'DESC']],
      limit: 10
    })
  ]);

  if (!courtInfo) {
    throw new BizError(ErrorCode.NOT_FOUND, '关联球场不存在');
  }

  res.json(success({
    metrics: {
      todayOrders: todayOrders || 0,
      yesterdayOrders: yesterdayOrders || 0,
      todayRevenue: parseFloat(todayRevenue || 0),
      yesterdayRevenue: parseFloat(yesterdayRevenue || 0),
      newCustomers: newCustomers || 0,
      yesterdayNewCustomers: yesterdayNewCustomers || 0,
      rating: parseFloat(courtInfo.rating),
      courtName: courtInfo.name
    },
    pendingOrders: pendingList.map(o => ({
      id: o.id,
      orderNo: o.orderNo,
      status: o.status,
      amount: parseFloat(o.amount),
      contactName: o.contactName,
      contactPhone: o.contactPhone,
      user: o.user ? {
        id: o.user.id,
        nickname: o.user.nickname,
        avatarUrl: o.user.avatarUrl,
        phone: o.user.phone
      } : null,
      schedule: o.schedule ? {
        id: o.schedule.id,
        date: o.schedule.date,
        timeSlot: o.schedule.timeSlot
      } : null,
      createdAt: o.createdAt
    })),
    recentOrders: recentList.map(o => ({
      id: o.id,
      orderNo: o.orderNo,
      status: o.status,
      amount: parseFloat(o.amount),
      user: o.user ? {
        id: o.user.id,
        nickname: o.user.nickname
      } : null,
      schedule: o.schedule ? {
        date: o.schedule.date,
        timeSlot: o.schedule.timeSlot
      } : null,
      createdAt: o.createdAt
    }))
  }));
}

module.exports = {
  getCourtDashboard
};