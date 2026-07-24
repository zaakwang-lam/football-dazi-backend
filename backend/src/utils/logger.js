// src/utils/logger.js
const winston = require('winston');
require('winston-daily-rotate-file');
const path = require('path');
const config = require('../config');

const { combine, timestamp, printf, colorize, errors } = winston.format;

// 自定义格式
const myFormat = printf(({ level, message, timestamp: ts, stack }) => {
  return `${ts} [${level}] ${stack || message}`;
});

// 日志传输
const transports = [
  new winston.transports.Console({
    format: combine(colorize(), timestamp(), myFormat),
    level: config.log.level
  }),
  new winston.transports.DailyRotateFile({
    filename: path.join(config.log.path, 'app-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxFiles: '30d',
    format: combine(timestamp(), errors({ stack: true }), myFormat)
  }),
  new winston.transports.DailyRotateFile({
    filename: path.join(config.log.path, 'error-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    level: 'error',
    maxFiles: '30d',
    format: combine(timestamp(), errors({ stack: true }), myFormat)
  })
];

const logger = winston.createLogger({
  level: config.log.level,
  transports
});

module.exports = logger;