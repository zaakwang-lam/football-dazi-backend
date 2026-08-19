// src/controllers/team.js
const { Team, TeamMember, User, Checkin, Order, sequelize } = require('../models');
const { success, BizError, ErrorCode } = require('../utils/response');
const { Op } = require('sequelize');
const logger = require('../utils/logger');

async function getTeamList(req, res) {
  const { district, keyword, page = 1, pageSize = 10 } = req.query;
  const where = { status: 1 };
  if (district) where.district = district;
  if (keyword && String(keyword).trim()) {
    where.name = { [Op.like]: `%${String(keyword).trim()}%` };
  }
  const { rows, count } = await Team.findAndCountAll({
    where, limit: Number(pageSize),
    offset: (Number(page) - 1) * Number(pageSize),
    order: [['attendance', 'DESC']]
  });
  res.json(success({
    list: rows.map(t => ({
      id: t.id, name: t.name, logo: t.logo,
      province: t.province || '广东省', city: t.city || '广州市',
      district: t.district, motto: t.motto,
      matchType: t.matchType || '',
      level: t.level, memberCount: t.memberCount, attendance: t.attendance,
      wins: t.wins, draws: t.draws, losses: t.losses,
      recruitment: t.recruitment, founded: t.founded,
      announcement: t.announcement || ''
    })),
    total: count
  }));
}

async function createTeam(req, res) {
  const userId = req.user.id;
  const { name, motto, district, description, recruitment, province, city, matchType, captainPhone } = req.body;
  if (!name || !district) throw new BizError(ErrorCode.PARAM_INVALID, '请填写球队名称和区域');
  const team = await Team.create({
    name, motto: motto || '',
    province: province || '广东省',
    city: city || '广州市',
    district,
    matchType: matchType || '',
    captainPhone: captainPhone || '',
    description: description || '',
    recruitment: recruitment !== false,
    captainId: userId,
    founded: new Date().toISOString().split('T')[0],
    memberCount: 1
  });
  await TeamMember.create({ teamId: team.id, userId, role: 'captain', status: 1 });
  res.json(success({ id: team.id, name: team.name }));
}

async function getTeamDetail(req, res) {
  const team = await Team.findByPk(req.params.id, {
    include: [{
      model: TeamMember, as: 'teamMembers',
      include: [{ model: User, as: 'user', attributes: ['id', 'nickname', 'avatarUrl', 'phone'] }]
    }]
  });
  if (!team || Number(team.status) === 0) throw new BizError(ErrorCode.NOT_FOUND, '球队不存在');

  const userId = req.user && req.user.id ? Number(req.user.id) : null;
  let isMember = false;
  let isCaptain = false;
  if (userId) {
    isCaptain = Number(team.captainId) === userId;
    const m = (team.teamMembers || []).find(x => Number(x.userId) === userId && Number(x.status) === 1);
    isMember = !!m;
    if (m && m.role === 'captain') isCaptain = true;
  }

  res.json(success({
    id: team.id, name: team.name, logo: team.logo,
    province: team.province || '广东省', city: team.city || '广州市',
    district: team.district,
    matchType: team.matchType || '',
    captainPhone: team.captainPhone || '',
    motto: team.motto, description: team.description, level: team.level,
    memberCount: team.memberCount, attendance: team.attendance,
    wins: team.wins, draws: team.draws, losses: team.losses,
    recruitment: team.recruitment, founded: team.founded,
    announcement: team.announcement || '',
    captainId: team.captainId,
    isMember, isCaptain,
    memberList: (team.teamMembers || []).filter(m => Number(m.status) !== 0).map(m => ({
      id: m.userId, nickname: m.user?.nickname, avatarUrl: m.user?.avatarUrl, role: m.role,
      phone: m.user?.phone
    }))
  }));
}

async function joinTeam(req, res) {
  const teamId = req.params.id;
  const userId = req.user.id;
  const team = await Team.findByPk(teamId);
  if (!team || Number(team.status) === 0) throw new BizError(ErrorCode.NOT_FOUND, '球队不存在');
  if (team.recruitment === false) {
    throw new BizError(ErrorCode.FORBIDDEN, '该球队暂不招人');
  }
  const existed = await TeamMember.findOne({ where: { teamId, userId } });
  if (existed && Number(existed.status) === 1) {
    throw new BizError(ErrorCode.CONFLICT, '您已是球队成员');
  }
  if (existed) {
    existed.status = 1;
    if (!existed.role || existed.role === 'member') existed.role = 'player';
    await existed.save();
  } else {
    await TeamMember.create({ teamId, userId, role: 'player', status: 1 });
  }
  const count = await TeamMember.count({ where: { teamId, status: 1 } });
  await team.update({ memberCount: count });
  res.json(success({ teamId: Number(teamId), memberCount: count }, '加入成功'));
}

