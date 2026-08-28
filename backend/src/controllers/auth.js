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

const AUDIT_TEST_OPENID = 'audit_test_openid_dual_role';
const EXPECTED_WX_APPID = 'wxb3f1e355853399c8';

function describeWxLoginError(errcode, errmsg) {
  const code = Number(errcode);
  if (code === 40125 || code === 40001) {
    return '服务器 AppSecret 与新 AppID 不匹配，请把微信公众平台的 AppSecret 写入 WX_SECRET 并重启后端';
  }
  if (code === 40013) {
    return `服务器 AppID 无效，请确认 WX_APPID=${EXPECTED_WX_APPID}`;
  }
  if (code === 40029 || code === 40163) {
    return '登录凭证无效，请确认服务器 WX_APPID/WX_SECRET 已换成新主体小程序并重启';
  }
  if (code === 45011) return '登录过于频繁，请稍后再试';
  return `微信登录失败: ${errmsg || errcode}`;
}

async function getPublicMeta(req, res) {
  const appid = config.wechat.appid || '';
  res.json(success({
    ok: true,
    wxAppId: appid,
    expectedWxAppId: EXPECTED_WX_APPID,
    appidMatch: appid === EXPECTED_WX_APPID,
    wechatReady: !!(appid && config.wechat.secret),
    apiBase: process.env.PUBLIC_BASE_URL || 'https://footballdazi.cn'
  }));
}

function resolveIdentity(user) {
  // 身份唯一以 roles JSON 为准；禁止用 ENUM role 默认值冒充「已选个人方」
  let roles = [];
  try {
    const raw = user && user.roles;
    if (Array.isArray(raw)) roles = raw.filter((r) => r === 'user' || r === 'court');
  } catch (_) { roles = []; }
  let role = '';
  if (roles.length) {
    role = (user.role && roles.includes(user.role)) ? user.role : roles[0];
  }
  return { roles, role, registered: roles.length > 0 };
}

function normCourtName(s) {
  return String(s || '').replace(/\s+/g, '').replace(/（/g, '(').replace(/）/g, ')').toLowerCase();
}

