// src/controllers/dashboard.js
// 数据看板（运营后台）
const { User, Order, Court, LfgPost, Team } = require('../models');
const { success, fail } = require('../utils/response');
const { Op, fn, col, literal } = require('sequelize');

/**
 * GET /api/admin/dashboard/overview
 * 总览数据
 */
async function getOverview(req, res) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today.getTime() - 86400000);

  const [
    totalUsers,
    todayOrders,
    todayGmv,
    activeCourts,
    todayLfg,
    newUsers
  ] = await Promise.all([
    User.count(),
    // 今日订单: 所有今日创建的订单 (含 canceled, 不漏数) (2026-08-04 口径修正)
    Order.count({ where: { created_at: { [Op.gte]: today } } }),
    // 今日 GMV: 用 pay_amount (实付) + pay_time (支付时间锚) (2026-08-04 口径修正)
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
 * 收入趋势（最近 N 天，默认 30）
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
      status: { [Op.in]: ['paid', 'completed'] }  // 2026-08-04 口径: 含 completed (历史已支付)
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
 * 场地运营 Top 10
 */
async function getTopCourts(req, res) {
  const data = await Order.findAll({
    attributes: [
      'courtId',
      [fn('COUNT', col('Order.id')), 'orders'],
      [fn('SUM', col('pay_amount')), 'revenue']
    ],
    where: {
      status: { [Op.in]: ['paid', 'completed'] }  // 2026-08-04 口径: 含 completed
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

module.exports = {
  getOverview,
  getRevenue,
  getTopCourts
};