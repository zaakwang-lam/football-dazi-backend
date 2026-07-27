// src/scripts/auto-expire.js
// 自动失效任务：每天 0 点扫描 lfg_posts，playTime < 今天 → status='finished'
// 比赛日结束后的凑人/约战信息自动从列表中消失
const { LfgPost } = require('../models');
const logger = require('../utils/logger');
const { Op } = require('sequelize');

/**
 * 扫描失效记录
 * @returns {Promise<{updated: number}>}
 */
async function expireLfgPosts() {
  // 今天 00:00:00
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // playTime < today 且 status='open'/'full' → 改为 finished
  const [updatedCount] = await LfgPost.update(
    { status: 'finished' },
    {
      where: {
        playTime: { [Op.lt]: today },
        status: { [Op.in]: ['open', 'full'] }
      }
    }
  );

  logger.info(`[auto-expire] 失效扫描完成: ${updatedCount} 条 LfgPost 已标记 finished`);
  return { updated: updatedCount };
}

/**
 * 计算距离下一次 0 点的毫秒数
 */
function msUntilNextMidnight() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);  // 明天 0 点
  return next.getTime() - now.getTime();
}

/**
 * 启动定时任务
 * 第一次执行：启动后 5 秒（快速生效）
 * 之后：每天 0 点执行
 */
function startAutoExpireCron() {
  // 启动后 5 秒先跑一次
  setTimeout(() => {
    expireLfgPosts().catch(err => {
      logger.error('[auto-expire] 首次扫描失败:', err.message);
    });
  }, 5000);

  // 计算到下一个 0 点的延迟，启动 setTimeout
  const scheduleNext = () => {
    const delay = msUntilNextMidnight();
    logger.info(`[auto-expire] 下次失效扫描: ${new Date(Date.now() + delay).toLocaleString('zh-CN')}`);

    setTimeout(async () => {
      try {
        await expireLfgPosts();
      } catch (err) {
        logger.error('[auto-expire] 定时扫描失败:', err.message);
      }
      // 递归调度下一天
      scheduleNext();
    }, delay);
  };

  scheduleNext();
}

module.exports = { expireLfgPosts, startAutoExpireCron };