async function tryClaimImportedCourt(userId, courtInfo, Court, Op) {
  const name = String(courtInfo.name || '').trim();
  if (!name) return null;
  const unowned = await Court.findAll({
    where: {
      status: { [Op.ne]: -1 },
      [Op.or]: [{ ownerId: null }, { ownerId: 0 }]
    }
  });
  if (!unowned.length) return null;
  const nameN = normCourtName(name);
  const district = String(courtInfo.district || '').trim();
  const phone = String(courtInfo.phone || '').replace(/\s+/g, '');

  let hit = unowned.find((c) => normCourtName(c.name) === nameN);
  if (!hit && district) {
    const sameDistrict = unowned.filter((c) => String(c.district || '').indexOf(district.replace(/\s+/g, '')) >= 0
      || district.indexOf(String(c.district || '')) >= 0);
    hit = sameDistrict.find((c) => normCourtName(c.name) === nameN)
      || sameDistrict.find((c) => {
        const n = normCourtName(c.name);
        return n && (nameN.indexOf(n) >= 0 || n.indexOf(nameN) >= 0);
      });
  }
  if (!hit && phone && phone.length >= 8) {
    hit = unowned.find((c) => String(c.phone || '').replace(/\s+/g, '') === phone && normCourtName(c.name) === nameN);
  }
  if (!hit) return null;

  const ALLOWED_TYPES = ['11人制', '8人制', '7人制', '5人制', '3人制'];
  const types = (Array.isArray(courtInfo.types) ? courtInfo.types : [])
    .filter((t) => ALLOWED_TYPES.includes(t));
  const ALLOWED_SURFACES = ['人工草地', '天然草地', '硬地'];
  const surfaceTypes = (courtInfo.surfaceTypes || []).filter((s) => ALLOWED_SURFACES.includes(s));

  hit.ownerId = userId;
  if (courtInfo.address) hit.address = courtInfo.address;
  if (district) hit.district = district;
  if (phone) hit.phone = phone;
  if (types.length) {
    hit.types = types;
    hit.type = types[0];
  }
  if (surfaceTypes.length) {
    hit.surfaceTypes = surfaceTypes;
    hit.surfaceType = surfaceTypes[0];
  }
  if (courtInfo.longitude) hit.longitude = Number(courtInfo.longitude);
  if (courtInfo.latitude) hit.latitude = Number(courtInfo.latitude);
  if (courtInfo.price != null && courtInfo.price !== '') hit.price = Number(courtInfo.price) || hit.price;
  if (courtInfo.openHours) hit.openHours = courtInfo.openHours;
  if (courtInfo.openTime) hit.openTime = courtInfo.openTime;
  if (courtInfo.closeTime) hit.closeTime = courtInfo.closeTime;
  if (courtInfo.description) hit.description = courtInfo.description;
  if (Number(hit.status) !== 1) hit.status = 1;
  await hit.save();
  logger.info(`[registerRole:court] 认领系统收录球场 id=${hit.id} name=${hit.name} userId=${userId}`);
  return hit;
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

/**
 * 审核/联调用测试登录（不走微信 code）
 * 仅当 TEST_LOGIN_ENABLED=1 且 secret 匹配时可用
 * 账号同时具备个人方 + 球场方
 */
async function userLoginTest(req, res) {
  const enabled = String(process.env.TEST_LOGIN_ENABLED || '') === '1';
  if (!enabled) {
    throw new BizError(ErrorCode.FORBIDDEN, '测试登录未开启');
  }
  const secret = process.env.TEST_LOGIN_SECRET || 'football-audit-2026';
  const bodySecret = req.body?.secret || req.body?.password || '';
  if (bodySecret !== secret) {
    throw new BizError(ErrorCode.PARAM_INVALID, '测试密钥错误');
  }

  let user = await User.findOne({ where: { openid: AUDIT_TEST_OPENID } });
  if (!user) {
    user = await User.create({
      openid: AUDIT_TEST_OPENID,
      nickname: '审核测试账号',
      phone: '13800000000',
      city: '广州',
      role: 'user',
      roles: ['user', 'court'],
      status: 1
    });
  }

  // 确保双角色 + 有营业中球场
  const roles = Array.isArray(user.roles) ? [...user.roles] : [];
  if (!roles.includes('user')) roles.push('user');
  if (!roles.includes('court')) roles.push('court');
  user.roles = roles;
  user.nickname = user.nickname || '审核测试账号';
  user.status = 1;

  const { Court } = require('../models');
  let court = await Court.findOne({ where: { ownerId: user.id } });
  if (!court) {
    court = await Court.create({
      name: '审核测试球场（天河）',
      ownerId: user.id,
      type: '5人制',
      types: ['11人制', '7人制', '5人制'],
      address: '广州市天河区测试路 1 号',
      district: '天河',
      phone: '020-88888888',
      price: 300,
      openTime: '08:00:00',
      closeTime: '22:00:00',
      surfaceType: '人工草地',
      surfaceTypes: ['人工草地'],
      description: '审核测试球场',
      status: 1,
      rating: 5.0
    });
  } else if (court.status !== 1) {
    court.status = 1;
    await court.save();
  }
  user.courtId = court.id;
  await user.save();

  const accessToken = generateAccessToken({ id: user.id, openid: user.openid });
  const identity = resolveIdentity(user);
  logger.info(`[login-test] 审核测试账号登录 userId=${user.id}`);
  res.json(success({
    accessToken,
    user: {
      id: user.id,
      nickname: user.nickname,
      avatarUrl: user.avatarUrl,
      phone: user.phone,
      role: identity.role || 'user',
      roles: identity.roles,
      courtId: user.courtId,
      registered: true,
      isTestAccount: true
    }
  }, '测试登录成功'));
}

async function userLogin(req, res) {
  const { code, userInfo } = req.body;
  if (!code) throw new BizError(ErrorCode.PARAM_INVALID, '缺少 code');
  const appid = config.wechat.appid;
  const secret = config.wechat.secret;
  if (!appid || !secret) {
    logger.error('[userLogin] WX_APPID 或 WX_SECRET 未配置');
    return res.status(503).json(fail(503, '服务器未配置微信 AppID/Secret'));
  }
  if (appid !== EXPECTED_WX_APPID) {
    logger.warn(`[userLogin] 服务器 AppID=${appid} 与新主体 ${EXPECTED_WX_APPID} 不一致`);
  }
  const sessionRes = await axios.get('https://api.weixin.qq.com/sns/jscode2session', {
    params: { appid, secret, js_code: code, grant_type: 'authorization_code' }
  });
  if (sessionRes.data.errcode) {
    const hint = describeWxLoginError(sessionRes.data.errcode, sessionRes.data.errmsg);
    logger.error(`[userLogin] appid=${appid} 微信登录失败: ${sessionRes.data.errmsg} (errcode=${sessionRes.data.errcode})`);
    return res.status(503).json(fail(503, hint));
  }
  const { openid, unionid } = sessionRes.data;
  let user = await User.findOne({ where: { openid } });
  if (!user) {
    user = await User.create({
      openid, unionid,
      nickname: userInfo?.nickName || userInfo?.nickname || '',
      avatarUrl: (userInfo?.avatarUrl && /^https?:\/\//i.test(userInfo.avatarUrl)) ? userInfo.avatarUrl : '',
      gender: userInfo?.gender || 0,
      role: null,   // 未选身份前不默认个人方
      roles: null
    });
    // 关键：创建后强制 JSON_SET 清空 roles（避免 INSERT NULL 写入 JSON 列失败）
    const { sequelize } = require('../models');
    await sequelize.query(
      "UPDATE `users` SET `roles` = JSON_SET(`roles`, '$', NULL), `role` = NULL WHERE `id` = ?",
      { replacements: [user.id] }
    );
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
    const { Court } = require('../models');
    const { Op } = require('sequelize');

    const claimed = await tryClaimImportedCourt(userId, courtInfo, Court, Op);
    if (claimed) {
      user.role = 'court';
      user.courtId = claimed.id;
      user.roles = [...new Set([...currentRoles, 'user', 'court'])];
      await user.save();
      const ready = Number(claimed.status) === 1;
      return res.json(success({
        role: 'court',
        roles: user.roles,
        courtId: claimed.id,
        claimed: true,
        courtStatus: ready ? 'approved' : 'pending',
        message: ready ? '已绑定系统收录球场，可直接管理球场与订单' : '已绑定球场，请等待审核'
      }, '进驻成功'));
    }

    const ALLOWED_DISTRICTS = ['天河区', '海珠区', '越秀区', '荔湾区', '白云区', '黄埔区', '番禺区', '花都区', '南沙区', '从化区', '增城区'];
    const ALLOWED_TYPES = ['11人制', '8人制', '7人制', '5人制', '3人制'];
    const types = (Array.isArray(courtInfo.types) ? courtInfo.types : [])
      .filter(t => ALLOWED_TYPES.includes(t));
    if (!types.length && courtInfo.type && ALLOWED_TYPES.includes(courtInfo.type)) types.push(courtInfo.type);
    if (!types.length) throw new BizError(ErrorCode.PARAM_INVALID, '请至少选择一种人制类型');
    if (!courtInfo.district || !ALLOWED_DISTRICTS.some(d => String(courtInfo.district).endsWith(d)))
      throw new BizError(ErrorCode.PARAM_INVALID, `请选择正确的行政区（${ALLOWED_DISTRICTS.join('/')}）`);
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
      images: court.images || [],
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
      images: Array.isArray(c.images) ? c.images : [],
      coverUrl: Array.isArray(c.images) && c.images[0] ? c.images[0] : '',
      openTime: c.openTime, closeTime: c.closeTime, openHours: c.openHours || null,
      description: c.description, status: c.status,
      rating: c.rating != null ? parseFloat(c.rating) : 0,
      createdAt: c.createdAt
    })),
    total: courts.length
  }));
}

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
    'description', 'surfaceType', 'surfaceTypes', 'openHours', 'longitude', 'latitude', 'images'];
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
    } else if (key === 'images') {
      const imgs = Array.isArray(body.images) ? body.images.filter(u => typeof u === 'string' && /^https?:\/\//i.test(u)).slice(0, 1) : [];
      court.images = imgs;
    } else court[key] = body[key];
  }

  if (court.status === 3) court.status = 2;
  await court.save();

  res.json(success({
    id: court.id,
    name: court.name,
    type: court.type,
    types: court.types || [court.type],
    images: court.images || [],
    phone: court.phone,
    price: court.price != null ? parseFloat(court.price) : 0,
    status: court.status,
    description: court.description
  }, '保存成功'));
}

