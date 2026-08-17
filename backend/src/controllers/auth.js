// src/controllers/auth.js
// 鉴权控制器：登录、刷新 Token、登出
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { Admin, User } = require('../models');
const logger = require('../utils/logger');
const { success, fail, BizError, ErrorCode } = require('../utils/response');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../utils/jwt');

function resolveIdentity(user) {
  const roles = Array.isArray(user.roles) ? user.roles.filter(Boolean) : [];
  let role = '';
  if (roles.length) {
    role = (user.role && roles.includes(user.role)) ? user.role : roles[0];
  }
  return { roles, role, registered: roles.length > 0 };
}

async function adminLogin(req, res) {
  const { username, password } = req.body;
  if (!username || !password) throw new BizError(ErrorCode.PARAM_INVALID, '请输入用户名和密码');
  const admin = await Admin.findOne({ where: { username } });
  if (!admin) throw new BizError(ErrorCode.PARAM_INVALID, '用户名或密码错误');
  if (admin.status !== 1) throw new BizError(ErrorCode.FORBIDDEN, '账号已被禁用');
  if (!(await admin.verifyPassword(password))) throw new BizError(ErrorCode.PARAM_INVALID, '用户名或密码错误');
  admin.lastLoginAt = new Date(); await admin.save();
  const payload = { id: admin.id, username: admin.username, role: admin.role, courtId: admin.courtId };
  res.json(success({ accessToken: generateAccessToken(payload), refreshToken: generateRefreshToken(payload), admin: { id: admin.id, username: admin.username, role: admin.role, realName: admin.realName, courtId: admin.courtId } }));
}

async function refreshToken(req, res) {
  const { refreshToken: token } = req.body;
  if (!token) throw new BizError(ErrorCode.PARAM_INVALID, '缺少 refreshToken');
  const payload = verifyRefreshToken(token);
  if (!payload) throw new BizError(ErrorCode.UNAUTHORIZED, 'refreshToken 无效或已过期');
  const admin = await Admin.findByPk(payload.id);
  if (!admin || admin.status !== 1) throw new BizError(ErrorCode.FORBIDDEN, '账号已被禁用');
  res.json(success({ accessToken: generateAccessToken({ id: admin.id, username: admin.username, role: admin.role, courtId: admin.courtId }) }));
}

