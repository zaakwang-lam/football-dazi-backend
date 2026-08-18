// src/controllers/admin-order.js
const { Order, Court, CourtSchedule, User } = require('../models');
const { success, BizError, ErrorCode } = require('../utils/response');
const { Op } = require('sequelize');
const logger = require('../utils/logger');

async function resolveCourtIdsForAdmin(admin) {
  if (admin.role !== 'court_admin') return null;
  const ids = [];
  if (admin.courtId) ids.push(Number(admin.courtId));
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
  const { status, page = 1, pageSize = 20, startDate, endDate, keyword } = req.query;
  const where = {};

  const courtIds = await resolveCourtIdsForAdmin(req.admin);
  if (courtIds) where.courtId = { [Op.in]: courtIds };

  if (status && status !== 'all') where.status = status;

  if (startDate || endDate) {
    where.created_at = {};
    if (startDate) {
      const s = new Date(startDate);
      s.setHours(0, 0, 0, 0);
      where.created_at[Op.gte] = s;
    }
    if (endDate) {
      const e = new Date(endDate);
      e.setHours(23, 59, 59, 999);
      where.created_at[Op.lte] = e;
    }
  }

  if (keyword && String(keyword).trim()) {
    const kw = `%${String(keyword).trim()}%`;
    where[Op.or] = [
      { orderNo: { [Op.like]: kw } },
      { contactPhone: { [Op.like]: kw } },
      { contactName: { [Op.like]: kw } }
    ];
  }

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

/** 运营编辑订单：状态、联系人、备注、金额 */
async function updateOrder(req, res) {
  const order = await Order.findByPk(req.params.id);
  if (!order) throw new BizError(ErrorCode.NOT_FOUND, '订单不存在');
  const courtIds = await resolveCourtIdsForAdmin(req.admin);
  if (courtIds && !courtIds.includes(Number(order.courtId))) {
    throw new BizError(ErrorCode.FORBIDDEN, '无权限操作该订单');
  }

  const body = req.body || {};
  const ALLOWED_STATUS = ['pending', 'paid', 'booked', 'completed', 'canceled', 'refunded'];
  if (body.status !== undefined) {
    if (!ALLOWED_STATUS.includes(body.status)) {
      throw new BizError(ErrorCode.PARAM_INVALID, '无效的订单状态');
    }
    const prev = order.status;
    order.status = body.status;
    // 改为取消/退款时释放排期
    if (['canceled', 'refunded'].includes(body.status) && !['canceled', 'refunded'].includes(prev)) {
      if (order.scheduleId) {
        await CourtSchedule.update(
          { status: 'free', orderId: null },
          { where: { id: order.scheduleId } }
        );
      }
      order.refundTime = order.refundTime || new Date();
    }
  }
  if (body.contactName !== undefined) order.contactName = String(body.contactName || '').slice(0, 32);
  if (body.contactPhone !== undefined) order.contactPhone = String(body.contactPhone || '').slice(0, 20);
  if (body.remark !== undefined) order.remark = String(body.remark || '').slice(0, 255);
  if (body.amount !== undefined && body.amount !== null && body.amount !== '') {
    const amt = Number(body.amount);
    if (Number.isNaN(amt) || amt < 0) throw new BizError(ErrorCode.PARAM_INVALID, '金额无效');
    order.amount = amt;
  }

  await order.save();
  logger.info(`管理员 ${req.admin.id} 编辑订单 ${order.orderNo}`);
  res.json(success({
    id: order.id,
    orderNo: order.orderNo,
    status: order.status,
    amount: parseFloat(order.amount),
    contactName: order.contactName,
    contactPhone: order.contactPhone,
    remark: order.remark
  }, '已保存'));
}

/** 删除订单（物理删除；若占用排期则释放） */
async function deleteOrder(req, res) {
  const order = await Order.findByPk(req.params.id);
  if (!order) throw new BizError(ErrorCode.NOT_FOUND, '订单不存在');
  const courtIds = await resolveCourtIdsForAdmin(req.admin);
  if (courtIds && !courtIds.includes(Number(order.courtId))) {
    throw new BizError(ErrorCode.FORBIDDEN, '无权限操作该订单');
  }

  // 仅超管/运营可删已支付类；球场方可删自己球场订单
  const role = req.admin.role;
  if (role === 'court_admin' && ['paid', 'completed'].includes(order.status)) {
    throw new BizError(ErrorCode.FORBIDDEN, '已支付/已完成订单请联系平台运营删除');
  }

  if (order.scheduleId) {
    await CourtSchedule.update(
      { status: 'free', orderId: null },
      { where: { id: order.scheduleId } }
    );
  }
  const orderNo = order.orderNo;
  await order.destroy();
  logger.info(`管理员 ${req.admin.id} 删除订单 ${orderNo}`);
  res.json(success({ orderNo }, '已删除'));
}

module.exports = {
  listOrders, getDetail, acceptOrder, cancelOrder, updateOrder, deleteOrder
};
