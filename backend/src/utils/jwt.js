// src/utils/jwt.js
const jwt = require('jsonwebtoken');
const config = require('../config');

const ACCESS_SECRET = config.jwt.secret;
const REFRESH_SECRET = config.jwt.secret + '_refresh';

/**
 * 生成访问令牌
 */
function generateAccessToken(payload) {
  return jwt.sign(payload, ACCESS_SECRET, {
    expiresIn: config.jwt.expiresIn
  });
}

/**
 * 生成刷新令牌
 */
function generateRefreshToken(payload) {
  return jwt.sign(payload, REFRESH_SECRET, {
    expiresIn: config.jwt.refreshExpiresIn
  });
}

/**
 * 验证访问令牌
 */
function verifyAccessToken(token) {
  try {
    return jwt.verify(token, ACCESS_SECRET);
  } catch (e) {
    return null;
  }
}

/**
 * 验证刷新令牌
 */
function verifyRefreshToken(token) {
  try {
    return jwt.verify(token, REFRESH_SECRET);
  } catch (e) {
    return null;
  }
}

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken
};