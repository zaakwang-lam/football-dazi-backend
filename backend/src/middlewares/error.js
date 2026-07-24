// src/middlewares/error.js
// 全局错误处理
const { fail, BizError } = require('../utils/response');
const logger = require('../utils/logger');

function errorHandler(err, req, res, next) {
  // 业务异常
  if (err.isBizError) {
    logger.warn(`业务异常 [${err.code}]: ${err.message} - ${req.method} ${req.path}`);
    return res.status(err.code >= 500 ? 500 : 400).json(fail(err.code, err.message));
  }

  // Sequelize 验证错误
  if (err.name === 'SequelizeValidationError') {
    const msg = err.errors[0]?.message || '数据验证失败';
    return res.status(400).json(fail(400, msg));
  }

  // Sequelize 唯一键冲突
  if (err.name === 'SequelizeUniqueConstraintError') {
    return res.status(409).json(fail(409, '数据已存在'));
  }

  // JWT 错误
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json(fail(401, 'Token 无效'));
  }

  // 其他未知错误
  logger.error(`未处理异常 [${req.method} ${req.path}]:`, err);
  return res.status(500).json(fail(500, '服务器内部错误'));
}

module.exports = errorHandler;