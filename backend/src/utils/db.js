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
    logger.info('✅ 数据库连接成功');
  } catch (err) {
    logger.error('❌ 数据库连接失败:', err);
    process.exit(1);
  }
}

module.exports = { sequelize, testConnection };