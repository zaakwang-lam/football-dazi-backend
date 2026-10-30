const { sequelize } = require('./db');
const logger = require('./logger');

async function ensureCooperationSchema() {
  const alters = [
    'ALTER TABLE courts ADD COLUMN entity_type VARCHAR(16) NULL',
    'ALTER TABLE courts ADD COLUMN credit_code VARCHAR(32) NULL',
    'ALTER TABLE courts ADD COLUMN taxpayer_type VARCHAR(16) NULL',
    'ALTER TABLE courts ADD COLUMN invoice_title VARCHAR(64) NULL',
    'ALTER TABLE courts ADD COLUMN invoice_tax_no VARCHAR(32) NULL',
    'ALTER TABLE courts ADD COLUMN invoice_address VARCHAR(128) NULL',
    'ALTER TABLE courts ADD COLUMN invoice_bank VARCHAR(128) NULL',
    'ALTER TABLE courts ADD COLUMN invoice_phone VARCHAR(20) NULL',
    'ALTER TABLE courts ADD COLUMN settle_account_name VARCHAR(64) NULL',
    'ALTER TABLE courts ADD COLUMN settle_bank_name VARCHAR(64) NULL',
    'ALTER TABLE courts ADD COLUMN settle_bank_account VARCHAR(64) NULL',
    'ALTER TABLE court_schedules ADD COLUMN floor_price DECIMAL(10,2) NULL',
    'ALTER TABLE court_schedules ADD COLUMN pending_floor_price DECIMAL(10,2) NULL',
    'ALTER TABLE court_schedules ADD COLUMN floor_effective_at DATETIME NULL',
    'ALTER TABLE orders ADD COLUMN floor_price DECIMAL(10,2) NULL',
    'ALTER TABLE orders ADD COLUMN channel_fee DECIMAL(10,2) NULL',
    'ALTER TABLE orders ADD COLUMN agency_fee DECIMAL(10,2) NULL'
  ];
  for (const sql of alters) {
    try {
      await sequelize.query(sql);
      logger.info(`✅ ${sql}`);
    } catch (err) {
      logger.warn(`⚠️ 合作字段同步跳过: ${err.message}`);
    }
  }
}

module.exports = { ensureCooperationSchema };
