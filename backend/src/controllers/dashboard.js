// src/controllers/dashboard.js
// 数据看板（运营后台）
const { User, Order, Court, CourtSchedule, LfgPost, Team } = require('../models');
const { success, fail } = require('../utils/response');
const { Op, fn, col, literal } = require('sequelize');

function parseDayStart(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

function parseDayEnd(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * GET /api/admin/dashboard/overview
 * 总览数据
 */
async function getOverview(req, res) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [
    totalUsers,
    todayOrders,
    todayGmv,
    activeCourts,
    todayLfg,
    newUsers
  ] = await Promise.all([
    User.count(),
    Order.count({ where: { created_at: { [Op.gte]: today } } }),
    Order.sum('pay_amount', { where: { pay_time: { [Op.gte]: today }, status: { [Op.in]: ['paid', 'completed'] } } }),
    Court.count({ where: { status: 1 } }),
    LfgPost.count({ where: { created_at: { [Op.gte]: today } } }),
    User.count({ where: { created_at: { [Op.gte]: today } } })
  ]);

  res.json(success({
    totalUsers,
    todayOrders,
    todayGmv: parseFloat(todayGmv || 0),
    activeCourts,
    todayLfg,
    newUsers
  }));
}

/**
 * GET /api/admin/dashboard/revenue
 */
async function getRevenue(req, res) {
  const days = Number(req.query.days) || 30;
  const start = new Date(Date.now() - days * 86400000);

  const data = await Order.findAll({
    attributes: [
      [fn('DATE', col('pay_time')), 'date'],
      [fn('SUM', col('pay_amount')), 'amount'],
      [fn('COUNT', col('id')), 'orders']
    ],
    where: {
      pay_time: { [Op.gte]: start },
      status: { [Op.in]: ['paid', 'completed'] }
    },
    group: [fn('DATE', col('pay_time'))],
    order: [[fn('DATE', col('pay_time')), 'ASC']],
    raw: true
  });

  res.json(success(data.map(d => ({
    date: d.date,
    amount: parseFloat(d.amount || 0),
    orders: parseInt(d.orders || 0)
  }))));
}

/**
 * GET /api/admin/dashboard/courts
 */
async function getTopCourts(req, res) {
  const data = await Order.findAll({
    attributes: [
      'courtId',
      [fn('COUNT', col('Order.id')), 'orders'],
      [fn('SUM', col('pay_amount')), 'revenue']
    ],
    where: {
      status: { [Op.in]: ['paid', 'completed'] }
    },
    include: [{ model: Court, as: 'court', attributes: ['name'] }],
    group: ['courtId'],
    order: [[literal('revenue'), 'DESC']],
    limit: 10,
    raw: true
  });

  res.json(success(data.map(d => ({
    courtId: d.courtId,
    name: d['court.name'],
    orders: parseInt(d.orders || 0),
    revenue: parseFloat(d.revenue || 0)
  }))));
}

/**
 * GET /api/admin/dashboard/orders
 * 订单明细（支持日期区间，默认今日；可查历史）
 */
async function getOrderDetails(req, res) {
  const { page = 1, pageSize = 20, startDate, endDate, status } = req.query;
  const where = {};
  const start = parseDayStart(startDate) || (() => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; })();
  const end = parseDayEnd(endDate) || (() => { const t = new Date(); t.setHours(23, 59, 59, 999); return t; })();
  where.created_at = { [Op.gte]: start, [Op.lte]: end };
  if (status && status !== 'all') where.status = status;

  const offset = (Number(page) - 1) * Number(pageSize);
  const { rows, count } = await Order.findAndCountAll({
    where,
    include: [
      { model: Court, as: 'court', attributes: ['id', 'name', 'type'] },
      { model: CourtSchedule, as: 'schedule', attributes: ['id', 'date', 'timeSlot'] },
      { model: User, as: 'user', attributes: ['id', 'nickname', 'phone'], required: false }
    ],
    order: [['created_at', 'DESC']],
    limit: Number(pageSize),
    offset
  });

  res.json(success({
    list: rows.map(o => ({
      id: o.id,
      orderNo: o.orderNo,
      status: o.status,
      amount: parseFloat(o.amount),
      contactName: o.contactName,
      contactPhone: o.contactPhone,
      createdAt: o.createdAt,
      user: o.user ? { id: o.user.id, nickname: o.user.nickname, phone: o.user.phone } : null,
      court: o.court ? { id: o.court.id, name: o.court.name, type: o.court.type } : null,
      schedule: o.schedule ? { date: o.schedule.date, timeSlot: o.schedule.timeSlot } : null
    })),
    total: count,
    page: Number(page),
    pageSize: Number(pageSize),
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10)
  }));
}

/**
 * GET /api/admin/dashboard/lfg
 * 组队（凑人/约战）明细，支持日期区间与历史
 */
async function getLfgDetails(req, res) {
  const { page = 1, pageSize = 20, startDate, endDate, type } = req.query;
  const where = {};
  const start = parseDayStart(startDate) || (() => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; })();
  const end = parseDayEnd(endDate) || (() => { const t = new Date(); t.setHours(23, 59, 59, 999); return t; })();
  where.created_at = { [Op.gte]: start, [Op.lte]: end };
  if (type && type !== 'all') where.type = type;

  const offset = (Number(page) - 1) * Number(pageSize);
  const { rows, count } = await LfgPost.findAndCountAll({
    where,
    include: [
      { model: User, as: 'publisher', attributes: ['id', 'nickname', 'phone'], required: false }
    ],
    order: [['created_at', 'DESC']],
    limit: Number(pageSize),
    offset
  });

  const TYPE_MAP = { sub: '凑人', war: '约战' };
  const STATUS_MAP = { open: '招募中', closed: '已关闭', full: '已满', finished: '已结束' };

  res.json(success({
    list: rows.map(p => ({
      id: p.id,
      type: p.type,
      typeLabel: TYPE_MAP[p.type] || p.type,
      title: p.title,
      location: p.location,
      playTime: p.playTime,
      needCount: p.needCount,
      joinedCount: p.joinedCount,
      fee: p.fee != null ? parseFloat(p.fee) : null,
      matchTypes: p.matchTypes || [],
      contact: p.contact,
      status: p.status,
      statusLabel: STATUS_MAP[p.status] || p.status,
      publisher: p.publisher ? { id: p.publisher.id, nickname: p.publisher.nickname, phone: p.publisher.phone } : null,
      createdAt: p.createdAt
    })),
    total: count,
    page: Number(page),
    pageSize: Number(pageSize),
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10)
  }));
}

module.exports = {
  getOverview,
  getRevenue,
  getTopCourts,
  getOrderDetails,
  getLfgDetails
};
