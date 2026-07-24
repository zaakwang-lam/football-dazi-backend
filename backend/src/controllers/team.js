// src/controllers/team.js
// 球队控制器
const { Team, TeamMember, User, Checkin } = require('../models');
const { success, fail, BizError, ErrorCode } = require('../utils/response');
const { Op } = require('sequelize');

/**
 * GET /api/v1/teams
 * 球队列表
 */
async function getTeamList(req, res) {
  const { district, page = 1, pageSize = 10 } = req.query;
  const where = { status: 1 };
  if (district) where.district = district;

  const { rows, count } = await Team.findAndCountAll({
    where,
    limit: Number(pageSize),
    offset: (Number(page) - 1) * Number(pageSize),
    order: [['attendance', 'DESC']]
  });

  res.json(success({
    list: rows.map(t => ({
      id: t.id,
      name: t.name,
      logo: t.logo,
      district: t.district,
      motto: t.motto,
      level: t.level,
      memberCount: t.memberCount,
      attendance: t.attendance,
      wins: t.wins,
      draws: t.draws,
      losses: t.losses,
      recruitment: t.recruitment,
      founded: t.founded
    })),
    total: count
  }));
}

/**
 * POST /api/v1/teams
 * 创建球队
 */
async function createTeam(req, res) {
  const userId = req.user.id;
  const { name, motto, district, description, recruitment } = req.body;

  if (!name || !district) {
    throw new BizError(ErrorCode.PARAM_INVALID, '请填写球队名称和区域');
  }

  const team = await Team.create({
    name,
    motto: motto || '',
    district,
    description: description || '',
    recruitment: recruitment !== false,
    captainId: userId,
    founded: new Date().toISOString().split('T')[0],
    memberCount: 1
  });

  // 创建者自动加入
  await TeamMember.create({
    teamId: team.id,
    userId,
    role: 'captain'
  });

  res.json(success({
    id: team.id,
    name: team.name
  }));
}

/**
 * GET /api/v1/teams/:id
 * 球队详情
 */
async function getTeamDetail(req, res) {
  const { id } = req.params;
  const team = await Team.findByPk(id, {
    include: [
      { model: TeamMember, as: 'teamMembers', include: [{ model: User, as: 'user', attributes: ['id', 'nickname', 'avatarUrl'] }] }
    ]
  });

  if (!team) {
    throw new BizError(ErrorCode.NOT_FOUND, '球队不存在');
  }

  res.json(success({
    id: team.id,
    name: team.name,
    logo: team.logo,
    district: team.district,
    motto: team.motto,
    description: team.description,
    level: team.level,
    memberCount: team.memberCount,
    attendance: team.attendance,
    wins: team.wins,
    draws: team.draws,
    losses: team.losses,
    recruitment: team.recruitment,
    founded: team.founded,
    memberList: team.teamMembers?.map(m => ({
      id: m.userId,
      nickname: m.user?.nickname,
      avatarUrl: m.user?.avatarUrl,
      role: m.role
    }))
  }));
}

/**
 * POST /api/v1/teams/:id/checkin
 * 考勤打卡
 */
async function checkin(req, res) {
  const { id } = req.params;
  const userId = req.user.id;
  const { longitude, latitude } = req.body;

  const team = await Team.findByPk(id);
  if (!team) {
    throw new BizError(ErrorCode.NOT_FOUND, '球队不存在');
  }

  // 验证是否是球队成员
  const member = await TeamMember.findOne({
    where: { teamId: id, userId, status: 1 }
  });
  if (!member) {
    throw new BizError(ErrorCode.FORBIDDEN, '不是球队成员');
  }

  await Checkin.create({
    teamId: id,
    userId,
    longitude,
    latitude,
    status: 'normal'
  });

  res.json(success(null, '打卡成功'));
}

module.exports = {
  getTeamList,
  createTeam,
  getTeamDetail,
  checkin
};