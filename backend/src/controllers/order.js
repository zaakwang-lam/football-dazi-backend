// src/controllers/order.js
// 订单 + 支付控制器（2026-07-29 改为免支付预订：创建即成单 + 推送球场方）
const { Order, Court, CourtSchedule, User } = require('../models');
const wechatPay = require('../services/wechat-pay');
const wechatMsg = require('../services/wechat-msg');
const { success, fail, BizError, ErrorCode } = require('../utils/response');
const logger = require('../utils/logger');

/**
 * POST /api/v1/orders
 * 创建订单（C 端，2026-07-29 改为免支付：立即成单）
 *
 * 流程：
 * 1. 验证排期可订
 * 2. 创建订单（status=booked，无需支付）
 * 3. 锁排期（status=booked）
 * 4. 异步推送球场方微信
 * 5. 返回订单详情
 */
async function createOrder(req, res) {
  const { courtId, scheduleId, contactName, contactPhone, remark } = req.body;
  const userId = req.user.id;

  if (!courtId || !scheduleId || !contactName || !contactPhone) {
    throw new BizError(ErrorCode.PARAM_INVALID, '缺少必要参数');
  }

  // 验证排期
  const schedule = await CourtSchedule.findOne({
    where: { id: scheduleId, courtId },
    include: [
      { model: Court, as: 'court' },
      { model: require('../models').Court }
    ]
  });

  if (!schedule) {
    throw new BizError(ErrorCode.NOT_FOUND, '排期不存在');
  }
  if (schedule.status === 'booked') {
    throw new BizError(ErrorCode.CONFLICT, '该时段已被预订');
  }
  if (schedule.status === 'closed') {
    throw new BizError(ErrorCode.CONFLICT, '该时段已关闭');
  }

  // 创建订单（直接成 booked）
  const order = await Order.create({
    orderNo: wechatPay.generateOrderNo('O'),
    userId,
    courtId,
    scheduleId,
    amount: schedule.price,
    status: 'booked',  // 2026-07-29 改动：先 booked，通知后再待确认
    contactName,
    contactPhone,
    remark: remark || '',
    notifyStatus: 'pending'
  });

  // 锁定排期
  schedule.status = 'booked';
  schedule.orderId = order.id;
  await schedule.save();

  logger.info(`订单 ${order.orderNo} 创建成功（免支付预订）`);

  // 异步推送球场方（不阻塞返回，失败仅写日志）
  setImmediate(async () => {
    try {
      // 关联查球场方的 openid
      const owner = await User.findOne({
        where: { courtId: order.courtId, role: 'court' },
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

      // 写回推送状态
      const update = { notifyTime: new Date() };
      if (result.skipped) {
        update.notifyStatus = result.reason === 'no_owner_openid' ? 'skipped' : 'skipped';
      } else if (result.ok) {
        update.notifyStatus = 'sent';
      } else {
        update.notifyStatus = 'failed';
        update.notifyErrcode = String(result.errcode || result.error || 'unknown');
      }
      await order.update(update);
      logger.info(`订单 ${order.orderNo} 推送结果: ${update.notifyStatus}${update.notifyErrcode ? ' (' + update.notifyErrcode + ')' : ''}`);
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

/**
 * POST /api/v1/payment/unified-order
 * 调起微信支付（保留接口，未来需支付时启用）
 * 2026-07-29：当前阶段免支付，但保留接口以防回退
 */
async function payOrder(req, res) {
  const { orderId, openid } = req.body;
  const userId = req.user.id;

  const order = await Order.findOne({
    where: { id: orderId, userId },
    include: [{ model: Court, as: 'court' }]
  });

  if (!order) {
    throw new BizError(ErrorCode.NOT_FOUND, '订单不存在');
  }
  if (order.status !== 'pending') {
    throw new BizError(ErrorCode.CONFLICT, `订单状态 ${order.status}，无法支付`);
  }
  if (!openid) {
    throw new BizError(ErrorCode.PARAM_INVALID, '缺少 openid');
  }

  // 调微信统一下单
  const amount = parseFloat(order.amount);
  const totalFee = Math.round(amount * 100);
  const body = `${order.court.name} ${order.contactName}`;

  const payParams = await wechatPay.unifiedOrder({
    openid,
    outTradeNo: order.orderNo,
    totalFee,
    body,
    notifyUrl: process.env.WX_NOTIFY_URL,
    attach: JSON.stringify({ orderId: order.id })
  });

  // 保存支付订单记录
  const { PaymentOrder } = require('../models');
  await PaymentOrder.create({
    orderNo: order.orderNo,
    userId,
    courtId: order.courtId,
    businessType: 'court_book',
    amount: amount,
    status: 'pending',
    payMethod: 'wxpay',
    prepayId: payParams.package?.replace('prepay_id=', '')
  });

  res.json(success({
    orderId: order.id,
    orderNo: order.orderNo,
    amount: amount,
    payParams
  }));
}

/**
 * POST /api/payment/notify
 * 微信支付回调（无鉴权，保留备用）
 */
async function paymentNotify(req, res) {
  const xml = req.body;
  let result;

  try {
    const parsed = await require('../utils/wechat-sign').xmlToObj(xml);
    result = parsed;

    logger.info(`支付回调: out_trade_no=${result.out_trade_no}, result_code=${result.result_code}`);

    if (!require('../utils/wechat-sign').verifySign(result)) {
      logger.warn('支付回调验签失败');
      return res.send(require('../utils/wechat-sign').objToXml({
        return_code: 'FAIL',
        return_msg: '签名失败'
      }));
    }

    if (result.result_code === 'SUCCESS' && result.return_code === 'SUCCESS') {
      const { PaymentOrder } = require('../models');
      const existed = await PaymentOrder.findOne({ where: { transactionId: result.transaction_id } });
      if (existed && existed.status === 'paid') {
        logger.info(`订单 ${result.out_trade_no} 已处理，跳过`);
        return res.send(require('../utils/wechat-sign').objToXml({
          return_code: 'SUCCESS',
          return_msg: 'OK'
        }));
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
          await CourtSchedule.update(
            { status: 'booked' },
            { where: { id: order.scheduleId } }
          );
        }

        await PaymentOrder.update(
          {
            status: 'paid',
            transactionId: result.transaction_id,
            payTime: new Date()
          },
          { where: { orderNo: result.out_trade_no } }
        );

        logger.info(`订单 ${order.orderNo} 支付成功`);
      }
    }

    res.send(require('../utils/wechat-sign').objToXml({
      return_code: 'SUCCESS',
      return_msg: 'OK'
    }));
  } catch (e) {
    logger.error('处理支付回调异常:', e);
    res.send(require('../utils/wechat-sign').objToXml({
      return_code: 'FAIL',
      return_msg: e.message
    }));
  }
}

/**
 * POST /api/v1/payment/refund
 * 申请退款（保留）
 */
async function applyRefund(req, res) {
  const { orderId, reason, amount } = req.body;
  const userId = req.user.id;

  const order = await Order.findOne({ where: { id: orderId, userId } });
  if (!order) {
    throw new BizError(ErrorCode.NOT_FOUND, '订单不存在');
  }
  if (order.status !== 'paid') {
    throw new BizError(ErrorCode.CONFLICT, '订单未支付，无法退款');
  }

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
    refundNo: refundRes.outRefundNo,
    refundId: refundRes.refundId,
    orderNo: order.orderNo,
    amount: refundAmount,
    reason: reason || '',
    status: 'processing',
    operatorId: userId
  });

  res.json(success({
    refundId: refund.id,
    refundNo: refund.refundNo,
    amount: refundAmount,
    status: 'processing',
    estimatedArrival: '1-3个工作日'
  }));
}

/**
 * GET /api/v1/orders
 * 用户的订单列表
 */
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
    limit: Number(pageSize),
    offset
  });

  res.json(success({
    list: rows.map(o => ({
      id: o.id,
      orderNo: o.orderNo,
      courtName: o.court?.name,
      courtType: o.court?.type,
      amount: parseFloat(o.amount),
      status: o.status,
      notifyStatus: o.notifyStatus,
      createdAt: o.createdAt
    })),
    total: count,
    page: Number(page),
    pageSize: Number(pageSize)
  }));
}

