// src/utils/wechat-sign.js
// 微信支付签名工具
const crypto = require('crypto');
const xml2js = require('xml2js');
const config = require('../config');

/**
 * MD5 签名（微信支付 v2 API）
 */
function sign(params, key) {
  const useKey = key || config.wechat.payKey;
  // 1. 过滤空值和 sign
  const filtered = Object.entries(params)
    .filter(([k, v]) => v !== '' && v !== null && v !== undefined && k !== 'sign')
    .sort(([a], [b]) => a.localeCompare(b));

  // 2. 拼接字符串
  const stringA = filtered
    .map(([k, v]) => `${k}=${v}`)
    .join('&');

  // 3. 末尾追加 key
  const stringSignTemp = `${stringA}&key=${useKey}`;

  // 4. MD5 加密并转大写
  return crypto.createHash('md5')
    .update(stringSignTemp, 'utf8')
    .digest('hex')
    .toUpperCase();
}

/**
 * 验签
 */
function verifySign(params, key) {
  const receivedSign = params.sign;
  if (!receivedSign) return false;
  const calculatedSign = sign(params, key);
  return receivedSign === calculatedSign;
}

/**
 * 对象转 XML
 */
function objToXml(obj) {
  const builder = new xml2js.Builder({
    rootName: 'xml',
    headless: true,
    cdata: true
  });
  return builder.buildObject(obj);
}

/**
 * XML 转对象
 */
async function xmlToObj(xml) {
  const parser = new xml2js.Parser({ explicitArray: false, trim: true });
  const result = await parser.parseStringPromise(xml);
  return result.xml || {};
}

/**
 * 生成随机字符串
 */
function nonceStr(length = 32) {
  return crypto.randomBytes(length).toString('hex').substring(0, length);
}

/**
 * 生成订单号（前缀 + 时间戳 + 4位随机数）
 */
function generateOrderNo(prefix = 'O') {
  const timestamp = Date.now();
  const random = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}${timestamp}${random}`;
}

module.exports = {
  sign,
  verifySign,
  objToXml,
  xmlToObj,
  nonceStr,
  generateOrderNo
};