/** 队员退出球队（队长不可用此接口，需解散） */
async function leaveTeam(req, res) {
  const teamId = Number(req.params.id);
  const userId = Number(req.user.id);
  const team = await Team.findByPk(teamId);
  if (!team || Number(team.status) === 0) throw new BizError(ErrorCode.NOT_FOUND, '球队不存在');
  if (Number(team.captainId) === userId) {
    throw new BizError(ErrorCode.FORBIDDEN, '队长不能退出，请使用解散球队');
  }
  const member = await TeamMember.findOne({ where: { teamId, userId, status: 1 } });
  if (!member) throw new BizError(ErrorCode.NOT_FOUND, '您不是该球队成员');
  member.status = 0;
  await member.save();
  const count = await TeamMember.count({ where: { teamId, status: 1 } });
  await team.update({ memberCount: count });
  res.json(success({ teamId, memberCount: count }, '已退出球队'));
}

/** 队长编辑球队信息 */
async function updateTeam(req, res) {
  const teamId = req.params.id;
  const userId = req.user.id;
  const team = await Team.findByPk(teamId);
  if (!team || Number(team.status) === 0) throw new BizError(ErrorCode.NOT_FOUND, '球队不存在');
  if (Number(team.captainId) !== Number(userId)) {
    throw new BizError(ErrorCode.FORBIDDEN, '仅队长可编辑');
  }
  const body = req.body || {};
  if (body.name !== undefined) team.name = String(body.name).slice(0, 64);
  if (body.motto !== undefined) team.motto = String(body.motto).slice(0, 128);
  if (body.district !== undefined) team.district = String(body.district).slice(0, 32);
  if (body.province !== undefined) team.province = String(body.province).slice(0, 32);
  if (body.city !== undefined) team.city = String(body.city).slice(0, 32);
  if (body.matchType !== undefined) team.matchType = String(body.matchType).slice(0, 16);
  if (body.captainPhone !== undefined) team.captainPhone = String(body.captainPhone).slice(0, 20);
  if (body.description !== undefined) team.description = String(body.description);
  if (body.recruitment !== undefined) team.recruitment = !!body.recruitment;
  if (body.announcement !== undefined) team.announcement = String(body.announcement).slice(0, 500);
  await team.save();
  res.json(success({
    id: team.id, name: team.name, district: team.district,
    matchType: team.matchType, captainPhone: team.captainPhone
  }, '已保存'));
}

/** 队长解散球队 */
async function dissolveTeam(req, res) {
  const teamId = req.params.id;
  const userId = req.user.id;
  const team = await Team.findByPk(teamId);
  if (!team || Number(team.status) === 0) throw new BizError(ErrorCode.NOT_FOUND, '球队不存在');
  if (Number(team.captainId) !== Number(userId)) {
    throw new BizError(ErrorCode.FORBIDDEN, '仅队长可解散');
  }
  await sequelize.transaction(async (t) => {
    await TeamMember.update({ status: 0 }, { where: { teamId }, transaction: t });
    team.status = 0;
    await team.save({ transaction: t });
  });
  logger.info(`[dissolveTeam] user=${userId} team=${teamId}`);
  res.json(success({ id: Number(teamId) }, '球队已解散'));
}

async function checkin(req, res) {
  const { id } = req.params;
  const userId = req.user.id;
  const { longitude, latitude } = req.body || {};
  const team = await Team.findByPk(id);
  if (!team || Number(team.status) === 0) throw new BizError(ErrorCode.NOT_FOUND, '球队不存在');
  const member = await TeamMember.findOne({ where: { teamId: id, userId, status: 1 } });
  if (!member) throw new BizError(ErrorCode.FORBIDDEN, '不是球队成员');
  await Checkin.create({ teamId: id, userId, longitude, latitude, status: 'normal' });
  res.json(success(null, '打卡成功'));
}

async function updateAnnouncement(req, res) {
  const teamId = req.params.id;
  const userId = req.user.id;
  const announcement = req.body?.announcement != null ? String(req.body.announcement).slice(0, 500) : '';
  const team = await Team.findByPk(teamId);
  if (!team || Number(team.status) === 0) throw new BizError(ErrorCode.NOT_FOUND, '球队不存在');
  const member = await TeamMember.findOne({ where: { teamId, userId, status: 1 } });
  if (!member || (member.role !== 'captain' && Number(team.captainId) !== Number(userId))) {
    throw new BizError(ErrorCode.FORBIDDEN, '仅队长可编辑公告');
  }
  team.announcement = announcement;
  await team.save();
  res.json(success({ id: team.id, announcement: team.announcement }, '公告已保存'));
}

