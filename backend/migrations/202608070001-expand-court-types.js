// 扩展球场人制枚举：11/8/7/5/3 人制
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE courts
      MODIFY COLUMN type ENUM('11人制','8人制','7人制','5人制','3人制') NOT NULL
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      ALTER TABLE courts
      MODIFY COLUMN type ENUM('11人制','7人制','5人制') NOT NULL
    `);
  }
};
