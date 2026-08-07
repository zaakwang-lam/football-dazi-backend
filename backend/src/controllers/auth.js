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

/** POST /api/user/login */
async function userLogin(req, res) {
  const { code, userInfo } = req.body;
  if (!code) throw new BizError(ErrorCode.PARAM_INVALID, '缺少 code');
  const sessionRes = await axios.get('https://api.weixin.qq.com/sns/jscode2session', { params: { appid: config.wechat.appid, secret: config.wechat.secret, js_code: code, grant_type: 'authorization_code' } });
  if (sessionRes.data.errcode) {
    logger.error(`微信登录失败: ${sessionRes.data.errmsg} (errcode=${sessionRes.data.errcode})`);
    return res.status(503).json(fail(503, `微信服务暂时不可用: ${sessionRes.data.errmsg || 'AppSecret 未配置'}`));
  }
  const { openid, unionid } = sessionRes.data;
  let user = await User.findOne({ where: { openid } });
  if (!user) {
    user = await User.create({ openid, unionid, nickname: userInfo?.nickName || userInfo?.nickname || '微信用户', avatarUrl: userInfo?.avatarUrl || '', gender: userInfo?.gender || 0 });
  } else if (userInfo) {
    if (userInfo.nickName || userInfo.nickname) user.nickname = userInfo.nickName || userInfo.nickname;
    // 仅当传入的是可持久化的 http(s) 头像时才覆盖，避免把临时本地路径写进库
    if (userInfo.avatarUrl && /^https?:\/\//i.test(userInfo.avatarUrl)) user.avatarUrl = userInfo.avatarUrl;
    if (userInfo.gender !== undefined) user.gender = userInfo.gender;
    await user.save();
  }
  const accessToken = generateAccessToken({ id: user.id, openid: user.openid });
  res.json(success({ accessToken, user: { id: user.id, nickname: user.nickname, avatarUrl: user.avatarUrl, phone: user.phone, role: user.role, roles: user.roles || [], courtId: user.courtId, registered: Array.isArray(user.roles) ? user.roles.length > 0 : false } }));
}

/** POST /api/user/register-role */
async function registerRole(req, res) {
  const { role, courtInfo } = req.body;
  const userId = req.user.id;
  if (!['user', 'court'].includes(role)) throw new BizError(ErrorCode.PARAM_INVALID, 'role 必须是 user 或 court');
  const user = await User.findByPk(userId);
  if (!user) throw new BizError(ErrorCode.NOT_FOUND, '用户不存在');
  const currentRoles = Array.isArray(user.roles) ? [...user.roles] : (user.role && user.role !== 'user' ? [user.role] : []);
  if (currentRoles.includes(role)) throw new BizError(ErrorCode.FORBIDDEN, `已注册过 ${role} 角色`);

  if (role === 'court') {
    if (!courtInfo || !courtInfo.name || !courtInfo.address || !courtInfo.type) throw new BizError(ErrorCode.PARAM_INVALID, '请填写球场名称、地址、类型');
    const ALLOWED_DISTRICTS = ['天河', '海珠', '越秀', '荔湾', '白云', '黄埔', '番禺', '花都', '南沙', '从化', '增城'];
    const ALLOWED_TYPES = ['11人制', '8人制', '7人制', '5人制', '3人制'];
    if (!ALLOWED_TYPES.includes(courtInfo.type)) throw new BizError(ErrorCode.PARAM_INVALID, '请选择正确的人制类型');
    if (!courtInfo.district || !ALLOWED_DISTRICTS.includes(courtInfo.district)) throw new BizError(ErrorCode.PARAM_INVALID, `请选择正确的行政区（${ALLOWED_DISTRICTS.join('/')}）`);
    if (courtInfo.longitude && courtInfo.latitude) {
      const lng = Number(courtInfo.longitude), lat = Number(courtInfo.latitude);
      if (isNaN(lng) || isNaN(lat) || lng < -180 || lng > 180 || lat < -90 || lat > 90) throw new BizError(ErrorCode.PARAM_INVALID, '经纬度格式不正确');
    }
    const ALLOWED_SURFACES = ['人工草地', '天然草地', '硬地'];
    if (courtInfo.surfaceTypes && !Array.isArray(courtInfo.surfaceTypes)) throw new BizError(ErrorCode.PARAM_INVALID, '场地性质必须是数组');
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
        name: courtInfo.name,
        ownerId: userId,
        type: courtInfo.type,
        address: courtInfo.address,
        district: courtInfo.district,
        longitude: courtInfo.longitude ? Number(courtInfo.longitude) : null,
        latitude: courtInfo.latitude ? Number(courtInfo.latitude) : null,
        phone: courtInfo.phone || '',
        price: Number(courtInfo.price) || 0,
        openTime: courtInfo.openTime || '08:00:00',
        closeTime: courtInfo.closeTime || '22:00:00',
        surfaceType: surfaceTypes[0],
        surfaceTypes,
        openHours,
        description: courtInfo.description || '',
        status: 2
      });
    } catch (err) {
      logger.error(`[registerRole:court] Court.create failed userId=${userId}: ${err.stack || err.message}`);
      const dbMessage = String(err.message || '数据库写入失败');
      if (/Data truncated for column 'type'|Incorrect .* value for column 'type'|ER_TRUNCATED_WRONG_VALUE_FOR_FIELD/i.test(dbMessage)) {
        throw new BizError(ErrorCode.PARAM_INVALID, `服务器数据库尚未同步新人制类型（${courtInfo.type}），请先执行数据库迁移后重试`);
      }
      if (/surface_types|open_hours|unknown column/i.test(dbMessage)) {
        throw new BizError(ErrorCode.PARAM_INVALID, '服务器数据库结构未完成同步，请更新后端数据库后重试');
      }
      if (/foreign key constraint|Cannot add or update a child row/i.test(dbMessage)) {
        throw new BizError(
          ErrorCode.PARAM_INVALID,
          '球场归属外键配置异常（owner_id 曾错误指向管理员表）。请重启后端以自动修复后重试；若仍失败请联系运维删除 courts.owner_id 外键。'
        );
      }
      throw new BizError(ErrorCode.PARAM_INVALID, `球场信息保存失败：${dbMessage.slice(0, 180)}`);
    }
    user.role = 'court';
    user.courtId = court.id;
    user.roles = [...new Set([...currentRoles, 'user', 'court'])];
    await user.save();
    logger.info(`球场方注册: userId=${userId}, courtId=${court.id}, name=${court.name}`);
    return res.json(success({ role: 'court', roles: user.roles, courtId: court.id, courtStatus: 'pending', message: '球场已提交，请等待审核' }, '注册成功'));
  }

  user.role = 'user';
  user.courtId = null;
  user.roles = [...new Set([...currentRoles, 'user'])];
  await user.save();
  return res.json(success({ role: 'user', roles: user.roles, courtId: null, message: '个人注册成功' }, '注册成功'));
}