async function uploadCourtImage(req, res) {
  const userId = Number(req.user.id);
  const courtId = Number(req.params.id);
  const { base64, mimeType = 'image/jpeg' } = req.body || {};
  if (!base64 || typeof base64 !== 'string') throw new BizError(ErrorCode.PARAM_INVALID, '缺少图片');
  if (base64.length > 4 * 1024 * 1024) throw new BizError(ErrorCode.PARAM_INVALID, '图片过大，请压缩后重试');

  const { Court } = require('../models');
  const court = await Court.findByPk(courtId);
  if (!court) throw new BizError(ErrorCode.NOT_FOUND, '球场不存在');
  if (Number(court.ownerId) !== userId) throw new BizError(ErrorCode.FORBIDDEN, '只能编辑自己的球场');

  const cleanBase64 = base64.replace(/^data:image\/[^;]+;base64,/, '');
  const buffer = Buffer.from(cleanBase64, 'base64');
  if (!buffer.length || buffer.length > 3 * 1024 * 1024) {
    throw new BizError(ErrorCode.PARAM_INVALID, '图片过大，请压缩后重试');
  }
  const ext = String(mimeType).toLowerCase().includes('png') ? 'png' : 'jpg';
  const uploadDir = path.join(__dirname, '../../uploads/courts');
  fs.mkdirSync(uploadDir, { recursive: true });
  const fileName = `${courtId}_${userId}_${Date.now()}.${ext}`;
  fs.writeFileSync(path.join(uploadDir, fileName), buffer);
  const publicBase = process.env.PUBLIC_BASE_URL || 'https://footballdazi.cn';
  const imageUrl = `${publicBase.replace(/\/$/, '')}/uploads/courts/${fileName}`;

  court.images = [imageUrl];
  await court.save();

  res.json(success({
    id: court.id,
    imageUrl,
    images: court.images
  }, '球场图片已更新'));
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
  adminLogin, refreshToken, userLogin, userLoginTest, registerRole, getUserProfile, updateUserProfile,
  uploadAvatar, uploadCourtImage, getMyCourts, updateMyCourt, getMyTeams, getAdminProfile, logout,
  getPublicMeta
};
