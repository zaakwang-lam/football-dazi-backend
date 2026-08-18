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
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
app.use(cors({ origin: config.cors.origin, credentials: true }));
app.use(compression());
const limiter = rateLimit({ windowMs: 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false, handler: (req, res) => res.status(429).json(fail(ErrorCode.PARAM_INVALID, '请求过于频繁，请稍后再试')) });
app.use('/api/', limiter);
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
if (config.env === 'development') app.use(morgan('dev')); else app.use(requestLogger);

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

async function ensureCourtTypeColumn() {
  try {
    await sequelize.query("ALTER TABLE courts MODIFY COLUMN type VARCHAR(32) NOT NULL");
    logger.info('✅ courts.type 已同步为 VARCHAR(32)');
  } catch (err) {
    logger.warn(`⚠️ courts.type 自动同步跳过: ${err.message}`);
  }
}

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
  } catch (err) {
    logger.warn(`⚠️ courts.owner_id 外键处理跳过: ${err.message}`);
  }
}

async function ensureBannerTable() {
  try {
    const { Banner } = require('./models');
    await Banner.sync({ alter: true });
    logger.info('✅ banners 表已同步');
  } catch (err) {
    logger.warn(`⚠️ banners 表同步跳过: ${err.message}`);
  }
}

/** 安全创建/修补 lfg_joins，避免 alter 失败拖垮启动 */
async function ensureLfgJoinTable() {
  try {
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS lfg_joins (
        id INT AUTO_INCREMENT PRIMARY KEY,
        lfg_id INT NOT NULL,
        user_id INT NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_lfg_joins_lfg (lfg_id),
        INDEX idx_lfg_joins_user (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    try {
      await sequelize.query(
        "ALTER TABLE lfg_joins MODIFY COLUMN status VARCHAR(32) NOT NULL DEFAULT 'pending'"
      );
    } catch (e) { /* ignore */ }
    // 补时间戳列（老表可能没有）
    for (const col of ['created_at', 'updated_at']) {
      try {
        await sequelize.query(
          `ALTER TABLE lfg_joins ADD COLUMN ${col} DATETIME DEFAULT CURRENT_TIMESTAMP`
        );
      } catch (e) { /* already exists */ }
    }
    logger.info('✅ lfg_joins 表已就绪');
  } catch (err) {
    logger.warn(`⚠️ lfg_joins 表处理跳过: ${err.message}`);
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
    await ensureBannerTable();
    await ensureLfgJoinTable();
    app.listen(config.port, () => {
      logger.info('🚀 「足球搭子」后端服务启动成功');
      logger.info(`📍 端口: ${config.port}`);
      logger.info(`🌍 环境: ${config.env}`);
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
