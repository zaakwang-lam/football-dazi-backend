// src/services/wechat-msg.js
// 微信订阅消息服务（用于球场方接收预订通知）
const axios = require('axios');
const NodeCache = require('node-cache');
const logger = require('../utils/logger');

// Access token 缓存（TTL 7000s，微信官方是 7200s，留 200s 余量）
const tokenCache = new NodeCache({ stdTTL: 7000 });

/**
 * 获取微信接口调用凭证 access_token
 * 见：https://developers.weixin.qq.com/miniprogram/dev/api-backend/open-api/access-token/auth.getAccessToken.html
 */
async function getAccessToken() {
  const cached = tokenCache.get('access_token');
  if (cached) return cached;

  const appid = process.env.WX_APPID;
  const secret = process.env.WX_SECRET;
  if (!appid || !secret) {
    throw new Error('WX_APPID / WX_SECRET 未配置');
  }

  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appid}&secret=${secret}`;
  const res = await axios.get(url, { timeout: 5000 });

  if (res.data.errcode) {
    logger.error('获取 access_token 失败:', res.data);
    throw new Error(`获取 access_token 失败: ${res.data.errmsg} (${res.data.errcode})`);
  }

  const { access_token, expires_in } = res.data;
  tokenCache.set('access_token', access_token, Math.min(expires_in - 200, 7000));
  logger.info(`access_token 已刷新（expires_in=${expires_in}s）`);
  return access_token;
}

/**
 * 发送一次性订阅消息
 * @param {Object} params
 * @param {string} params.touser - 接收者 openid
 * @param {string} params.templateId - 模板 ID
 * @param {string} params.page - 点击模板卡片跳转页面
 * @param {Object} params.data - 模板数据（每个 key 对应一个 {{keyword.DATA}} 占位符）
 * @param {string} [params.miniprogramState] - 跳转小程序类型：developer/test/trial/formal
 *
 * 见：https://developers.weixin.qq.com/miniprogram/dev/api-backend/open-api/subscribe-message/subscribeMessage.send.html
 */
async function sendSubscribeMessage({ touser, templateId, page, data, miniprogramState = 'formal' }) {
  if (!touser) {
    throw new Error('touser (openid) 必填');
  }
  if (!templateId || templateId.startsWith('TEMPLATE_ID_')) {
    // 占位符模式：跳过实际发送，只记录日志
    logger.warn(`[订阅消息跳过] templateId 是占位符 (${templateId})，未发送。需在 .env 配置真实模板 ID。`);
    return { skipped: true, reason: 'template_id_pending' };
  }

  const accessToken = await getAccessToken();
  const url = `https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${accessToken}`;

  const payload = {
    touser,
    template_id: templateId,
    page,
    miniprogram_state: miniprogramState,
    lang: 'zh_CN',
    data
  };

  const res = await axios.post(url, payload, { timeout: 5000 });

  if (res.data.errcode !== 0) {
    logger.error(`订阅消息发送失败 (openid=${touser}):`, res.data);
    // 40037 = template_id 不存在；43101 = 用户未订阅此消息；errcode 格式：https://developers.weixin.qq.com/miniprogram/dev/api-backend/open-api/subscribe-message/subscribeMessage.send.html
    return { ok: false, errcode: res.data.errcode, errmsg: res.data.errmsg };
  }

  logger.info(`订阅消息已送达 (openid=${touser}, msgid=${res.data.msgid})`);
  return { ok: true, msgid: res.data.msgid };
}

/**
 * 推送订场通知给球场方（一次性订阅消息）
 * @param {Object} order - 订单实例（含关联 court, schedule）
 * @param {string} ownerOpenid - 球场方微信 openid
 * @param {string} acceptToken - 用户授权过的订阅消息 token（accept_xxx_xxx）
 *
 * 注意：
 * - 一次性订阅消息：每个 token 只能发一条消息（理论上次次有效但微信做了限制）
 * - 用户每次预订都需要重新点击"订阅"按钮获取新 token
 * - 我们这里**不使用** token 发送，走服务端主动推送（需用户长期订阅模式，但个人小程序难申请）
 *
 * 实际方案：依赖用户在球场方小程序端**勾选"接收订场通知"**时拿到的 token，存到 User 表
 * 简化：先用占位符 API（log-only），待宏哥填入真实 template_id 后再启用完整发送
 */
async function notifyCourtOwner(order, ownerOpenid) {
  if (!ownerOpenid) {
    logger.warn(`订单 ${order.orderNo}: 球场方 openid 为空，跳过推送`);
    return { skipped: true, reason: 'no_owner_openid' };
  }

  const templateId = process.env.WX_TEMPLATE_ID_BOOK;
  const court = order.court || {};
  const schedule = order.schedule || {};
  const timeText = schedule.date && schedule.timeSlot ? `${schedule.date} ${schedule.timeSlot}` : '';

  // 模板字段（对应模板：{{name1.DATA}} / {{phone2.DATA}} / {{thing5.DATA}} / {{date4.DATA}} / {{phrase8.DATA}}）
  // 注：模板字段名是宏哥在微信后台配置时定的，下面仅作参考，实际以模板为准
  const data = {
    name1: { value: order.contactName || '匿名' },
    phone2: { value: order.contactPhone || '未填' },
    thing5: { value: (court.name || '').slice(0, 20) },
    date4: { value: timeText.slice(0, 17) },
    phrase8: { value: '请尽快联系预订人确认' }
  };

  try {
    const result = await sendSubscribeMessage({
      touser: ownerOpenid,
      templateId,
      page: `pages/court-orders/list?orderNo=${order.orderNo}`, // 2026-07-29: 跳转球场方小程序订单页
      data
    });
    return result;
  } catch (e) {
    logger.error(`推送订单 ${order.orderNo} 失败:`, e.message);
    return { ok: false, error: e.message };
  }
}

module.exports = {
  getAccessToken,
  sendSubscribeMessage,
  notifyCourtOwner
};
