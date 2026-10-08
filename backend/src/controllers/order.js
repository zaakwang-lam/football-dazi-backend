// src/controllers/order.js
const { Order, Court, CourtSchedule, User } = require('../models');
const wechatPay = require('../services/wechat-pay');
const wechatMsg = require('../services/wechat-msg');
const { success, fail, BizError, ErrorCode } = require('../utils/response');
const logger = require('../utils/logger');
const { Op } = require('sequelize');


function scheduleOwnerNotify(order, court, schedule) {
  setImmediate(async () => {
    try {
      const owner = court?.ownerId
        ? await User.findByPk(court.ownerId, { attributes: ['id', 'openid', 'nickname'] })
        : null;
      const result = await wechatMsg.notifyCourtOwner({
        ...order.toJSON(),
        court,
        schedule: schedule ? { date: schedule.date, timeSlot: schedule.timeSlot } : null
      }, owner ? owner.openid : null);
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
}

async function releaseSchedule(scheduleId) {
  if (!scheduleId) return;
  await CourtSchedule.update({ status: 'free', orderId: null }, { where: { id: scheduleId } });
}

/** 已支付订单立刻向微信发起原路退款（款项在商户号/对公账户） */
async function refundPaidOrder(order, reason, operatorId) {
  if (!order) throw new BizError(ErrorCode.NOT_FOUND, '订单不存在');
  if (order.status === 'refunded') {
    return { refunded: true, refundNo: '', amount: parseFloat(order.payAmount || order.amount || 0) };
  }
  const amountYuan = parseFloat(order.payAmount != null ? order.payAmount : order.amount);
  const fen = Math.round(amountYuan * 100);
  const paid = order.status === 'paid' || !!order.transactionId;
  if (!paid || !(fen > 0)) return { refunded: false };

  const { PaymentRefund, PaymentOrder } = require('../models');
  const existing = await PaymentRefund.findOne({
    where: { orderNo: order.orderNo, status: { [Op.in]: ['processing', 'success'] } }
  });
  if (existing) {
    order.status = 'refunded';
    order.refundTime = order.refundTime || new Date();
    await order.save();
    await releaseSchedule(order.scheduleId);
    return { refunded: true, refundNo: existing.refundNo, amount: parseFloat(existing.amount) };
  }

  const outRefundNo = wechatPay.generateOrderNo('R');
  const refundRes = await wechatPay.refund({
    outTradeNo: order.orderNo,
    outRefundNo,
    totalFee: fen,
    refundFee: fen,
    refundDesc: String(reason || '用户退订').slice(0, 40)
  });
  await PaymentRefund.create({
    refundNo: refundRes.outRefundNo || outRefundNo,
    refundId: refundRes.refundId || outRefundNo,
    orderNo: order.orderNo,
    amount: amountYuan,
    reason: reason || '',
    status: 'processing',
    operatorId: operatorId || null
  });
  await PaymentOrder.update({ status: 'refunded' }, { where: { orderNo: order.orderNo } });
  order.status = 'refunded';
  order.refundTime = new Date();
  await order.save();
  await releaseSchedule(order.scheduleId);
  logger.info(`[refund] 已向微信发起退款 order=${order.orderNo} refund=${outRefundNo} fen=${fen}`);
  return { refunded: true, refundNo: outRefundNo, amount: amountYuan };
}

async function cancelUnpaidOrder(order) {
  order.status = 'canceled';
  order.refundTime = new Date();
  await order.save();
  await releaseSchedule(order.scheduleId);
  return { refunded: false };
}

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
  const amount = Number(schedule.price != null ? schedule.price : (schedule.court?.price || 0)) || 0;
  const needPay = amount > 0;
  const order = await Order.create({
    orderNo: wechatPay.generateOrderNo('O'), userId, courtId, scheduleId,
    amount, status: needPay ? 'pending' : 'booked',
    contactName, contactPhone, remark: remark || '', notifyStatus: 'pending'
  });
  schedule.status = 'booked';
  schedule.orderId = order.id;
  await schedule.save();
  logger.info(`订单 ${order.orderNo} 创建成功 status=${order.status} amount=${amount}`);
  if (!needPay) scheduleOwnerNotify(order, schedule.court, schedule);
  res.json(success({
    orderId: order.id,
    orderNo: order.orderNo,
    amount,
    status: order.status,
    needPay
  }));
}

async function payOrder(req, res) {
  const { orderId, openid } = req.body || {};
  const userId = req.user.id;
  const order = await Order.findOne({ where: { id: orderId, userId }, include: [{ model: Court, as: 'court' }] });
  if (!order) throw new BizError(ErrorCode.NOT_FOUND, '订单不存在');
  if (order.status !== 'pending') throw new BizError(ErrorCode.CONFLICT, `订单状态 ${order.status}，无法支付`);
  const amount = parseFloat(order.amount);
  const totalFee = Math.round(amount * 100);
  if (!(totalFee > 0)) throw new BizError(ErrorCode.PARAM_INVALID, '该订单金额为 0，无需支付');
  let payerOpenid = openid;
  if (!payerOpenid) {
    const user = await User.findByPk(userId, { attributes: ['openid'] });
    payerOpenid = user && user.openid;
  }
  if (!payerOpenid) throw new BizError(ErrorCode.PARAM_INVALID, '缺少支付身份，请重新登录后再支付');
  const payParams = await wechatPay.unifiedOrder({
    openid: payerOpenid, outTradeNo: order.orderNo, totalFee,
    body: `爱拍球订场-${order.court?.name || '球场'}`.slice(0, 40),
    notifyUrl: process.env.WX_NOTIFY_URL,
    attach: JSON.stringify({ orderId: order.id, biz: 'court_book' })
  });
  const { PaymentOrder } = require('../models');
  const prepayId = String(payParams.package || '').replace('prepay_id=', '');
  const existed = await PaymentOrder.findOne({ where: { orderNo: order.orderNo } });
  if (existed) {
    existed.status = 'pending';
    existed.prepayId = prepayId;
    existed.amount = amount;
    await existed.save();
  } else {
    await PaymentOrder.create({
      orderNo: order.orderNo, userId, courtId: order.courtId, businessType: 'court_book', amount,
      status: 'pending', payMethod: 'wxpay', prepayId
    });
  }
  res.json(success({ orderId: order.id, orderNo: order.orderNo, amount, payParams }));
}

async function paymentNotify(req, res) {
  const xml = req.body;
  try {
    const result = await require('../utils/wechat-sign').xmlToObj(xml);
    if (!require('../utils/wechat-sign').verifySign(result)) {
      return res.send(require('../utils/wechat-sign').objToXml({ return_code: 'FAIL', return_msg: '签名失败' }));
    }
    if (result.result_code === 'SUCCESS' && result.return_code === 'SUCCESS') {
      const { PaymentOrder } = require('../models');
      const existed = await PaymentOrder.findOne({ where: { transactionId: result.transaction_id } });
      if (existed && existed.status === 'paid') {
        return res.send(require('../utils/wechat-sign').objToXml({ return_code: 'SUCCESS', return_msg: 'OK' }));
      }
      const order = await Order.findOne({
        where: { orderNo: result.out_trade_no },
        include: [{ model: Court, as: 'court' }, { model: CourtSchedule, as: 'schedule' }]
      });
      if (order) {
        const paidYuan = parseInt(result.total_fee, 10) / 100;
        order.payMethod = 'wxpay';
        order.transactionId = result.transaction_id;
        order.payAmount = paidYuan;
        order.payTime = new Date();
        await PaymentOrder.update(
          { status: 'paid', transactionId: result.transaction_id, payTime: new Date() },
          { where: { orderNo: result.out_trade_no } }
        );
        if (order.status === 'canceled' || order.status === 'refunded') {
          await order.save();
          try {
            await refundPaidOrder(order, '订单已取消，自动退款', order.userId);
          } catch (refundErr) {
            logger.error(`[pay-notify] 取消后自动退款失败 ${order.orderNo}:`, refundErr.message || refundErr);
          }
        } else if (order.status !== 'paid' && order.status !== 'completed') {
          order.status = 'paid';
          await order.save();
          if (order.scheduleId) await CourtSchedule.update({ status: 'booked' }, { where: { id: order.scheduleId } });
          scheduleOwnerNotify(order, order.court, order.schedule);
          logger.info(`[pay-notify] 订场支付成功 ${order.orderNo} txn=${result.transaction_id}`);
        } else {
          await order.save();
        }
      } else if (String(result.out_trade_no || '').startsWith('AA')) {
        const { AaPaymentItem, AaPayment } = require('../models');
        const item = await AaPaymentItem.findOne({ where: { outTradeNo: result.out_trade_no } });
        if (item && item.payStatus !== 'paid') {
          const paidFen = parseInt(result.total_fee, 10);
          const expectFen = Math.round(Number(item.amount) * 100);
          if (paidFen !== expectFen) {
            logger.error(`[aa] 金额不一致 out=${result.out_trade_no} paid=${paidFen} expect=${expectFen}`);
          } else {
            item.payStatus = 'paid';
            item.transactionId = result.transaction_id;
            await item.save();
            const unpaid = await AaPaymentItem.count({
              where: { paymentId: item.paymentId, included: 1, payStatus: { [Op.ne]: 'paid' } }
            });
            if (unpaid === 0) await AaPayment.update({ status: 'done' }, { where: { id: item.paymentId } });
            logger.info(`[aa] 支付成功 item=${item.id} txn=${result.transaction_id}`);
          }
        }
      }
    }
    res.send(require('../utils/wechat-sign').objToXml({ return_code: 'SUCCESS', return_msg: 'OK' }));
  } catch (e) {
    logger.error('处理支付回调异常:', e);
    res.send(require('../utils/wechat-sign').objToXml({ return_code: 'FAIL', return_msg: e.message }));
  }
}

async function applyRefund(req, res) {
  const { orderId, reason } = req.body || {};
  const userId = req.user.id;
  const order = await Order.findOne({ where: { id: orderId, userId } });
  if (!order) throw new BizError(ErrorCode.NOT_FOUND, '订单不存在');
  if (order.status !== 'paid' && !(order.status === 'completed' && order.transactionId)) {
    throw new BizError(ErrorCode.CONFLICT, '订单未支付，无法退款');
  }
  const result = await refundPaidOrder(order, reason || '用户退订', userId);
  res.json(success({
    refundNo: result.refundNo,
    amount: result.amount,
    status: 'processing',
    estimatedArrival: '已提交微信，一般实时到账'
  }, '退款已提交'));
}

async function listMyOrders(req, res) {
  const userId = req.user.id;
  const { status, page = 1, pageSize = 10 } = req.query;
  const where = { userId };
  if (status && status !== 'all') where.status = status;
  const offset = (Number(page) - 1) * Number(pageSize);
  const { rows, count } = await Order.findAndCountAll({
    where, include: [{ model: Court, as: 'court', attributes: ['id', 'name', 'type'] }],
    order: [['created_at', 'DESC']], limit: Number(pageSize), offset
  });
  res.json(success({
    list: rows.map(o => ({ id: o.id, orderNo: o.orderNo, courtName: o.court?.name, courtType: o.court?.type, amount: parseFloat(o.amount), payAmount: parseFloat(o.payAmount || 0), status: o.status, notifyStatus: o.notifyStatus, createdAt: o.createdAt })),
    total: count, page: Number(page), pageSize: Number(pageSize)
  }));
}

async function getOrderDetail(req, res) {
  const { id } = req.params;
  const userId = req.user.id;
  const where = { userId };
  if (/^\d+$/.test(String(id))) where.id = Number(id); else where.orderNo = id;
  const order = await Order.findOne({ where, include: [{ model: Court, as: 'court' }, { model: CourtSchedule, as: 'schedule' }] });
  if (!order) throw new BizError(ErrorCode.NOT_FOUND, '订单不存在');
  res.json(success({
    id: order.id, orderNo: order.orderNo, status: order.status, amount: parseFloat(order.amount),
    payAmount: parseFloat(order.payAmount || order.amount), contactName: order.contactName, contactPhone: order.contactPhone,
    payTime: order.payTime, createdAt: order.createdAt, notifyStatus: order.notifyStatus, notifyTime: order.notifyTime,
    court: { id: order.court?.id, name: order.court?.name, type: order.court?.type, address: order.court?.address, phone: order.court?.phone },
    schedule: order.schedule ? { date: order.schedule.date, timeSlot: order.schedule.timeSlot } : null
  }));
}

async function cancelMyOrder(req, res) {
  const { id } = req.params;
  const userId = req.user?.id;
  const reason = (req.body && req.body.reason) || '用户退订';
  const order = await Order.findByPk(id);
  if (!order) throw new BizError(ErrorCode.NOT_FOUND, '订单不存在');
  if (Number(order.userId) !== Number(userId)) throw new BizError(ErrorCode.FORBIDDEN, '只能取消自己的订单');
  if (['refunded', 'canceled'].includes(order.status)) {
    throw new BizError(ErrorCode.CONFLICT, '订单已取消');
  }
  const paid = order.status === 'paid' || (order.status === 'completed' && (order.transactionId || Number(order.payAmount) > 0));
  if (paid) {
    const result = await refundPaidOrder(order, reason, userId);
    logger.info(`C 端用户 ${userId} 退订 ${order.orderNo} refund=${result.refundNo || ''}`);
    return res.json(success({
      orderNo: order.orderNo, status: order.status, refunded: true, refundNo: result.refundNo
    }, '已退订，退款已提交微信，将原路退回'));
  }
  if (!['pending', 'booked', 'completed'].includes(order.status)) {
    throw new BizError(ErrorCode.CONFLICT, `订单状态 ${order.status}，无法取消`);
  }
  await cancelUnpaidOrder(order);
  logger.info(`C 端用户 ${userId} 取消未支付订单 ${order.orderNo}`);
  res.json(success({ orderNo: order.orderNo, status: order.status, refunded: false }, '已取消'));
}

async function resolveOwnedCourtIds(userId) {
  const owned = await Court.findAll({ where: { ownerId: userId }, attributes: ['id'] });
  return owned.map(c => Number(c.id)).filter(Boolean);
}

async function listCourtOwnerOrders(req, res) {
  const userId = req.user.id;
  const { status, page = 1, pageSize = 20 } = req.query;
  const courtIds = await resolveOwnedCourtIds(userId);
  if (!courtIds.length) return res.json(success({ list: [], total: 0, page: Number(page), pageSize: Number(pageSize) }));
  const where = { courtId: courtIds.length === 1 ? courtIds[0] : { [Op.in]: courtIds } };
  if (status && status !== 'all') where.status = status;
  const offset = (Number(page) - 1) * Number(pageSize);
  const { rows, count } = await Order.findAndCountAll({
    where,
    include: [
      { model: Court, as: 'court', attributes: ['id', 'name', 'type', 'phone'] },
      { model: CourtSchedule, as: 'schedule', attributes: ['id', 'date', 'timeSlot'] }
    ],
    order: [['created_at', 'DESC']], limit: Number(pageSize), offset
  });
  const userIds = [...new Set(rows.map(o => o.userId))];
  const users = userIds.length ? await User.findAll({ where: { id: userIds }, attributes: ['id', 'nickname', 'avatarUrl', 'phone'] }) : [];
  const userMap = {};
  users.forEach(u => { userMap[u.id] = u.toJSON(); });
  res.json(success({
    list: rows.map(o => ({
      id: o.id, orderNo: o.orderNo, status: o.status, amount: parseFloat(o.amount),
      contactName: o.contactName, contactPhone: o.contactPhone, remark: o.remark, createdAt: o.createdAt,
      user: userMap[o.userId] ? { id: userMap[o.userId].id, nickname: userMap[o.userId].nickname, avatarUrl: userMap[o.userId].avatarUrl, phone: userMap[o.userId].phone } : null,
      court: o.court ? { id: o.court.id, name: o.court.name, type: o.court.type, phone: o.court.phone } : null,
      schedule: o.schedule ? { id: o.schedule.id, date: o.schedule.date, timeSlot: o.schedule.timeSlot } : null
    })),
    total: count, page: Number(page), pageSize: Number(pageSize)
  }));
}

async function assertOwnsOrder(userId, order) {
  if (!order) throw new BizError(ErrorCode.NOT_FOUND, '订单不存在');
  const court = await Court.findByPk(order.courtId, { attributes: ['id', 'ownerId'] });
  if (!court || Number(court.ownerId) !== Number(userId)) throw new BizError(ErrorCode.FORBIDDEN, '只能操作自己球场的订单');
}

async function acceptCourtOwnerOrder(req, res) {
  const userId = req.user.id;
  const order = await Order.findByPk(req.params.id);
  await assertOwnsOrder(userId, order);
  if (!['booked', 'paid'].includes(order.status)) throw new BizError(ErrorCode.CONFLICT, `订单状态 ${order.status}，无法接单`);
  order.status = 'completed'; await order.save();
  logger.info(`球场方用户 ${userId} 接单 ${order.orderNo}`);
  res.json(success({ orderNo: order.orderNo, status: order.status }));
}

async function cancelCourtOwnerOrder(req, res) {
  const userId = req.user.id;
  const { reason } = req.body || {};
  const order = await Order.findByPk(req.params.id);
  await assertOwnsOrder(userId, order);
  if (['refunded', 'canceled'].includes(order.status)) throw new BizError(ErrorCode.CONFLICT, '订单已取消');
  const paid = order.status === 'paid' || (order.status === 'completed' && (order.transactionId || Number(order.payAmount) > 0));
  if (paid) {
    const result = await refundPaidOrder(order, reason || '球场方拒绝', userId);
    logger.info(`球场方用户 ${userId} 拒绝并退款 ${order.orderNo}`);
    return res.json(success({
      orderNo: order.orderNo, status: order.status, refunded: true, refundNo: result.refundNo
    }, '已拒绝，退款已提交微信'));
  }
  if (!['pending', 'booked'].includes(order.status)) {
    throw new BizError(ErrorCode.CONFLICT, `订单状态 ${order.status}，无法拒绝`);
  }
  await cancelUnpaidOrder(order);
  logger.info(`球场方用户 ${userId} 拒绝订单 ${order.orderNo}, reason: ${reason || '无'}`);
  res.json(success({ orderNo: order.orderNo, status: order.status, refunded: false }, '已拒绝'));
}

module.exports = {
  createOrder, payOrder, paymentNotify, applyRefund,
  listMyOrders, getOrderDetail, cancelMyOrder,
  listCourtOwnerOrders, acceptCourtOwnerOrder, cancelCourtOwnerOrder,
  refundPaidOrder, cancelUnpaidOrder
};
