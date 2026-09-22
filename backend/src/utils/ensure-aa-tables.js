// src/utils/ensure-aa-tables.js
// 生产环境不会 sequelize.sync 全库，AA 两张表必须用 SQL 显式创建。
const { sequelize } = require('./db');
const logger = require('./logger');

let ready = false;
let inflight = null;

async function runSql(sql) {
  await sequelize.query(sql);
}

async function runSqlIgnore(sql) {
  try {
    await sequelize.query(sql);
  } catch (err) {
    const msg = String(err.message || '');
    if (/Duplicate column|already exists|ER_DUP_FIELDNAME|ER_DUP_KEYNAME/i.test(msg)) return;
    logger.warn(`[aa-schema] skip: ${msg.slice(0, 160)}`);
  }
}

async function ensureAaPaymentTables() {
  if (ready) return;
  if (inflight) return inflight;
  inflight = (async () => {
    await runSql(`
      CREATE TABLE IF NOT EXISTS aa_payments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        team_id INT NOT NULL,
        lfg_id INT NULL,
        initiator_id INT NOT NULL,
        title VARCHAR(64) NULL,
        remark VARCHAR(255) NULL,
        total_amount DECIMAL(10,2) DEFAULT 0,
        per_amount DECIMAL(10,2) DEFAULT 0,
        match_ended TINYINT DEFAULT 0,
        status VARCHAR(16) NOT NULL DEFAULT 'draft',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_aa_team (team_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await runSql(`
      CREATE TABLE IF NOT EXISTS aa_payment_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        payment_id INT NOT NULL,
        user_id INT NULL,
        display_name VARCHAR(32) NULL,
        amount DECIMAL(10,2) DEFAULT 0,
        included TINYINT DEFAULT 1,
        pay_status VARCHAR(16) NOT NULL DEFAULT 'unpaid',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_aa_item_pay (payment_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    const alters = [
      'ALTER TABLE aa_payments ADD COLUMN lfg_id INT NULL',
      'ALTER TABLE aa_payments ADD COLUMN remark VARCHAR(255) NULL',
      'ALTER TABLE aa_payments ADD COLUMN match_ended TINYINT DEFAULT 0',
      "ALTER TABLE aa_payments MODIFY COLUMN status VARCHAR(16) NOT NULL DEFAULT 'draft'",
      'ALTER TABLE aa_payments ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP',
      'ALTER TABLE aa_payments ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
      'ALTER TABLE aa_payment_items ADD COLUMN display_name VARCHAR(32) NULL',
      'ALTER TABLE aa_payment_items ADD COLUMN included TINYINT DEFAULT 1',
      "ALTER TABLE aa_payment_items ADD COLUMN pay_status VARCHAR(16) NOT NULL DEFAULT 'unpaid'",
      'ALTER TABLE aa_payment_items ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP',
      'ALTER TABLE aa_payment_items ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'
    ];
    for (const sql of alters) {
      await runSqlIgnore(sql);
    }
    ready = true;
    logger.info('✅ aa_payments / aa_payment_items 表已就绪');
  })();
  try {
    await inflight;
  } catch (err) {
    inflight = null;
    ready = false;
    logger.error(`❌ AA 表创建失败: ${err.message}`);
    throw err;
  }
  return inflight;
}

module.exports = { ensureAaPaymentTables };