async function userLogin(req, res) {
  const { code, userInfo } = req.body;
  if (!code) throw new BizError(ErrorCode.PARAM_INVALID, '缺少 code');
  const sessionRes = await axios.get('https://api.weixin.qq.com/sns/jscode2session', {
    params: { appid: config.wechat.appid, secret: config.wechat.secret, js_code: code, grant_type: 'authorization_code' }
  });
  if (sessionRes.data.errcode) {
    logger.error(`微信登录失败: ${sessionRes.data.errmsg} (errcode=${sessionRes.data.errcode})`);
    return res.status(503).json(fail(503, `微信服务暂时不可用: ${sessionRes.data.errmsg || 'AppSecret 未配置'}`));
  }
  const { openid, unionid } = sessionRes.data;
  let user = await User.findOne({ where: { openid } });
  if (!user) {
    user = await User.create({
      openid, unionid,
      nickname: userInfo?.nickName || userInfo?.nickname || '微信用户',
      avatarUrl: (userInfo?.avatarUrl && /^https?:\/\//i.test(userInfo.avatarUrl)) ? userInfo.avatarUrl : '',
      gender: userInfo?.gender || 0,
      roles: null
    });
  } else if (userInfo) {
    if (userInfo.nickName || userInfo.nickname) user.nickname = userInfo.nickName || userInfo.nickname;
    if (userInfo.avatarUrl && /^https?:\/\//i.test(userInfo.avatarUrl)) user.avatarUrl = userInfo.avatarUrl;
    if (userInfo.gender !== undefined) user.gender = userInfo.gender;
    await user.save();
  }
  const accessToken = generateAccessToken({ id: user.id, openid: user.openid });
  const identity = resolveIdentity(user);
  res.json(success({
    accessToken,
    user: {
      id: user.id, nickname: user.nickname, avatarUrl: user.avatarUrl, phone: user.phone,
      role: identity.role, roles: identity.roles, courtId: user.courtId, registered: identity.registered
    }
  }));
}

async function registerRole(req, res) {
  const { role, courtInfo } = req.body;
  const userId = req.user.id;
  if (!['user', 'court'].includes(role)) throw new BizError(ErrorCode.PARAM_INVALID, 'role 必须是 user 或 court');
  const user = await User.findByPk(userId);
  if (!user) throw new BizError(ErrorCode.NOT_FOUND, '用户不存在');
  const currentRoles = Array.isArray(user.roles) ? [...user.roles].filter(Boolean) : [];
  if (currentRoles.includes(role)) throw new BizError(ErrorCode.FORBIDDEN, `已注册过 ${role} 角色`);

  if (role === 'court') {
    if (!courtInfo || !courtInfo.name || !courtInfo.address) throw new BizError(ErrorCode.PARAM_INVALID, '请填写球场名称、地址');
    const ALLOWED_DISTRICTS = ['天河', '海珠', '越秀', '荔湾', '白云', '黄埔', '番禺', '花都', '南沙', '从化', '增城'];
    const ALLOWED_TYPES = ['11人制', '8人制', '7人制', '5人制', '3人制'];
    const types = (Array.isArray(courtInfo.types) ? courtInfo.types : [])
      .filter(t => ALLOWED_TYPES.includes(t));
    if (!types.length && courtInfo.type && ALLOWED_TYPES.includes(courtInfo.type)) types.push(courtInfo.type);
    if (!types.length) throw new BizError(ErrorCode.PARAM_INVALID, '请至少选择一种人制类型');
    if (!courtInfo.district || !ALLOWED_DISTRICTS.includes(courtInfo.district)) throw new BizError(ErrorCode.PARAM_INVALID, `请选择正确的行政区（${ALLOWED_DISTRICTS.join('/')}）`);
    const ALLOWED_SURFACES = ['人工草地', '天然草地', '硬地'];
    const surfaceTypes = (courtInfo.surfaceTypes || []).filter(s => ALLOWED_SURFACES.includes(s));
    if (!surfaceTypes.length && courtInfo.surfaceType) surfaceTypes.push(courtInfo.surfaceType);
    if (!surfaceTypes.length) throw new BizError(ErrorCode.PARAM_INVALID, '请选择至少一种场地性质');

    let openHours = null;
    if (courtInfo.openHours && typeof courtInfo.openHours === 'object') {
      const ALLOWED_DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
      openHours = {};
      for (const day of ALLOWED_DAYS) {
        const slots = courtInfo.openHours[day];
        if (Array.isArray(slots) && slots.length) {
          const cleanSlots = slots.map(s => ({ start: String(s.start || '').slice(0, 5), end: String(s.end || '').slice(0, 5) })).filter(s => s.start && s.end);
          if (cleanSlots.length) openHours[day] = cleanSlots;
        }
      }
      if (!Object.keys(openHours).length) openHours = null;
    }

    const { Court } = require('../models');
    let court;
    try {
      court = await Court.create({
        name: courtInfo.name, ownerId: userId,
        type: types[0], types,
        address: courtInfo.address,
        district: courtInfo.district,
        longitude: courtInfo.longitude ? Number(courtInfo.longitude) : null,
        latitude: courtInfo.latitude ? Number(courtInfo.latitude) : null,
        phone: courtInfo.phone || '', price: Number(courtInfo.price) || 0,
        openTime: courtInfo.openTime || '08:00:00', closeTime: courtInfo.closeTime || '22:00:00',
        surfaceType: surfaceTypes[0], surfaceTypes, openHours,
        description: courtInfo.description || '', status: 2
      });
    } catch (err) {
      logger.error(`[registerRole:court] ${err.stack || err.message}`);
      throw new BizError(ErrorCode.PARAM_INVALID, `球场信息保存失败：${String(err.message || '').slice(0, 180)}`);
    }
    user.role = 'court';
    user.courtId = court.id;
    user.roles = [...new Set([...currentRoles, 'user', 'court'])];
    await user.save();
    return res.json(success({ role: 'court', roles: user.roles, courtId: court.id, courtStatus: 'pending', message: '球场已提交，请等待审核' }, '注册成功'));
  }

  user.role = 'user';
  user.roles = [...new Set([...currentRoles, 'user'])];
  await user.save();
  return res.json(success({ role: 'user', roles: user.roles, courtId: user.courtId || null, message: '个人注册成功' }, '注册成功'));
}

async function getUserProfile(req, res) {
  const user = await User.findByPk(req.user.id);
  if (!user) throw new BizError(ErrorCode.NOT_FOUND, '用户不存在');
  const identity = resolveIdentity(user);
  let court = null;
  if (user.courtId) {
    const { Court } = require('../models');
    court = await Court.findByPk(user.courtId);
  }
  res.json(success({
    id: user.id, nickname: user.nickname, avatarUrl: user.avatarUrl, phone: user.phone,
    role: identity.role, roles: identity.roles, registered: identity.registered, courtId: user.courtId,
    court: court && {
      id: court.id, name: court.name, address: court.address, district: court.district,
      type: court.type, types: court.types || (court.type ? [court.type] : []),
      surfaceType: court.surfaceType, surfaceTypes: court.surfaceTypes || [],
      status: court.status, phone: court.phone, price: court.price != null ? parseFloat(court.price) : null,
      openTime: court.openTime, closeTime: court.closeTime, openHours: court.openHours || null,
      description: court.description, createdAt: court.createdAt
    }
  }));
}

async function updateUserProfile(req, res) {
  const { nickname, avatarUrl } = req.body || {};
  const user = await User.findByPk(req.user.id);
  if (!user) throw new BizError(ErrorCode.NOT_FOUND, '用户不存在');
  if (nickname !== undefined && nickname !== null) {
    const cleanNick = String(nickname).trim().slice(0, 20);
    if (cleanNick) user.nickname = cleanNick;
  }
  if (avatarUrl !== undefined && avatarUrl !== '' && /^https?:\/\//i.test(String(avatarUrl))) {
    user.avatarUrl = avatarUrl;
  }
  await user.save();
  const identity = resolveIdentity(user);
  res.json(success({
    id: user.id, nickname: user.nickname, avatarUrl: user.avatarUrl, phone: user.phone,
    role: identity.role, roles: identity.roles, courtId: user.courtId
  }));
}

async function uploadAvatar(req, res) {
  const { base64, mimeType = 'image/jpeg' } = req.body || {};
  if (!base64 || typeof base64 !== 'string') throw new BizError(ErrorCode.PARAM_INVALID, '缺少头像图片');
  if (base64.length > 2 * 1024 * 1024) throw new BizError(ErrorCode.PARAM_INVALID, '头像文件过大，请重新选择');
  const user = await User.findByPk(req.user.id);
  if (!user) throw new BizError(ErrorCode.NOT_FOUND, '用户不存在');
  const cleanBase64 = base64.replace(/^data:image\/[^;]+;base64,/, '');
  const buffer = Buffer.from(cleanBase64, 'base64');
  if (!buffer.length || buffer.length > 1.5 * 1024 * 1024) throw new BizError(ErrorCode.PARAM_INVALID, '头像文件过大，请重新选择');
  const ext = String(mimeType).toLowerCase().includes('png') ? 'png' : 'jpg';
  const uploadDir = path.join(__dirname, '../../uploads/avatars');
  fs.mkdirSync(uploadDir, { recursive: true });
  const fileName = `${user.id}_${Date.now()}.${ext}`;
  fs.writeFileSync(path.join(uploadDir, fileName), buffer);
  const publicBase = process.env.PUBLIC_BASE_URL || 'https://footballdazi.cn';
  const avatarUrl = `${publicBase.replace(/\/$/, '')}/uploads/avatars/${fileName}`;
  user.avatarUrl = avatarUrl;
  await user.save();
  res.json(success({ id: user.id, avatarUrl, nickname: user.nickname }, '头像更新成功'));
}

async function getAdminProfile(req, res) { res.json(success(req.admin)); }
async function logout(req, res) { res.json(success(null, '已登出')); }

/** 我的球场：含审核中/营业中/已拒绝，便于再次编辑 */
async function getMyCourts(req, res) {
  const userId = req.user.id;
  const { Court } = require('../models');
  const { Op } = require('sequelize');
  const courts = await Court.findAll({
    where: { ownerId: userId, status: { [Op.ne]: -1 } },
    order: [['created_at', 'DESC']]
  });
  res.json(success({
    list: courts.map(c => ({
      id: c.id, name: c.name, type: c.type,
      types: Array.isArray(c.types) && c.types.length ? c.types : (c.type ? [c.type] : []),
      district: c.district, address: c.address,
      longitude: c.longitude ? parseFloat(c.longitude) : null,
      latitude: c.latitude ? parseFloat(c.latitude) : null,
      phone: c.phone, price: c.price != null ? parseFloat(c.price) : 0,
      surfaceType: c.surfaceType, surfaceTypes: c.surfaceTypes || [],
      openTime: c.openTime, closeTime: c.closeTime, openHours: c.openHours || null,
      description: c.description, status: c.status,
      rating: c.rating != null ? parseFloat(c.rating) : 0,
      createdAt: c.createdAt
    })),
    total: courts.length
  }));
}

/**
 * PUT /api/user/me/courts/:id
 * 球场方再次编辑自己的球场（费用、电话、简介、人制多选等）
 */
async function updateMyCourt(req, res) {
  const userId = Number(req.user.id);
  const courtId = Number(req.params.id);
  const { Court } = require('../models');
  const court = await Court.findByPk(courtId);
  if (!court) throw new BizError(ErrorCode.NOT_FOUND, '球场不存在');
  if (Number(court.ownerId) !== userId) throw new BizError(ErrorCode.FORBIDDEN, '只能编辑自己的球场');

  const body = req.body || {};
  const ALLOWED_TYPES = ['11人制', '8人制', '7人制', '5人制', '3人制'];
  const allowed = ['name', 'address', 'district', 'type', 'types', 'phone', 'price', 'openTime', 'closeTime',
    'description', 'surfaceType', 'surfaceTypes', 'openHours', 'longitude', 'latitude'];
  for (const key of allowed) {
    if (body[key] === undefined) continue;
    if (key === 'price') court.price = Number(body.price) || 0;
    else if (key === 'longitude' || key === 'latitude') court[key] = body[key] != null && body[key] !== '' ? Number(body[key]) : null;
    else if (key === 'types') {
      const types = (Array.isArray(body.types) ? body.types : []).filter(t => ALLOWED_TYPES.includes(t));
      if (types.length) {
        court.types = types;
        court.type = types[0];
      }
    } else court[key] = body[key];
  }

  // 改营业中内容后保持营业；审核中/拒绝后修改可再次进审核
  if (court.status === 3) court.status = 2;
  await court.save();

  res.json(success({
    id: court.id,
    name: court.name,
    type: court.type,
    types: court.types || [court.type],
    phone: court.phone,
    price: court.price != null ? parseFloat(court.price) : 0,
    status: court.status,
    description: court.description
  }, '保存成功'));
}

async function getMyTeams(req, res) {
  const userId = req.user.id;
  const { Team, TeamMember } = require('../models');
  const memberships = await TeamMember.findAll({
    where: { userId, status: 1 },
    include: [{ model: Team, as: 'team', attributes: ['id', 'name', 'logo', 'district', 'motto', 'memberCount', 'attendance', 'wins', 'draws', 'losses', 'recruitment', 'level', 'founded', 'announcement'] }]
  });
  const list = memberships.filter(m => m.team).map(m => ({
    id: m.team.id, name: m.team.name, logo: m.team.logo, district: m.team.district, motto: m.team.motto,
    memberCount: m.team.memberCount, attendance: m.team.attendance, wins: m.team.wins, draws: m.team.draws,
    losses: m.team.losses, recruitment: m.team.recruitment, level: m.team.level, founded: m.team.founded,
    announcement: m.team.announcement || '',
    role: m.role, joinedAt: m.createdAt
  }));
  res.json(success({ list, total: list.length }));
}

module.exports = {
  adminLogin, refreshToken, userLogin, registerRole, getUserProfile, updateUserProfile,
  uploadAvatar, getMyCourts, updateMyCourt, getMyTeams, getAdminProfile, logout
};