/**
 * GET /api/v1/orders/:id
 * 订单详情
 */
async function getOrderDetail(req, res) {
  const { id } = req.params;
  const userId = req.user.id;

  const order = await Order.findOne({
    where: { id, userId },
    include: [
      { model: Court, as: 'court' },
      { model: CourtSchedule, as: 'schedule' }
    ]
  });

  if (!order) {
    throw new BizError(ErrorCode.NOT_FOUND, '订单不存在');
  }

  res.json(success({
    id: order.id,
    orderNo: order.orderNo,
    status: order.status,
    amount: parseFloat(order.amount),
    payAmount: parseFloat(order.payAmount || order.amount),
    contactName: order.contactName,
    contactPhone: order.contactPhone,
    payTime: order.payTime,
    createdAt: order.createdAt,
    notifyStatus: order.notifyStatus,
    notifyTime: order.notifyTime,
    court: {
      id: order.court?.id,
      name: order.court?.name,
      type: order.court?.type,
      address: order.court?.address
    },
    schedule: order.schedule ? {
      date: order.schedule.date,
      timeSlot: order.schedule.timeSlot
    } : null
  }));
}

module.exports = {
  createOrder,
  payOrder,
  paymentNotify,
  applyRefund,
  listMyOrders,
  getOrderDetail
};
