// src/config/index.js
// 统一配置中心
require('dotenv').config();

module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT) || 3000,
  appName: process.env.APP_NAME || 'football-dazi',

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    database: process.env.DB_NAME || 'football_dazi',
    username: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    pool: {
      max: parseInt(process.env.DB_POOL_MAX) || 10,
      min: parseInt(process.env.DB_POOL_MIN) || 2,
      acquire: 30000,
      idle: 10000
    }
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'change_me',
    expiresIn: process.env.JWT_EXPIRES_IN || '2h',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d'
  },

  wechat: {
    appid: process.env.WX_APPID,
    secret: process.env.WX_SECRET,
    mchid: process.env.WX_MCHID,
    payKey: process.env.WX_PAY_KEY,
    notifyUrl: process.env.WX_NOTIFY_URL,
    certPath: process.env.WX_CERT_PATH,
    keyPath: process.env.WX_KEY_PATH
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined
  },

  log: {
    level: process.env.LOG_LEVEL || 'info',
    path: process.env.LOG_PATH || './logs'
  },

  cors: {
    origin: process.env.CORS_ORIGIN || '*'
  }
};