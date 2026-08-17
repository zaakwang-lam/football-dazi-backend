// src/controllers/order.js
// 主流程：免支付预订；支付接口保留备用
const { Order, Court, CourtSchedule, User } = require('../models');
const wechatPay = require('../services/wechat-pay');
const wechatMsg = require('../services/wechat-msg');
const { success, fail, BizError, ErrorCode } = require('../utils/response');
const logger = require('../utils/logger');

async function createOrder(req, res) {
  const { courtId, scheduleId, contactName, contactPhone, remark } = req.body;
  const userId = req.user.id;

  if (!courtId || !scheduleId || !contactName || !contactPhone) {
    throw new BizError(ErrorCode.PARAM_INVALID, '缺少必要参数（球场、时段、联系人、电话）');
  }

  const schedule = await CourtSchedule.findOne({
    where: { id: scheduleId, courtId },
    include: [{ model: Court, as: 'court' }]
  });

  if (!schedule) throw new BizError(ErrorCode.NOT_FOUND, '排期不存在，请重新选择时段');
  if (schedule.status === 'booked') throw new BizError(ErrorCode.CONFLICT, '该时段已被预订');
  if (schedule.status === 'closed') throw new BizError(ErrorCode.CONFLICT, '该时段已关闭');

  const order = await Order.create({
    orderNo: wechatPay.generateOrderNo('O'),
    userId,
    courtId,
    scheduleId,
    amount: schedule.price != null ? schedule.price : (schedule.court?.price || 0),
    status: 'booked',
    contactName,
    contactPhone,
    remark: remark || '',
    notifyStatus: 'pending'
  });

  schedule.status = 'booked';
  schedule.orderId = order.id;
  await schedule.save();

  logger.info(`订单 ${order.orderNo} 创建成功（免支付预订）`);

  setImmediate(async () => {
    try {
      // 按 ownerId 找球场方，不再依赖 user.courtId + role 字段
      const owner = await User.findByPk(schedule.court?.ownerId, {
        attributes: ['id', 'openid', 'nickname']
      });
      const ownerOpenid = owner ? owner.openid : null;
      const result = await wechatMsg.notifyCourtOwner(
        {
          ...order.toJSON(),
          court: schedule.court,
          schedule: { date: schedule.date, timeSlot: schedule.timeSlot }
        },
        ownerOpenid
      );
      const update = { notifyTime: new Date() };
      if (result.skipped) update.notifyStatus = 'skipped';
      else if (result.ok) update.notifyStatus = 'sent';
      else {
        update.notifyStatus = 'failed';
        update.notifyErrcode = String(result.errcode || result.error || 'unknown');
      }
      await order.update(update);
    } catch (e) {
      logger.error(`异步推送异常 (订单 ${order.orderNo}):`, e);
      await order.update({ notifyStatus: 'failed', notifyTime: new Date() });
    }
  });

  res.json(success({
    orderId: order.id,
    orderNo: order.orderNo,
    amount: parseFloat(order.amount),
    status: 'booked'
  }));
}

async function payOrder(req, res) {
  const { orderId, openid } = req.body;
  const userId = req.user.id;
  const order = await Order.findOne({
    where: { id: orderId, userId },
    include: [{ model: Court, as: 'court' }]
  });
  if (!order) throw new BizError(ErrorCode.NOT_FOUND, '订单不存在');
  if (order.status !== 'pending') {
    throw new BizError(ErrorCode.CONFLICT, `订单状态 ${order.status}，无法支付（当前为免支付预订模式）`);
  }
  if (!openid) throw new BizError(ErrorCode.PARAM_INVALID, '缺少 openid');
  const amount = parseFloat(order.amount);
  const totalFee = Math.round(amount * 100);
  const body = `${order.court?.name || '球场'} ${order.contactName}`;
  const payParams = await wechatPay.unifiedOrder({
    openid, outTradeNo: order.orderNo, totalFee, body,
    notifyUrl: process.env.WX_NOTIFY_URL,
    attach: JSON.stringify({ orderId: order.id })
  });
  const { PaymentOrder } = require('../models');
  await PaymentOrder.create({
    orderNo: order.orderNo, userId, courtId: order.courtId,
    businessType: 'court_book', amount, status: 'pending', payMethod: 'wxpay',
    prepayId: payParams.package?.replace('prepay_id=', '')
  });
  res.json(success({ orderId: order.id, orderNo: order.orderNo, amount, payParams }));
}

