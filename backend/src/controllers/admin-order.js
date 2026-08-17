// src/controllers/admin-order.js
const { Order, Court, CourtSchedule, User } = require('../models');
const { success, fail, BizError, ErrorCode } = require('../utils/response');
const { Op } = require('sequelize');
const logger = require('../utils/logger');

async function resolveCourtIdsForAdmin(admin) {
  if (admin.role !== 'court_admin') return null;
  const ids = [];
  if (admin.courtId) ids.push(Number(admin.courtId));
  // 小程序球场方：名下所有球场
  if (admin.id) {
    const owned = await Court.findAll({
      where: { ownerId: admin.id },
      attributes: ['id']
    });
    owned.forEach(c => ids.push(Number(c.id)));
  }
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) {
    throw new BizError(ErrorCode.FORBIDDEN, '球场方账号未关联球场，请联系管理员');
  }
  return unique;
}

async function listOrders(req, res) {
  const { status, page = 1, pageSize = 20, startDate, endDate } = req.query;
  const where = {};

  const courtIds = await resolveCourtIdsForAdmin(req.admin);
  if (courtIds) where.courtId = { [Op.in]: courtIds };

  if (status && status !== 'all') where.status = status;
  if (startDate) where.created_at = { ...(where.created_at || {}), [Op.gte]: startDate };
  if (endDate) where.created_at = { ...(where.created_at || {}), [Op.lte]: endDate };

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

  const userIds = [...new Set(rows.map(o => o.userId))];
  const users = userIds.length
    ? await User.findAll({ where: { id: userIds }, attributes: ['id', 'nickname', 'avatarUrl', 'phone'] })
    : [];
  const userMap = {};
  users.forEach(u => { userMap[u.id] = u.toJSON(); });

  res.json(success({
    list: rows.map(o => ({
      id: o.id, orderNo: o.orderNo, status: o.status,
      notifyStatus: o.notifyStatus, notifyTime: o.notifyTime,
      amount: parseFloat(o.amount),
      contactName: o.contactName, contactPhone: o.contactPhone,
      remark: o.remark, createdAt: o.createdAt,
      user: userMap[o.userId] ? {
        id: userMap[o.userId].id,
        nickname: userMap[o.userId].nickname,
        avatarUrl: userMap[o.userId].avatarUrl,
        phone: userMap[o.userId].phone
      } : null,
      court: o.court ? {
        id: o.court.id, name: o.court.name, type: o.court.type, phone: o.court.phone
      } : null,
      schedule: o.schedule ? {
        id: o.schedule.id, date: o.schedule.date, timeSlot: o.schedule.timeSlot
      } : null
    })),
    total: count, page: Number(page), pageSize: Number(pageSize)
  }));
}

async function getDetail(req, res) {
  const order = await Order.findByPk(req.params.id, {
    include: [
      { model: Court, as: 'court', attributes: ['id', 'name', 'type', 'phone'] },
      { model: CourtSchedule, as: 'schedule', attributes: ['id', 'date', 'timeSlot'] },
      { model: User, as: 'user', attributes: ['id', 'nickname', 'avatarUrl', 'phone'] }
    ]
  });
  if (!order) throw new BizError(ErrorCode.NOT_FOUND, '订单不存在');
  const courtIds = await resolveCourtIdsForAdmin(req.admin);
  if (courtIds && !courtIds.includes(Number(order.courtId))) {
    throw new BizError(ErrorCode.FORBIDDEN, '无权限查看该订单');
  }
  res.json(success({ ...order.toJSON(), amount: parseFloat(order.amount) }));
}

async function acceptOrder(req, res) {
  const order = await Order.findByPk(req.params.id);
  if (!order) throw new BizError(ErrorCode.NOT_FOUND, '订单不存在');
  const courtIds = await resolveCourtIdsForAdmin(req.admin);
  if (courtIds && !courtIds.includes(Number(order.courtId))) {
    throw new BizError(ErrorCode.FORBIDDEN, '无权限操作该订单');
  }
  if (order.status !== 'booked') {
    throw new BizError(ErrorCode.CONFLICT, `订单状态 ${order.status}，无法接单`);
  }
  order.status = 'completed';
  await order.save();
  logger.info(`球场方 ${req.admin.id} 接单 ${order.orderNo}`);
  res.json(success({ orderNo: order.orderNo, status: order.status }));
}

async function cancelOrder(req, res) {
  const { reason } = req.body || {};
  const order = await Order.findByPk(req.params.id);
  if (!order) throw new BizError(ErrorCode.NOT_FOUND, '订单不存在');
  const courtIds = await resolveCourtIdsForAdmin(req.admin);
  if (courtIds && !courtIds.includes(Number(order.courtId))) {
    throw new BizError(ErrorCode.FORBIDDEN, '无权限操作该订单');
  }
  if (order.status !== 'booked') {
    throw new BizError(ErrorCode.CONFLICT, `订单状态 ${order.status}，无法取消`);
  }
  order.status = 'canceled';
  order.refundTime = new Date();
  await order.save();
  if (order.scheduleId) {
    await CourtSchedule.update(
      { status: 'free', orderId: null },
      { where: { id: order.scheduleId } }
    );
  }
  logger.info(`球场方 ${req.admin.id} 取消订单 ${order.orderNo}, reason: ${reason || '无'}`);
  res.json(success({ orderNo: order.orderNo, status: order.status }));
}

module.exports = { listOrders, getDetail, acceptOrder, cancelOrder };
