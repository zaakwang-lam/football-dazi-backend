// src/controllers/lfg.js
// 凑人控制器
const { LfgPost, LfgJoin, User, Team } = require('../models');
const { success, fail, BizError, ErrorCode } = require('../utils/response');
const { Op } = require('sequelize');

/**
 * GET /api/v1/lfg/list
 * 凑人列表
 */
async function getLfgList(req, res) {
  const { type, district, page = 1, pageSize = 10 } = req.query;

  const where = { status: { [Op.in]: ['open', 'full'] } };  // 不显示 closed/finished
  if (type && type !== 'all') where.type = type;  // 兼容 'sub' / 'war'

  const { rows, count } = await LfgPost.findAndCountAll({
    where,
    include: [
      { model: User, as: 'publisher', attributes: ['id', 'nickname', 'avatarUrl'] }
    ],
    order: [['created_at', 'DESC']],
    limit: Number(pageSize),
    offset: (Number(page) - 1) * Number(pageSize)
  });

  res.json(success({
    list: rows.map(l => ({
      id: l.id,
      type: l.type,
      matchTypes: l.matchTypes || [],  // 人制多选（2026-07-28 新增）
      title: l.title || `${l.location} ${l.type}`,
      location: l.location,
      fee: l.fee !== null && l.fee !== undefined ? parseFloat(l.fee) : null,  // 人均费用（2026-07-28 新增）
      playTime: l.playTime,
      needCount: l.needCount,
      joinedCount: l.joinedCount,
      level: l.level,
      contact: l.contact,
      description: l.description,
      status: l.status,
      publisher: l.publisher,
      createdAt: l.createdAt
    })),
    total: count
  }));
}

/**
 * POST /api/v1/lfg
 * 发布凑人
 */
async function publishLfg(req, res) {
  const userId = req.user.id;
  const { type, title, location, playTime, needCount, level, contact, description, teamId, fee, matchTypes } = req.body;

  if (!type || !location || !playTime) {
    throw new BizError(ErrorCode.PARAM_INVALID, '请填写完整信息');
  }

  // 人制多选校验（2026-07-28 新增）
  const ALLOWED_MATCH_TYPES = ['11人制', '7人制', '5人制'];
  let normalizedMatchTypes = null;
  if (matchTypes && Array.isArray(matchTypes) && matchTypes.length > 0) {
    normalizedMatchTypes = matchTypes.filter(t => ALLOWED_MATCH_TYPES.includes(t));
    if (normalizedMatchTypes.length === 0) {
      throw new BizError(ErrorCode.PARAM_INVALID, '人制必须在 11人制/7人制/5人制 中选择');
    }
  }

  const post = await LfgPost.create({
    userId,
    teamId: teamId || null,
    type,
    matchTypes: normalizedMatchTypes,  // 人制多选（2026-07-28 新增）
    title,
    location,
    fee: fee !== undefined && fee !== null && fee !== '' ? Number(fee) : null,  // 人均费用（2026-07-28 新增）
    playTime,
    needCount: Number(needCount) || 1,
    level: level || '业余',
    contact,
    description
  });

  res.json(success({
    id: post.id,
    createdAt: post.createdAt
  }));
}

/**
 * POST /api/v1/lfg/:id/join
 * 报名加入
 */
async function joinLfg(req, res) {
  const { id } = req.params;
  const userId = req.user.id;

  const post = await LfgPost.findByPk(id);
  if (!post) {
    throw new BizError(ErrorCode.NOT_FOUND, '信息不存在');
  }
  if (post.status !== 'open') {
    throw new BizError(ErrorCode.CONFLICT, '该信息已关闭');
  }

  // 检查是否已报名
  const existed = await LfgJoin.findOne({ where: { lfgId: id, userId } });
  if (existed) {
    throw new BizError(ErrorCode.CONFLICT, '您已报名');
  }

  await LfgJoin.create({
    lfgId: id,
    userId,
    status: 'pending'
  });

  // 更新报名人数
  post.joinedCount += 1;
  if (post.joinedCount >= post.needCount) {
    post.status = 'full';
  }
  await post.save();

  res.json(success(null, '报名成功'));
}

/**
 * POST /api/v1/lfg/:id/quit
 * 退出组队（2026-07-28 新增）
 * 规则:
 *   - 仅发起者本人可退出自己已加入的组队
 *   - 仅状态为 open / full 可退出（closed/finished 不可退出）
 *   - 退出后 joinedCount -1，status 回到 open
 */
async function quitLfg(req, res) {
  const { id } = req.params;
  const userId = req.user.id;

  const post = await LfgPost.findByPk(id);
  if (!post) {
    throw new BizError(ErrorCode.NOT_FOUND, '信息不存在');
  }

  if (!['open', 'full'].includes(post.status)) {
    throw new BizError(ErrorCode.CONFLICT, '该信息已关闭，不可退出');
  }

  // 不能退出自己发起的组队（创建者）
  if (post.userId === userId) {
    throw new BizError(ErrorCode.FORBIDDEN, '您是发起者，不能退出');
  }

  // 查找报名记录
  const join = await LfgJoin.findOne({ where: { lfgId: id, userId } });
  if (!join) {
    throw new BizError(ErrorCode.NOT_FOUND, '您未报名该组队');
  }

  // 事务：删 join + 更新计数 + status 回退
  const { sequelize } = require('../models');
  await sequelize.transaction(async (t) => {
    await join.destroy({ transaction: t });
    post.joinedCount = Math.max(0, post.joinedCount - 1);
    if (post.status === 'full' && post.joinedCount < post.needCount) {
      post.status = 'open';
    }
    await post.save({ transaction: t });
  });

  res.json(success({
    id: post.id,
    joinedCount: post.joinedCount,
    status: post.status
  }, '退出成功'));
}

/**
 * GET /api/v1/lfg/:id
 * 凑人/约战详情
 */
async function getLfgDetail(req, res) {
  const { id } = req.params;

  const post = await LfgPost.findByPk(id, {
    include: [
      { model: User, as: 'publisher', attributes: ['id', 'nickname', 'avatarUrl'] },
      { model: LfgJoin, as: 'joins', attributes: ['id', 'userId', 'status'] }
    ]
  });

  if (!post) {
    throw new BizError(ErrorCode.NOT_FOUND, '信息不存在');
  }

  res.json(success({
    id: post.id,
    type: post.type,
    matchTypes: post.matchTypes || [],  // 人制多选（2026-07-28 新增）
    title: post.title,
    location: post.location,
    fee: post.fee !== null && post.fee !== undefined ? parseFloat(post.fee) : null,  // 人均费用（2026-07-28 新增）
    playTime: post.playTime,
    needCount: post.needCount,
    joinedCount: post.joinedCount,
    level: post.level,
    contact: post.contact,
    description: post.description,
    status: post.status,
    publisher: post.publisher,
    joinCount: post.joins ? post.joins.length : 0,
    createdAt: post.createdAt
  }));
}

module.exports = {
  getLfgList,
  getLfgDetail,
  publishLfg,
  joinLfg,
  quitLfg
};