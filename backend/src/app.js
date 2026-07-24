// src/app.js
// 主入口
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const config = require('./config');
const logger = require('./utils/logger');
const { testConnection, sequelize } = require('./utils/db');
const { fail, ErrorCode } = require('./utils/response');

// 中间件
const requestLogger = require('./middlewares/logger');
const errorHandler = require('./middlewares/error');

// 路由
const routes = require('./routes');

// 初始化
const app = express();

// 信任 nginx 反向代理
app.set('trust proxy', 1);

// 安全
app.use(helmet());
app.use(cors({
  origin: config.cors.origin,
  credentials: true
}));

// 压缩
app.use(compression());

// 限流
const limiter = rateLimit({
  windowMs: 60 * 1000,  // 1 分钟
  max: 100,  // 最多 100 个请求
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json(fail(ErrorCode.PARAM_INVALID, '请求过于频繁，请稍后再试'));
  }
});
app.use('/api/', limiter);

// Body 解析（注意：notify 接口需要原始 XML，所以单独用 text 解析）
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// 跳过 notify 接口的 JSON 解析（在路由前）
app.use((req, res, next) => {
  if (req.path === '/api/payment/notify') {
    return next();
  }
  next();
});

// 日志
if (config.env === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(requestLogger);
}

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// 业务路由
app.use(routes);

// 404
app.use((req, res) => {
  res.status(404).json(fail(404, `路径不存在: ${req.method} ${req.path}`));
});

// 全局错误处理
app.use(errorHandler);

// 启动服务
async function start() {
  try {
    await testConnection();
    // 开发环境自动同步表结构（生产环境禁用！）
    if (config.env === 'development') {
      await sequelize.sync({ alter: true });
      logger.info('✅ 数据库表结构已同步');
    }

    app.listen(config.port, () => {
      logger.info(`🚀 「足球搭子」后端服务启动成功`);
      logger.info(`📍 端口: ${config.port}`);
      logger.info(`🌍 环境: ${config.env}`);
      logger.info(`📖 API 文档: http://localhost:${config.port}/api-docs`);
    });
  } catch (err) {
    logger.error('启动失败:', err);
    process.exit(1);
  }
}

// 优雅退出
process.on('SIGTERM', async () => {
  logger.info('收到 SIGTERM，开始优雅退出...');
  await sequelize.close();
  process.exit(0);
});

start();

module.exports = app;