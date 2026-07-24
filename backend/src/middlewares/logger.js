// src/middlewares/logger.js
// 请求日志中间件
const logger = require('../utils/logger');

function requestLogger(req, res, next) {
  const start = Date.now();
  const { method, path, ip } = req;

  res.on('finish', () => {
    const duration = Date.now() - start;
    const { statusCode } = res;
    logger.info(`${method} ${path} ${statusCode} ${duration}ms - ${ip}`);
  });

  next();
}

module.exports = requestLogger;