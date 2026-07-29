// src/controllers/admin-order.js
// 后台订单管理（球场方 + 运营）
const { Order, Court, CourtSchedule, User } = require('../models');
const { success, fail, BizError, ErrorCode } = require('../utils/response');
const logger = require('../utils/logger');

/**
 * GET /api/admin/orders
 * 球场方：仅看到自己球场的订单
 * 运营：看到全部订单
 */
async function listOrders(req, res) {
  const { status, page = 1, pageSize = 20, startDate, endDate } = req.query;
  const where = {};

  // 球场方限定 courtId；运营/超管不限
  const admin = req.admin;
  if (admin.role === 'court_admin') {
    if (!admin.courtId) {
      throw new BizError(ErrorCode.FORBIDDEN, '球场方账号未关联球场，请联系管理员');
    }
    where.courtId = admin.courtId;
  }

  if (status && status !== 'all') where.status = status;
  if (startDate) where.created_at = { ...(where.created_at || {}), [Op.gte]: startDate };
  if (endDate) where.created_at = { ...(where.created_at || {}), [Op.lte]: endDate };

  const Op = require('sequelize').Op;
  const offset = (Number(page) - 1) * Number(pageSize);
  const { rows, count } = await Order.findAndCountAll({
    where,
    include: [
      { model: Court, as: 'court', attributes: ['id', 'name', 'type', 'phone'] },
      { model: CourtSchedule, as: 'schedule', attributes: ['id', 'date', 'timeSlot'] }
    ],
    order: [['created_at', 'DESC']],
    limit: Number(pageSize),
    offset
  });

  // 关联用户（拿预订者昵称）
  const userIds = [...new Set(rows.map(o => o.userId))];
  const users = await User.findAll({
    where: { id: userIds },
    attributes: ['id', 'nickname', 'avatarUrl', 'phone']
  });
  const userMap = {};
  users.forEach(u => { userMap[u.id] = u.toJSON(); });

  res.json(success({
    list: rows.map(o => ({
      id: o.id,
      orderNo: o.orderNo,
      status: o.status,
      notifyStatus: o.notifyStatus,
      notifyTime: o.notifyTime,
      amount: parseFloat(o.amount),
      contactName: o.contactName,
      contactPhone: o.contactPhone,
      remark: o.remark,
      createdAt: o.createdAt,
      user: userMap[o.userId] ? {
        id: userMap[o.userId].id,
        nickname: userMap[o.userId].nickname,
        avatarUrl: userMap[o.userId].avatarUrl,
        phone: userMap[o.userId].phone
      } : null,
      court: o.court ? {
        id: o.court.id,
        name: o.court.name,
        type: o.court.type,
        phone: o.court.phone
      } : null,
      schedule: o.schedule ? {
        id: o.schedule.id,
        date: o.schedule.date,
        timeSlot: o.schedule.timeSlot
      } : null
    })),
    total: count,
    page: Number(page),
    pageSize: Number(pageSize)
  }));
}

/**
 * GET /api/admin/orders/:id
 * 订单详情（球场方/运营）
 */
async function getDetail(req, res) {
  const { id } = req.params;
  const order = await Order.findOne({
    where: { id },
    include: [
      { model: Court, as: 'court' },
      { model: CourtSchedule, as: 'schedule' },
      { model: User, as: 'user', attributes: ['id', 'nickname', 'avatarUrl', 'phone'] }
    ]
  });

  if (!order) throw new BizError(ErrorCode.NOT_FOUND, '订单不存在');

  // 球场方限定
  if (req.admin.role === 'court_admin' && order.courtId !== req.admin.courtId) {
    throw new BizError(ErrorCode.FORBIDDEN, '无权限查看该订单');
  }

  res.json(success({
    id: order.id,
    orderNo: order.orderNo,
    status: order.status,
    notifyStatus: order.notifyStatus,
    notifyTime: order.notifyTime,
    amount: parseFloat(order.amount),
    contactName: order.contactName,
    contactPhone: order.contactPhone,
    remark: order.remark,
    createdAt: order.createdAt,
    user: order.user ? {
      id: order.user.id,
      nickname: order.user.nickname,
      avatarUrl: order.user.avatarUrl,
      phone: order.user.phone
    } : null,
    court: order.court,
    schedule: order.schedule ? {
      date: order.schedule.date,
      timeSlot: order.schedule.timeSlot
    } : null
  }));
}

/**
 * POST /api/admin/orders/:id/accept
 * 球场方接单（确认预订）
 */
async function acceptOrder(req, res) {
  const { id } = req.params;
  const order = await Order.findByPk(id);

  if (!order) throw new BizError(ErrorCode.NOT_FOUND, '订单不存在');
  if (req.admin.role === 'court_admin' && order.courtId !== req.admin.courtId) {
    throw new BizError(ErrorCode.FORBIDDEN, '无权限操作该订单');
  }
  if (order.status !== 'booked') {
    throw new BizError(ErrorCode.CONFLICT, `订单状态 ${order.status}，无法接单`);
  }

  order.status = 'completed';  // 2026-07-29：球场方接单即标记完成（线下付款约定）
  await order.save();

  logger.info(`球场方 ${req.admin.id} 接单 ${order.orderNo}`);
  res.json(success({ orderNo: order.orderNo, status: order.status }));
}

/**
 * POST /api/admin/orders/:id/cancel
 * 球场方拒绝订单（释放排期）
 */
async function cancelOrder(req, res) {
  const { id } = req.params;
  const { reason } = req.body;
  const order = await Order.findByPk(id);

  if (!order) throw new BizError(ErrorCode.NOT_FOUND, '订单不存在');
  if (req.admin.role === 'court_admin' && order.courtId !== req.admin.courtId) {
    throw new BizError(ErrorCode.FORBIDDEN, '无权限操作该订单');
  }
  if (order.status !== 'booked') {
    throw new BizError(ErrorCode.CONFLICT, `订单状态 ${order.status}，无法取消`);
  }

  order.status = 'canceled';
  order.refundTime = new Date();  // 复用字段标记拒绝时间
  await order.save();

  // 释放排期
  if (order.scheduleId) {
    await CourtSchedule.update(
      { status: 'open', orderId: null },
      { where: { id: order.scheduleId } }
    );
  }

  logger.info(`球场方 ${req.admin.id} 取消订单 ${order.orderNo}, reason: ${reason || '无'}`);
  res.json(success({ orderNo: order.orderNo, status: order.status }));
}

module.exports = {
  listOrders,
  getDetail,
  acceptOrder,
  cancelOrder
};
