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
// 允许小程序加载跨域图片（头像 /uploads）
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
app.use(cors({ origin: config.cors.origin, credentials: true }));
app.use(compression());
const limiter = rateLimit({ windowMs: 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false, handler: (req, res) => res.status(429).json(fail(ErrorCode.PARAM_INVALID, '请求过于频繁，请稍后再试')) });
app.use('/api/', limiter);
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use((req, res, next) => req.path === '/api/payment/notify' ? next() : next());
if (config.env === 'development') app.use(morgan('dev')); else app.use(requestLogger);

// 用户头像静态资源（需 nginx 把 /uploads 反代到本服务，或由 location / 统一转发）
app.use('/uploads', express.static(path.join(__dirname, '../uploads'), {
  maxAge: '7d',
  setHeaders(res) {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
}));

app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));
app.use(routes);
app.use((req, res) => res.status(404).json(fail(404, `路径不存在: ${req.method} ${req.path}`)));
app.use(errorHandler);

// 生产库历史上把 courts.type 定义成 ENUM，新增 8/3 人制时容易因漏跑 migration 写入失败。
async function ensureCourtTypeColumn() {
  try {
    await sequelize.query("ALTER TABLE courts MODIFY COLUMN type VARCHAR(32) NOT NULL");
    logger.info('✅ courts.type 已同步为 VARCHAR(32)');
  } catch (err) {
    logger.warn(`⚠️ courts.type 自动同步跳过: ${err.message}`);
  }
}

/**
 * 历史模型把 courts.owner_id 外键指到 admins，
 * 小程序球场方注册写入 users.id 时会报：
 * Cannot add or update a child row: a foreign key constraint fails
 * 启动时删除指向 admins 的外键；owner_id 由业务层保证（= users.id）。
 */
async function ensureCourtOwnerIdFk() {
  try {
    const [rows] = await sequelize.query(`
      SELECT CONSTRAINT_NAME AS name, REFERENCED_TABLE_NAME AS refTable
      FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'courts'
        AND COLUMN_NAME = 'owner_id'
        AND REFERENCED_TABLE_NAME IS NOT NULL
    `);
    for (const row of rows || []) {
      const name = row.name || row.CONSTRAINT_NAME;
      const ref = row.refTable || row.REFERENCED_TABLE_NAME;
      if (!name) continue;
      await sequelize.query(`ALTER TABLE courts DROP FOREIGN KEY \`${name}\``);
      logger.info(`✅ 已删除 courts.owner_id 外键 ${name} (原指向 ${ref})`);
    }
    if (!rows || !rows.length) {
      logger.info('ℹ️ courts.owner_id 无外键约束，跳过');
    }
  } catch (err) {
    logger.warn(`⚠️ courts.owner_id 外键处理跳过: ${err.message}`);
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
    await ensureCourtOwnerIdFk();
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