async function getUserProfile(req, res) {
  const user = await User.findByPk(req.user.id);
  if (!user) throw new BizError(ErrorCode.NOT_FOUND, '用户不存在');
  let court = null;
  if (user.courtId) {
    const { Court } = require('../models');
    court = await Court.findByPk(user.courtId);
  }
  res.json(success({
    id: user.id,
    nickname: user.nickname,
    avatarUrl: user.avatarUrl,
    phone: user.phone,
    role: user.role,
    roles: user.roles || [],
    courtId: user.courtId,
    court: court && {
      id: court.id,
      name: court.name,
      address: court.address,
      district: court.district,
      type: court.type,
      surfaceType: court.surfaceType,
      surfaceTypes: court.surfaceTypes || [],
      status: court.status,
      openTime: court.openTime,
      closeTime: court.closeTime,
      openHours: court.openHours || null,
      createdAt: court.createdAt
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
  if (avatarUrl !== undefined && avatarUrl !== '') {
    // 只接受可持久化的 http(s) 地址，拒绝微信临时本地路径
    if (/^https?:\/\//i.test(String(avatarUrl))) {
      user.avatarUrl = avatarUrl;
    }
  }
  await user.save();
  res.json(success({
    id: user.id,
    nickname: user.nickname,
    avatarUrl: user.avatarUrl,
    phone: user.phone,
    role: user.role,
    roles: user.roles || [],
    courtId: user.courtId
  }));
}

/** POST /api/v1/user/avatar - 接收小程序压缩后的 base64 头像 */
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

async function getMyCourts(req, res) {
  const userId = req.user.id;
  const { Court } = require('../models');
  const courts = await Court.findAll({ where: { ownerId: userId, status: 1 }, order: [['created_at', 'DESC']] });
  res.json(success({
    list: courts.map(c => ({
      id: c.id, name: c.name, type: c.type, district: c.district, address: c.address,
      longitude: c.longitude ? parseFloat(c.longitude) : null,
      latitude: c.latitude ? parseFloat(c.latitude) : null,
      phone: c.phone, price: parseFloat(c.price),
      surfaceType: c.surfaceType, surfaceTypes: c.surfaceTypes || [],
      openTime: c.openTime, closeTime: c.closeTime, openHours: c.openHours || null,
      description: c.description, status: c.status, rating: parseFloat(c.rating), createdAt: c.createdAt
    })),
    total: courts.length
  }));
}

async function getMyTeams(req, res) {
  const userId = req.user.id;
  const { Team, TeamMember } = require('../models');
  const memberships = await TeamMember.findAll({
    where: { userId, status: 1 },
    include: [{ model: Team, as: 'team', attributes: ['id', 'name', 'logo', 'district', 'motto', 'memberCount', 'attendance', 'wins', 'draws', 'losses', 'recruitment', 'level', 'founded'] }]
  });
  const list = memberships.filter(m => m.team).map(m => ({
    id: m.team.id, name: m.team.name, logo: m.team.logo, district: m.team.district, motto: m.team.motto,
    memberCount: m.team.memberCount, attendance: m.team.attendance, wins: m.team.wins, draws: m.team.draws,
    losses: m.team.losses, recruitment: m.team.recruitment, level: m.team.level, founded: m.team.founded,
    role: m.role, joinedAt: m.createdAt
  }));
  res.json(success({ list, total: list.length }));
}

module.exports = { adminLogin, refreshToken, userLogin, registerRole, getUserProfile, updateUserProfile, uploadAvatar, getMyCourts, getMyTeams, getAdminProfile, logout };
