// src/controllers/team.js
const { Team, TeamMember, User, Checkin } = require('../models');
const { success, fail, BizError, ErrorCode } = require('../utils/response');

async function getTeamList(req, res) {
  const { district, page = 1, pageSize = 10 } = req.query;
  const where = { status: 1 };
  if (district) where.district = district;
  const { rows, count } = await Team.findAndCountAll({
    where, limit: Number(pageSize),
    offset: (Number(page) - 1) * Number(pageSize),
    order: [['attendance', 'DESC']]
  });
  res.json(success({
    list: rows.map(t => ({
      id: t.id, name: t.name, logo: t.logo, district: t.district, motto: t.motto,
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
  const { name, motto, district, description, recruitment } = req.body;
  if (!name || !district) throw new BizError(ErrorCode.PARAM_INVALID, '请填写球队名称和区域');
  const team = await Team.create({
    name, motto: motto || '', district,
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
      include: [{ model: User, as: 'user', attributes: ['id', 'nickname', 'avatarUrl'] }]
    }]
  });
  if (!team) throw new BizError(ErrorCode.NOT_FOUND, '球队不存在');
  res.json(success({
    id: team.id, name: team.name, logo: team.logo, district: team.district,
    motto: team.motto, description: team.description, level: team.level,
    memberCount: team.memberCount, attendance: team.attendance,
    wins: team.wins, draws: team.draws, losses: team.losses,
    recruitment: team.recruitment, founded: team.founded,
    announcement: team.announcement || '',
    memberList: (team.teamMembers || []).filter(m => Number(m.status) !== 0).map(m => ({
      id: m.userId, nickname: m.user?.nickname, avatarUrl: m.user?.avatarUrl, role: m.role
    }))
  }));
}

async function joinTeam(req, res) {
  const teamId = req.params.id;
  const userId = req.user.id;
  const team = await Team.findByPk(teamId);
  if (!team) throw new BizError(ErrorCode.NOT_FOUND, '球队不存在');
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

async function checkin(req, res) {
  const { id } = req.params;
  const userId = req.user.id;
  const { longitude, latitude } = req.body || {};
  const team = await Team.findByPk(id);
  if (!team) throw new BizError(ErrorCode.NOT_FOUND, '球队不存在');
  const member = await TeamMember.findOne({ where: { teamId: id, userId, status: 1 } });
  if (!member) throw new BizError(ErrorCode.FORBIDDEN, '不是球队成员');
  await Checkin.create({ teamId: id, userId, longitude, latitude, status: 'normal' });
  res.json(success(null, '打卡成功'));
}

/** PUT /api/v1/teams/:id/announcement 队长可编辑球队公告 */
async function updateAnnouncement(req, res) {
  const teamId = req.params.id;
  const userId = req.user.id;
  const announcement = req.body?.announcement != null ? String(req.body.announcement).slice(0, 500) : '';
  const team = await Team.findByPk(teamId);
  if (!team) throw new BizError(ErrorCode.NOT_FOUND, '球队不存在');
  const member = await TeamMember.findOne({ where: { teamId, userId, status: 1 } });
  if (!member || (member.role !== 'captain' && Number(team.captainId) !== Number(userId))) {
    throw new BizError(ErrorCode.FORBIDDEN, '仅队长可编辑公告');
  }
  team.announcement = announcement;
  await team.save();
  res.json(success({ id: team.id, announcement: team.announcement }, '公告已保存'));
}

module.exports = { getTeamList, createTeam, getTeamDetail, joinTeam, checkin, updateAnnouncement };