async function paymentNotify(req, res) {
  const xml = req.body;
  try {
    const result = await require('../utils/wechat-sign').xmlToObj(xml);
    logger.info(`支付回调: out_trade_no=${result.out_trade_no}`);
    if (!require('../utils/wechat-sign').verifySign(result)) {
      return res.send(require('../utils/wechat-sign').objToXml({ return_code: 'FAIL', return_msg: '签名失败' }));
    }
    if (result.result_code === 'SUCCESS' && result.return_code === 'SUCCESS') {
      const { PaymentOrder } = require('../models');
      const existed = await PaymentOrder.findOne({ where: { transactionId: result.transaction_id } });
      if (existed && existed.status === 'paid') {
        return res.send(require('../utils/wechat-sign').objToXml({ return_code: 'SUCCESS', return_msg: 'OK' }));
      }
      const order = await Order.findOne({ where: { orderNo: result.out_trade_no } });
      if (order) {
        order.status = 'paid';
        order.payMethod = 'wxpay';
        order.transactionId = result.transaction_id;
        order.payAmount = parseInt(result.total_fee) / 100;
        order.payTime = new Date();
        await order.save();
        if (order.scheduleId) {
          await CourtSchedule.update({ status: 'booked' }, { where: { id: order.scheduleId } });
        }
        await PaymentOrder.update(
          { status: 'paid', transactionId: result.transaction_id, payTime: new Date() },
          { where: { orderNo: result.out_trade_no } }
        );
      }
    }
    res.send(require('../utils/wechat-sign').objToXml({ return_code: 'SUCCESS', return_msg: 'OK' }));
  } catch (e) {
    logger.error('处理支付回调异常:', e);
    res.send(require('../utils/wechat-sign').objToXml({ return_code: 'FAIL', return_msg: e.message }));
  }
}

async function applyRefund(req, res) {
  const { orderId, reason, amount } = req.body;
  const userId = req.user.id;
  const order = await Order.findOne({ where: { id: orderId, userId } });
  if (!order) throw new BizError(ErrorCode.NOT_FOUND, '订单不存在');
  if (order.status !== 'paid') throw new BizError(ErrorCode.CONFLICT, '订单未支付，无法退款');
  const refundAmount = amount ? parseFloat(amount) : parseFloat(order.payAmount);
  if (refundAmount > parseFloat(order.payAmount)) {
    throw new BizError(ErrorCode.PARAM_INVALID, '退款金额超过实付金额');
  }
  const refundRes = await wechatPay.refund({
    outTradeNo: order.orderNo,
    outRefundNo: wechatPay.generateOrderNo('R'),
    totalFee: Math.round(parseFloat(order.payAmount) * 100),
    refundFee: Math.round(refundAmount * 100),
    refundDesc: reason || '用户取消'
  });
  const { PaymentRefund } = require('../models');
  const refund = await PaymentRefund.create({
    refundNo: refundRes.outRefundNo, refundId: refundRes.refundId,
    orderNo: order.orderNo, amount: refundAmount, reason: reason || '',
    status: 'processing', operatorId: userId
  });
  res.json(success({
    refundId: refund.id, refundNo: refund.refundNo, amount: refundAmount,
    status: 'processing', estimatedArrival: '1-3个工作日'
  }));
}

async function listMyOrders(req, res) {
  const userId = req.user.id;
  const { status, page = 1, pageSize = 10 } = req.query;
  const where = { userId };
  if (status && status !== 'all') where.status = status;
  const offset = (Number(page) - 1) * Number(pageSize);
  const { rows, count } = await Order.findAndCountAll({
    where,
    include: [{ model: Court, as: 'court', attributes: ['id', 'name', 'type'] }],
    order: [['created_at', 'DESC']],
    limit: Number(pageSize), offset
  });
  res.json(success({
    list: rows.map(o => ({
      id: o.id, orderNo: o.orderNo, courtName: o.court?.name, courtType: o.court?.type,
      amount: parseFloat(o.amount), status: o.status, notifyStatus: o.notifyStatus,
      createdAt: o.createdAt
    })),
    total: count, page: Number(page), pageSize: Number(pageSize)
  }));
}

async function getOrderDetail(req, res) {
  const { id } = req.params;
  const userId = req.user.id;
  const where = { userId };
  // 支持主键 id 或 orderNo
  if (/^\d+$/.test(String(id))) where.id = Number(id);
  else where.orderNo = id;

  const order = await Order.findOne({
    where,
    include: [
      { model: Court, as: 'court' },
      { model: CourtSchedule, as: 'schedule' }
    ]
  });
  if (!order) throw new BizError(ErrorCode.NOT_FOUND, '订单不存在');

  res.json(success({
    id: order.id, orderNo: order.orderNo, status: order.status,
    amount: parseFloat(order.amount),
    payAmount: parseFloat(order.payAmount || order.amount),
    contactName: order.contactName, contactPhone: order.contactPhone,
    payTime: order.payTime, createdAt: order.createdAt,
    notifyStatus: order.notifyStatus, notifyTime: order.notifyTime,
    court: {
      id: order.court?.id, name: order.court?.name, type: order.court?.type,
      address: order.court?.address, phone: order.court?.phone
    },
    schedule: order.schedule ? {
      date: order.schedule.date, timeSlot: order.schedule.timeSlot
    } : null
  }));
}

async function cancelMyOrder(req, res) {
  const { id } = req.params;
  const userId = req.user?.id;
  const order = await Order.findByPk(id);
  if (!order) throw new BizError(ErrorCode.NOT_FOUND, '订单不存在');
  if (Number(order.userId) !== Number(userId)) {
    throw new BizError(ErrorCode.FORBIDDEN, '只能取消自己的订单');
  }
  if (!['pending', 'booked'].includes(order.status)) {
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
  logger.info(`C 端用户 ${userId} 取消订单 ${order.orderNo}`);
  res.json(success({ orderNo: order.orderNo, status: order.status }));
}

module.exports = {
  createOrder, payOrder, paymentNotify, applyRefund,
  listMyOrders, getOrderDetail, cancelMyOrder
};
