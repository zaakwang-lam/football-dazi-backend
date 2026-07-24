// src/services/wechat-pay.js
// 微信支付 v2 API 服务
const axios = require('axios');
const fs = require('fs');
const config = require('../config');
const { sign, objToXml, xmlToObj, nonceStr, generateOrderNo } = require('../utils/wechat-sign');
const logger = require('../utils/logger');

const WX_PAY_URL = 'https://api.mch.weixin.qq.com';
const WX_PAY_API = {
  unifiedOrder: '/pay/unifiedorder',
  refund: '/secapi/pay/refund',
  refundQuery: '/pay/refundquery',
  orderQuery: '/pay/orderquery'
};

/**
 * 统一下单 - JSAPI
 * @param {Object} params
 * @param {string} params.openid  - 用户 openid
 * @param {string} params.outTradeNo - 商户订单号
 * @param {number} params.totalFee - 金额（分）
 * @param {string} params.body - 商品描述
 * @param {string} params.notifyUrl - 回调地址
 * @returns {Promise<Object>} 包含 prepay_id 等支付参数
 */
async function unifiedOrder({ openid, outTradeNo, totalFee, body, notifyUrl, attach }) {
  const params = {
    appid: config.wechat.appid,
    mch_id: config.wechat.mchid,
    nonce_str: nonceStr(),
    body: body,
    out_trade_no: outTradeNo,
    total_fee: totalFee,  // 单位：分
    spbill_create_ip: '127.0.0.1',
    notify_url: notifyUrl || config.wechat.notifyUrl,
    trade_type: 'JSAPI',
    openid: openid,
    attach: attach || ''
  };

  // 签名
  params.sign = sign(params);

  const xml = objToXml(params);
  logger.info(`微信统一下单: out_trade_no=${outTradeNo}, total_fee=${totalFee}`);

  try {
    const response = await axios.post(WX_PAY_URL + WX_PAY_API.unifiedOrder, xml, {
      headers: { 'Content-Type': 'application/xml' },
      responseType: 'text',
      timeout: 15000
    });

    const result = await xmlToObj(response.data);
    if (result.return_code !== 'SUCCESS') {
      throw new Error(`微信下单失败: ${result.return_msg}`);
    }
    if (result.result_code !== 'SUCCESS') {
      throw new Error(`微信下单业务失败: ${result.err_code_des}`);
    }

    // 生成前端调起支付所需参数
    return buildPayParams(result.prepay_id);
  } catch (e) {
    logger.error('微信统一下单异常:', e);
    throw e;
  }
}

/**
 * 构建前端支付参数
 */
function buildPayParams(prepayId) {
  const params = {
    appId: config.wechat.appid,
    timeStamp: Math.floor(Date.now() / 1000).toString(),
    nonceStr: nonceStr(),
    package: `prepay_id=${prepayId}`,
    signType: 'MD5'
  };
  params.paySign = sign(params);
  return params;
}

/**
 * 申请退款
 * @param {Object} params
 * @param {string} params.outTradeNo - 原商户订单号
 * @param {string} params.outRefundNo - 商户退款单号
 * @param {number} params.totalFee - 原订单金额（分）
 * @param {number} params.refundFee - 退款金额（分）
 * @param {string} params.refundDesc - 退款原因
 */
async function refund({ outTradeNo, outRefundNo, totalFee, refundFee, refundDesc }) {
  const params = {
    appid: config.wechat.appid,
    mch_id: config.wechat.mchid,
    nonce_str: nonceStr(),
    out_trade_no: outTradeNo,
    out_refund_no: outRefundNo,
    total_fee: totalFee,
    refund_fee: refundFee,
    refund_desc: refundDesc || '用户取消'
  };
  params.sign = sign(params);

  const xml = objToXml(params);

  try {
    // 退款需要双向证书
    const response = await axios.post(WX_PAY_URL + WX_PAY_API.refund, xml, {
      headers: { 'Content-Type': 'application/xml' },
      responseType: 'text',
      timeout: 15000,
      httpsAgent: new (require('https').Agent)({
        cert: fs.readFileSync(config.wechat.certPath),
        key: fs.readFileSync(config.wechat.keyPath),
        rejectUnauthorized: false
      })
    });

    const result = await xmlToObj(response.data);
    if (result.return_code !== 'SUCCESS') {
      throw new Error(`微信退款失败: ${result.return_msg}`);
    }
    if (result.result_code !== 'SUCCESS') {
      throw new Error(`微信退款业务失败: ${result.err_code_des}`);
    }
    return {
      refundId: result.refund_id,
      outRefundNo: outRefundNo,
      status: 'processing'
    };
  } catch (e) {
    logger.error('微信退款异常:', e);
    throw e;
  }
}

/**
 * 查询退款
 */
async function queryRefund({ outRefundNo }) {
  const params = {
    appid: config.wechat.appid,
    mch_id: config.wechat.mchid,
    nonce_str: nonceStr(),
    out_refund_no: outRefundNo
  };
  params.sign = sign(params);

  const xml = objToXml(params);
  try {
    const response = await axios.post(WX_PAY_URL + WX_PAY_API.refundQuery, xml, {
      headers: { 'Content-Type': 'application/xml' },
      responseType: 'text',
      timeout: 15000
    });
    const result = await xmlToObj(response.data);
    if (result.return_code === 'SUCCESS' && result.result_code === 'SUCCESS') {
      return {
        status: result.refund_status_0 === 'SUCCESS' ? 'success' :
                result.refund_status_0 === 'PROCESSING' ? 'processing' : 'failed',
        refundId: result.refund_id_0,
        amount: parseInt(result.refund_fee_0) / 100
      };
    }
    return null;
  } catch (e) {
    logger.error('查询退款异常:', e);
    return null;
  }
}

/**
 * 查询订单
 */
async function queryOrder({ outTradeNo }) {
  const params = {
    appid: config.wechat.appid,
    mch_id: config.wechat.mchid,
    nonce_str: nonceStr(),
    out_trade_no: outTradeNo
  };
  params.sign = sign(params);

  const xml = objToXml(params);
  try {
    const response = await axios.post(WX_PAY_URL + WX_PAY_API.orderQuery, xml, {
      headers: { 'Content-Type': 'application/xml' },
      responseType: 'text',
      timeout: 15000
    });
    const result = await xmlToObj(response.data);
    if (result.return_code === 'SUCCESS' && result.result_code === 'SUCCESS') {
      return {
        tradeState: result.trade_state,
        transactionId: result.transaction_id,
        amount: parseInt(result.total_fee) / 100
      };
    }
    return null;
  } catch (e) {
    logger.error('查询订单异常:', e);
    return null;
  }
}

module.exports = {
  unifiedOrder,
  refund,
  queryRefund,
  queryOrder,
  generateOrderNo
};