// ========== 运营后台 ==========
async function adminListTeams(req, res) {
  const { keyword, page = 1, pageSize = 20 } = req.query;
  const where = {};
  if (keyword && String(keyword).trim()) {
    const kw = `%${String(keyword).trim()}%`;
    where[Op.or] = [
      { name: { [Op.like]: kw } },
      { district: { [Op.like]: kw } },
      { city: { [Op.like]: kw } }
    ];
  }
  const offset = (Number(page) - 1) * Number(pageSize);
  const { rows, count } = await Team.findAndCountAll({
    where,
    order: [['id', 'DESC']],
    limit: Number(pageSize),
    offset
  });

  const captainIds = [...new Set(rows.map(t => t.captainId).filter(Boolean))];
  const captains = captainIds.length
    ? await User.findAll({ where: { id: captainIds }, attributes: ['id', 'nickname', 'phone'] })
    : [];
  const capMap = {};
  captains.forEach(u => { capMap[u.id] = u.toJSON(); });

  // 预订次数：队长作为下单用户的订单数（近似）
  const orderCounts = {};
  if (captainIds.length) {
    const orders = await Order.findAll({
      attributes: ['userId', [sequelize.fn('COUNT', sequelize.col('id')), 'cnt']],
      where: { userId: { [Op.in]: captainIds } },
      group: ['userId'],
      raw: true
    });
    orders.forEach(o => { orderCounts[o.userId] = Number(o.cnt) || 0; });
  }

  res.json(success({
    list: rows.map(t => {
      const cap = capMap[t.captainId] || {};
      return {
        id: t.id,
        name: t.name,
        province: t.province || '广东省',
        city: t.city || '广州市',
        district: t.district || '',
        matchType: t.matchType || '',
        memberCount: t.memberCount || 0,
        captainId: t.captainId,
        captainName: cap.nickname || '—',
        captainPhone: t.captainPhone || cap.phone || '',
        bookCount: orderCounts[t.captainId] || 0,
        recruitment: t.recruitment,
        status: t.status,
        founded: t.founded,
        motto: t.motto,
        description: t.description,
        createdAt: t.createdAt
      };
    }),
    total: count,
    page: Number(page),
    pageSize: Number(pageSize)
  }));
}

async function adminUpdateTeam(req, res) {
  const team = await Team.findByPk(req.params.id);
  if (!team) throw new BizError(ErrorCode.NOT_FOUND, '球队不存在');
  const body = req.body || {};
  if (body.name !== undefined) team.name = String(body.name).slice(0, 64);
  if (body.province !== undefined) team.province = String(body.province).slice(0, 32);
  if (body.city !== undefined) team.city = String(body.city).slice(0, 32);
  if (body.district !== undefined) team.district = String(body.district).slice(0, 32);
  if (body.matchType !== undefined) team.matchType = String(body.matchType).slice(0, 16);
  if (body.captainPhone !== undefined) team.captainPhone = String(body.captainPhone).slice(0, 20);
  if (body.motto !== undefined) team.motto = String(body.motto).slice(0, 128);
  if (body.description !== undefined) team.description = String(body.description);
  if (body.recruitment !== undefined) team.recruitment = !!body.recruitment;
  if (body.status !== undefined) team.status = Number(body.status) ? 1 : 0;
  if (body.memberCount !== undefined) team.memberCount = Number(body.memberCount) || team.memberCount;
  await team.save();
  res.json(success({ id: team.id }, '已保存'));
}

async function adminDeleteTeam(req, res) {
  const team = await Team.findByPk(req.params.id);
  if (!team) throw new BizError(ErrorCode.NOT_FOUND, '球队不存在');
  await sequelize.transaction(async (t) => {
    await TeamMember.destroy({ where: { teamId: team.id }, transaction: t });
    await team.destroy({ transaction: t });
  });
  res.json(success({ id: Number(req.params.id) }, '已删除'));
}

module.exports = {
  getTeamList, createTeam, getTeamDetail, joinTeam, leaveTeam, updateTeam, dissolveTeam,
  checkin, updateAnnouncement,
  adminListTeams, adminUpdateTeam, adminDeleteTeam
};
