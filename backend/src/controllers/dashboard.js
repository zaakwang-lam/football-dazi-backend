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
    Order.count({ where: { createdAt: { [Op.gte]: today }, status: { [Op.ne]: 'canceled' } } }),
    Order.sum('amount', { where: { createdAt: { [Op.gte]: today }, status: 'paid' } }),
    Court.count({ where: { status: 1 } }),
    LfgPost.count({ where: { createdAt: { [Op.gte]: today } } }),
    User.count({ where: { createdAt: { [Op.gte]: today } } })
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
 * 收入趋势（最近 30 天）
 */
async function getRevenue(req, res) {
  const days = 30;
  const start = new Date(Date.now() - days * 86400000);

  const data = await Order.findAll({
    attributes: [
      [fn('DATE', col('pay_time')), 'date'],
      [fn('SUM', col('pay_amount')), 'amount'],
      [fn('COUNT', col('id')), 'orders']
    ],
    where: {
      pay_time: { [Op.gte]: start },
      status: 'paid'
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
      [fn('SUM', col('Order.pay_amount')), 'revenue']
    ],
    include: [{ model: Court, as: 'court', attributes: ['name', 'type'] }],
    where: { status: 'paid' },
    group: ['courtId', 'court.id', 'court.name', 'court.type'],
    order: [[literal('revenue'), 'DESC']],
    limit: 10,
    raw: true,
    nest: true
  });

  res.json(success(data.map(d => ({
    courtId: d.courtId,
    name: d.court?.name,
    type: d.court?.type,
    orders: parseInt(d.orders),
    revenue: parseFloat(d.revenue || 0)
  }))));
}

module.exports = {
  getOverview,
  getRevenue,
  getTopCourts
};