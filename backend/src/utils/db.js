// src/utils/db.js
// Sequelize 数据库连接
const { Sequelize } = require('sequelize');
const config = require('../config');
const logger = require('./logger');

const sequelize = new Sequelize(
  config.db.database,
  config.db.username,
  config.db.password,
  {
    host: config.db.host,
    port: config.db.port,
    dialect: 'mysql',
    timezone: '+08:00',
    logging: config.env === 'development' ? (sql) => logger.debug(sql) : false,
    pool: config.db.pool,
    // 强制连接字符集 (2026-08-04 修复 ENUM 双重编码: 不主动 SET NAMES 会回落到 latin1)
    dialectOptions: { charset: 'utf8mb4' },
    define: {
      underscored: true,  // 使用下划线命名
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci'
    }
  }
);

// 测试连接
async function testConnection() {
  try {
    await sequelize.authenticate();
    // 连接成功后立即对当前实例 SET NAMES (2026-08-04 修复双重编码)
    await sequelize.query("SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci");
    logger.info('✅ 数据库连接成功 (utf8mb4)');
  } catch (err) {
    logger.error('❌ 数据库连接失败:', err);
    process.exit(1);
  }
}

module.exports = { sequelize, testConnection };
