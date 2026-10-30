const { sequelize } = require('./db');
const logger = require('./logger');

async function ensureCityManagerSchema() {
  const alters = [
    "ALTER TABLE admins MODIFY COLUMN role ENUM('super_admin','court_admin','finance','ops','city_manager') NOT NULL DEFAULT 'court_admin'",
    'ALTER TABLE admins ADD COLUMN region VARCHAR(64) NULL',
    'ALTER TABLE admins ADD COLUMN id_card VARCHAR(32) NULL',
    'ALTER TABLE admins ADD COLUMN bank_name VARCHAR(64) NULL',
    'ALTER TABLE admins ADD COLUMN bank_account VARCHAR(64) NULL'
  ];
  for (const sql of alters) {
    try {
      await sequelize.query(sql);
      logger.info(`✅ ${sql}`);
    } catch (err) {
      logger.warn(`⚠️ 城市经理字段同步跳过: ${err.message}`);
    }
  }
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS city_manager_courts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      admin_id INT NOT NULL,
      court_id INT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_city_manager_court (admin_id, court_id),
      KEY idx_city_manager_court (court_id)
    )
  `);
}

module.exports = { ensureCityManagerSchema };
