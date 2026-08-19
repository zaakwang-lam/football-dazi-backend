// src/controllers/lfg.js
const { LfgPost, LfgJoin, User, sequelize } = require('../models');
const { success, BizError, ErrorCode } = require('../utils/response');
const { Op } = require('sequelize');
const logger = require('../utils/logger');

async function getLfgList(req, res) {
  const { type, page = 1, pageSize = 10 } = req.query;

  const where = { status: { [Op.in]: ['open', 'full'] } };
  if (type && type !== 'all') where.type = type;

  const { rows, count } = await LfgPost.findAndCountAll({
    where,
    include: [
      { model: User, as: 'publisher', attributes: ['id', 'nickname', 'avatarUrl'], required: false }
    ],
    order: [['created_at', 'DESC']],
    limit: Number(pageSize),
    offset: (Number(page) - 1) * Number(pageSize)
  });

  res.json(success({
    list: rows.map(l => ({
      id: l.id,
      type: l.type,
      matchTypes: l.matchTypes || [],
      title: l.title || `${l.location || ''} ${l.type || ''}`.trim(),
      location: l.location,
      fee: l.fee !== null && l.fee !== undefined ? parseFloat(l.fee) : null,
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

async function publishLfg(req, res) {
  const userId = req.user.id;
  const { type, title, location, playTime, needCount, level, contact, description, teamId, fee, matchTypes } = req.body;

  if (!type || !location || !playTime) {
    throw new BizError(ErrorCode.PARAM_INVALID, '请填写完整信息');
  }
  // 联系方式强制手机号
  const phone = String(contact || '').trim();
  if (!/^1\d{10}$/.test(phone)) {
    throw new BizError(ErrorCode.PARAM_INVALID, '请填写11位手机号码作为联系方式');
  }

  // 仅球队成员（队长或队员）可发起凑人/约战
  const tid = Number(teamId);
  if (!tid || Number.isNaN(tid)) {
    throw new BizError(ErrorCode.FORBIDDEN, '仅球队成员可发起，请先加入球队并选择球队');
  }
  const { TeamMember, Team } = require('../models');
  const membership = await TeamMember.findOne({
    where: { teamId: tid, userId, status: 1 }
  });
  if (!membership) {
    throw new BizError(ErrorCode.FORBIDDEN, '您不是该球队成员，无法发起');
  }
  const team = await Team.findByPk(tid);
  if (!team || team.status === 0) {
    throw new BizError(ErrorCode.NOT_FOUND, '球队不存在或已解散');
  }
  // 标题优先使用球队正式名称
  const teamName = team.name || '';
  const finalTitle = title && String(title).trim()
    ? String(title).trim()
    : `${teamName} ${type === 'war' ? '约战' : '凑人'}`.trim();

  const ALLOWED_MATCH_TYPES = ['11人制', '8人制', '7人制', '5人制', '3人制'];
  let normalizedMatchTypes = null;
  if (matchTypes && Array.isArray(matchTypes) && matchTypes.length > 0) {
    normalizedMatchTypes = matchTypes.filter(t => ALLOWED_MATCH_TYPES.includes(t));
    if (normalizedMatchTypes.length === 0) {
      throw new BizError(ErrorCode.PARAM_INVALID, '人制选择无效');
    }
  }

  const post = await LfgPost.create({
    userId,
    teamId: tid,
    type,
    matchTypes: normalizedMatchTypes,
    title: finalTitle,
    location,
    fee: fee !== undefined && fee !== null && fee !== '' ? Number(fee) : null,
    playTime,
    needCount: Number(needCount) || 1,
    level: level || '业余',
    contact: phone,
    description
  });

  res.json(success({
    id: post.id,
    createdAt: post.createdAt
  }));
}

async function joinLfg(req, res) {
  const lfgId = Number(req.params.id);
  const userId = Number(req.user && req.user.id);

  if (!lfgId || Number.isNaN(lfgId)) {
    throw new BizError(ErrorCode.PARAM_INVALID, '无效的组队 ID');
  }
  if (!userId || Number.isNaN(userId)) {
    throw new BizError(ErrorCode.UNAUTHORIZED, '请先登录');
  }

  try {
    await sequelize.transaction(async (t) => {
      const post = await LfgPost.findByPk(lfgId, {
        transaction: t,
        lock: t.LOCK.UPDATE
      });
      if (!post) throw new BizError(ErrorCode.NOT_FOUND, '信息不存在');
      if (post.status !== 'open') {
        throw new BizError(
          ErrorCode.CONFLICT,
          post.status === 'full' ? '该组队已满员' : '该信息已关闭'
        );
      }
      if (Number(post.userId) === userId) {
        throw new BizError(ErrorCode.FORBIDDEN, '不能加入自己发起的组队');
      }

      const existed = await LfgJoin.findOne({ where: { lfgId, userId }, transaction: t });
      if (existed) throw new BizError(ErrorCode.CONFLICT, '您已报名');

      const user = await User.findByPk(userId, { transaction: t });
      if (!user) throw new BizError(ErrorCode.UNAUTHORIZED, '用户不存在，请重新登录');

      await LfgJoin.create({ lfgId, userId, status: 'pending' }, { transaction: t });

      const nextJoined = Math.max(0, Number(post.joinedCount) || 0) + 1;
      post.joinedCount = nextJoined;
      if (nextJoined >= (Number(post.needCount) || 1)) post.status = 'full';
      await post.save({ transaction: t });
    });
  } catch (err) {
    if (err && err.isBizError) throw err;
    logger.error(`[joinLfg] lfgId=${lfgId} userId=${userId}: ${err.stack || err.message}`);
    const msg = String(err.message || '');
    if (/foreign key constraint|Cannot add or update a child row/i.test(msg)) {
      throw new BizError(ErrorCode.PARAM_INVALID, '报名关联失败，请确认组队仍存在后重试');
    }
    if (/Duplicate entry|ER_DUP_ENTRY/i.test(msg)) {
      throw new BizError(ErrorCode.CONFLICT, '您已报名');
    }
    throw new BizError(ErrorCode.PARAM_INVALID, `报名失败：${msg.slice(0, 120)}`);
  }

  res.json(success(null, '报名成功'));
}

async function quitLfg(req, res) {
  const lfgId = Number(req.params.id);
  const userId = Number(req.user && req.user.id);

  if (!lfgId || Number.isNaN(lfgId)) {
    throw new BizError(ErrorCode.PARAM_INVALID, '无效的组队 ID');
  }

  const post = await LfgPost.findByPk(lfgId);
  if (!post) throw new BizError(ErrorCode.NOT_FOUND, '信息不存在');
  if (!['open', 'full'].includes(post.status)) {
    throw new BizError(ErrorCode.CONFLICT, '该信息已关闭，不可退出');
  }
  if (Number(post.userId) === userId) {
    throw new BizError(ErrorCode.FORBIDDEN, '您是发起者，不能退出，请使用删除');
  }

  const join = await LfgJoin.findOne({ where: { lfgId, userId } });
  if (!join) throw new BizError(ErrorCode.NOT_FOUND, '您未报名该组队');

  await sequelize.transaction(async (t) => {
    await join.destroy({ transaction: t });
    post.joinedCount = Math.max(0, (Number(post.joinedCount) || 0) - 1);
    if (post.status === 'full' && post.joinedCount < (Number(post.needCount) || 1)) {
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

/** 发起人删除自己的组队（关闭并移除报名记录） */
async function deleteLfg(req, res) {
  const lfgId = Number(req.params.id);
  const userId = Number(req.user && req.user.id);
  if (!lfgId || Number.isNaN(lfgId)) {
    throw new BizError(ErrorCode.PARAM_INVALID, '无效的组队 ID');
  }

  const post = await LfgPost.findByPk(lfgId);
  if (!post) throw new BizError(ErrorCode.NOT_FOUND, '信息不存在');
  if (Number(post.userId) !== userId) {
    throw new BizError(ErrorCode.FORBIDDEN, '只能删除自己发起的组队');
  }

  await sequelize.transaction(async (t) => {
    await LfgJoin.destroy({ where: { lfgId }, transaction: t });
    await post.destroy({ transaction: t });
  });

  logger.info(`[deleteLfg] user=${userId} deleted lfg=${lfgId}`);
  res.json(success({ id: lfgId }, '已删除'));
}

async function getMyLfgPosts(req, res) {
  const userId = req.user.id;
  const type = req.query.type || 'all';

  let posts = [];

  if (type === 'created' || type === 'all') {
    const createdPosts = await LfgPost.findAll({
      where: { userId },
      include: [
        { model: User, as: 'publisher', attributes: ['id', 'nickname', 'avatarUrl'], required: false }
      ],
      order: [['created_at', 'DESC']],
      limit: 100
    });
    posts = posts.concat(createdPosts.map(p => ({ ...p.toJSON(), _role: 'creator' })));
  }

  if (type === 'joined' || type === 'all') {
    const joins = await LfgJoin.findAll({
      where: {
        userId,
        status: { [Op.in]: ['pending', 'confirmed'] }
      },
      include: [{
        model: LfgPost,
        as: 'post',
        required: false,
        include: [
          { model: User, as: 'publisher', attributes: ['id', 'nickname', 'avatarUrl'], required: false }
        ]
      }],
      order: [['created_at', 'DESC']],
      limit: 100
    });
    const seen = new Set(posts.map(p => p.id));
    const joinedPosts = joins
      .filter(j => j.post && !seen.has(j.post.id))
      .map(j => ({ ...j.post.toJSON(), _role: 'joiner' }));
    posts = posts.concat(joinedPosts);
  }

  const list = posts.map(p => ({
    id: p.id,
    type: p.type,
    title: p.title,
    matchTypes: p.matchTypes || [],
    location: p.location,
    fee: p.fee !== null && p.fee !== undefined ? parseFloat(p.fee) : null,
    playTime: p.playTime,
    needCount: p.needCount,
    joinedCount: p.joinedCount || 0,
    level: p.level,
    contact: p.contact,
    description: p.description,
    status: p.status,
    publisher: p.publisher,
    role: p._role,
    createdAt: p.createdAt
  }));

  res.json(success({ list, total: list.length }));
}

async function getLfgDetail(req, res) {
  const id = Number(req.params.id);
  if (!id || Number.isNaN(id)) {
    throw new BizError(ErrorCode.PARAM_INVALID, '无效的 ID');
  }

  let post;
  try {
    post = await LfgPost.findByPk(id, {
      include: [
        { model: User, as: 'publisher', attributes: ['id', 'nickname', 'avatarUrl'], required: false }
      ]
    });
  } catch (err) {
    logger.error(`[getLfgDetail] load post id=${id}: ${err.message}`);
    throw new BizError(ErrorCode.PARAM_INVALID, `加载失败：${String(err.message).slice(0, 80)}`);
  }

  if (!post) throw new BizError(ErrorCode.NOT_FOUND, '信息不存在或已删除');

  let joins = [];
  try {
    const rows = await LfgJoin.findAll({
      where: { lfgId: id },
      attributes: ['id', 'userId', 'status'],
      order: [['id', 'ASC']],
      limit: 200
    });
    joins = rows.map(j => ({
      id: j.id,
      userId: j.userId,
      status: j.status || 'pending'
    }));
  } catch (err) {
    logger.warn(`[getLfgDetail] joins skip id=${id}: ${err.message}`);
    joins = [];
  }

  res.json(success({
    id: post.id,
    type: post.type,
    matchTypes: post.matchTypes || [],
    title: post.title,
    location: post.location,
    fee: post.fee !== null && post.fee !== undefined ? parseFloat(post.fee) : null,
    playTime: post.playTime,
    needCount: post.needCount,
    joinedCount: post.joinedCount,
    level: post.level,
    contact: post.contact,
    description: post.description,
    status: post.status,
    publisher: post.publisher || null,
    joins,
    joinCount: joins.length,
    createdAt: post.createdAt
  }));
}

module.exports = {
  getLfgList,
  getLfgDetail,
  publishLfg,
  joinLfg,
  quitLfg,
  deleteLfg,
  getMyLfgPosts
};
