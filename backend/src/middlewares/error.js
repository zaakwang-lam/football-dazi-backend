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
    const msg = err.errors?.[0]?.message || '数据验证失败';
    return res.status(400).json(fail(400, msg));
  }

  // Sequelize 唯一键冲突
  if (err.name === 'SequelizeUniqueConstraintError') {
    return res.status(409).json(fail(409, '数据已存在'));
  }

  // 外键约束失败（例如报名时 user_id / lfg_id 无效）
  if (err.name === 'SequelizeForeignKeyConstraintError') {
    logger.warn(`外键失败 ${req.method} ${req.path}: ${err.message}`);
    return res.status(400).json(fail(400, '关联数据不存在或已失效，请刷新后重试'));
  }

  // 其它数据库错误：把关键信息带回，便于真机排查（截断避免过长）
  if (err.name === 'SequelizeDatabaseError' || err.name === 'SequelizeDatabaseError') {
    const raw = String(err.parent?.sqlMessage || err.message || '数据库错误');
    logger.error(`数据库错误 [${req.method} ${req.path}]: ${raw}`);
    return res.status(400).json(fail(400, `数据库错误：${raw.slice(0, 120)}`));
  }

  // JWT 错误
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return res.status(401).json(fail(401, 'Token 无效或已过期'));
  }

  // 其他未知错误
  logger.error(`未处理异常 [${req.method} ${req.path}]:`, err);
  const hint = err && err.message ? String(err.message).slice(0, 80) : '';
  return res.status(500).json(fail(500, hint ? `服务器内部错误：${hint}` : '服务器内部错误'));
}

module.exports = errorHandler;
