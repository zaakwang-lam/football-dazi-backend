const jwt = require('jsonwebtoken');
const config = require('../config');
const logger = require('./logger');

const ACCESS_SECRET = config.jwt.secret;
const REFRESH_SECRET = config.jwt.secret + '_refresh';
const VERIFY_OPTS = { clockTolerance: 120 };

function generateAccessToken(payload) {
  return jwt.sign(payload, ACCESS_SECRET, {
    expiresIn: config.jwt.expiresIn
  });
}

function generateRefreshToken(payload) {
  return jwt.sign(payload, REFRESH_SECRET, {
    expiresIn: config.jwt.refreshExpiresIn
  });
}

function verifyAccessToken(token) {
  try {
    return jwt.verify(token, ACCESS_SECRET, VERIFY_OPTS);
  } catch (e) {
    logger.warn(`[jwt] access rejected: ${e.name || 'error'}`);
    return null;
  }
}

function verifyRefreshToken(token) {
  try {
    return jwt.verify(token, REFRESH_SECRET, VERIFY_OPTS);
  } catch (e) {
    logger.warn(`[jwt] refresh rejected: ${e.name || 'error'}`);
    return null;
  }
}

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken
};
