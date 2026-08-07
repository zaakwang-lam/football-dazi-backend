// src/app.js
require('express-async-errors');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const config = require('./config');
const logger = require('./utils/logger');
const { testConnection, sequelize } = require('./utils/db');
const { fail, ErrorCode } = require('./utils/response');
const requestLogger = require('./middlewares/logger');
const errorHandler = require('./middlewares/error');
const routes = require('./routes');

const app = express();
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: config.cors.origin, credentials: true }));
app.use(compression());
const limiter = rateLimit({ windowMs: 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false, handler: (req, res) => res.status(429).json(fail(ErrorCode.PARAM_INVALID, '请求过于频繁，请稍后再试')) });
app.use('/api/', limiter);
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use((req, res, next) => req.path === '/api/payment/notify' ? next() : next());
if (config.env === 'development') app.use(morgan('dev')); else app.use(requestLogger);

// 用户头像静态资源
app.use('/uploads', express.static(path.join(__dirname, '../uploads'), { maxAge: '7d' }));

app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));
app.use(routes);
app.use((req, res) => res.status(404).json(fail(404, `路径不存在: ${req.method} ${req.path}`)));
app.use(errorHandler);

// 生产库历史上把 courts.type 定义成 ENUM，新增 8/3 人制时容易因漏跑 migration 写入失败。
// 启动时将该列规范化为 VARCHAR；允许值仍由 registerRole 的业务白名单控制。
async function ensureCourtTypeColumn() {
  try {
    await sequelize.query("ALTER TABLE courts MODIFY COLUMN type VARCHAR(32) NOT NULL");
    logger.info('✅ courts.type 已同步为 VARCHAR(32)');
  } catch (err) {
    logger.warn(`⚠️ courts.type 自动同步跳过: ${err.message}`);
  }
}

async function start() {
  try {
    await testConnection();
    if (config.env === 'development') {
      await sequelize.sync({ alter: true });
      logger.info('✅ 数据库表结构已同步');
    }
    await ensureCourtTypeColumn();
    app.listen(config.port, () => {
      logger.info('🚀 「足球搭子」后端服务启动成功');
      logger.info(`📍 端口: ${config.port}`);
      logger.info(`🌍 环境: ${config.env}`);
      logger.info(`📖 API 文档: http://localhost:${config.port}/api-docs`);
      const { startAutoExpireCron } = require('./scripts/auto-expire');
      startAutoExpireCron();
    });
  } catch (err) {
    logger.error('启动失败:', err);
    process.exit(1);
  }
}
process.on('SIGTERM', async () => { await sequelize.close(); process.exit(1); });
start();
module.exports = app;