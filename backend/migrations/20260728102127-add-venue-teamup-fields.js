'use strict';

/**
 * Migration: 为球场/组队加字段（兼容旧数据，不删旧字段）
 *
 * 触发: 2026-07-28 宏哥需求
 *   - Court 加 district（行政区）/ surface_types（场地性质多选）/ open_hours（按周多时段）
 *   - LfgPost 加 fee（人均费用）/ match_types（人制多选）
 *
 * 兼容方案 A：旧字段全部保留，新字段都 allowNull，旧数据 0 迁移
 *   - 旧 Court.surfaceType（单选 ENUM）保留作 fallback
 *   - 旧 Court.openTime/closeTime（单时段）保留作 fallback
 *   - 旧 LfgPost.type ('sub'/'war') 保留作 fallback
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // ===== 1. Courts 表加 3 个新字段 =====
    await queryInterface.addColumn('courts', 'district', {
      type: Sequelize.STRING(32),
      allowNull: true,
      comment: '行政区（天河/海珠/越秀/荔湾/白云/黄埔/番禺/花都/南沙/从化/增城），11 选 1',
      after: 'address'
    });

    await queryInterface.addColumn('courts', 'surface_types', {
      type: Sequelize.JSON,
      allowNull: true,
      comment: '场地性质多选 ["人工草地","天然草地","硬地"]',
      after: 'surface_type'
    });

    await queryInterface.addColumn('courts', 'open_hours', {
      type: Sequelize.JSON,
      allowNull: true,
      comment: '按周开放多时段 {周一:[{start:"18:00",end:"22:00"}], 周二:[], ...}',
      after: 'close_time'
    });

    // ===== 2. lfg_posts 表加 2 个新字段 =====
    await queryInterface.addColumn('lfg_posts', 'fee', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
      comment: '人均费用（元），可空'
    });

    await queryInterface.addColumn('lfg_posts', 'match_types', {
      type: Sequelize.JSON,
      allowNull: true,
      comment: '人制多选 ["11人制","7人制","5人制"]'
    });

    // ===== 3. 为已有数据填充默认值（兼容旧数据） =====
    // 已有 courts 记录的 surface_types 默认填充 surfaceType 单选值（保证前端读新字段不为空）
    await queryInterface.sequelize.query(`
      UPDATE courts
      SET surface_types = JSON_ARRAY(surface_type)
      WHERE surface_types IS NULL AND surface_type IS NOT NULL
    `);

    // 已有 courts 记录的 open_hours 默认从 openTime/closeTime 拼出周一-周日统一时段
    // 这样老场地在前端展示"周一-周日 全是 08:00-22:00"（接近真实开放时间）
    await queryInterface.sequelize.query(`
      UPDATE courts
      SET open_hours = JSON_OBJECT(
        '周一', JSON_ARRAY(JSON_OBJECT('start', TIME_FORMAT(open_time, '%H:%i'), 'end', TIME_FORMAT(close_time, '%H:%i'))),
        '周二', JSON_ARRAY(JSON_OBJECT('start', TIME_FORMAT(open_time, '%H:%i'), 'end', TIME_FORMAT(close_time, '%H:%i'))),
        '周三', JSON_ARRAY(JSON_OBJECT('start', TIME_FORMAT(open_time, '%H:%i'), 'end', TIME_FORMAT(close_time, '%H:%i'))),
        '周四', JSON_ARRAY(JSON_OBJECT('start', TIME_FORMAT(open_time, '%H:%i'), 'end', TIME_FORMAT(close_time, '%H:%i'))),
        '周五', JSON_ARRAY(JSON_OBJECT('start', TIME_FORMAT(open_time, '%H:%i'), 'end', TIME_FORMAT(close_time, '%H:%i'))),
        '周六', JSON_ARRAY(JSON_OBJECT('start', TIME_FORMAT(open_time, '%H:%i'), 'end', TIME_FORMAT(close_time, '%H:%i'))),
        '周日', JSON_ARRAY(JSON_OBJECT('start', TIME_FORMAT(open_time, '%H:%i'), 'end', TIME_FORMAT(close_time, '%H:%i')))
      )
      WHERE open_hours IS NULL AND open_time IS NOT NULL AND close_time IS NOT NULL
    `);

    // ===== 4. lfg_posts 已有数据按 type 推断 match_types =====
    // type 'sub' 默认 11 人制（凑人场景最常见），type 'war' 不推断
    await queryInterface.sequelize.query(`
      UPDATE lfg_posts
      SET match_types = JSON_ARRAY('11人制')
      WHERE match_types IS NULL AND type = 'sub'
    `);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('lfg_posts', 'match_types');
    await queryInterface.removeColumn('lfg_posts', 'fee');
    await queryInterface.removeColumn('courts', 'open_hours');
    await queryInterface.removeColumn('courts', 'surface_types');
    await queryInterface.removeColumn('courts', 'district');
  }
};