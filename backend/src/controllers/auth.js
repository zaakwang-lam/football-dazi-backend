// src/controllers/auth.js
// 鉴权控制器：登录、刷新 Token、登出
const axios = require('axios');
const config = require('../config');
const { Admin, User } = require('../models');
const logger = require('../utils/logger');
const { success, fail, BizError, ErrorCode } = require('../utils/response');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../utils/jwt');

/**
 * POST /api/admin/login
 * 管理员账号密码登录
 */
async function adminLogin(req, res) {
  const { username, password } = req.body;
  if (!username || !password) {
    throw new BizError(ErrorCode.PARAM_INVALID, '请输入用户名和密码');
  }

  const admin = await Admin.findOne({ where: { username } });
  if (!admin) {
    throw new BizError(ErrorCode.PARAM_INVALID, '用户名或密码错误');
  }
  if (admin.status !== 1) {
    throw new BizError(ErrorCode.FORBIDDEN, '账号已被禁用');
  }

  const valid = await admin.verifyPassword(password);
  if (!valid) {
    throw new BizError(ErrorCode.PARAM_INVALID, '用户名或密码错误');
  }

  // 更新最后登录时间
  admin.lastLoginAt = new Date();
  await admin.save();

  const payload = {
    id: admin.id,
    username: admin.username,
    role: admin.role,
    courtId: admin.courtId
  };

  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  logger.info(`管理员登录: ${username} (${admin.role})`);

  res.json(success({
    accessToken,
    refreshToken,
    admin: {
      id: admin.id,
      username: admin.username,
      role: admin.role,
      realName: admin.realName,
      courtId: admin.courtId
    }
  }));
}

/**
 * POST /api/admin/refresh
 * 刷新 Token
 */
async function refreshToken(req, res) {
  const { refreshToken: token } = req.body;
  if (!token) {
    throw new BizError(ErrorCode.PARAM_INVALID, '缺少 refreshToken');
  }

  const payload = verifyRefreshToken(token);
  if (!payload) {
    throw new BizError(ErrorCode.UNAUTHORIZED, 'refreshToken 无效或已过期');
  }

  const admin = await Admin.findByPk(payload.id);
  if (!admin || admin.status !== 1) {
    throw new BizError(ErrorCode.FORBIDDEN, '账号已被禁用');
  }

  const newPayload = {
    id: admin.id,
    username: admin.username,
    role: admin.role,
    courtId: admin.courtId
  };
  const accessToken = generateAccessToken(newPayload);

  res.json(success({ accessToken }));
}

/**
 * POST /api/user/login
 * 小程序用户登录（通过 wx.login 获取的 code）
 */
async function userLogin(req, res) {
  const { code, userInfo } = req.body;
  if (!code) {
    throw new BizError(ErrorCode.PARAM_INVALID, '缺少 code');
  }

  // 1. code2Session 换取 openid
  const sessionRes = await axios.get('https://api.weixin.qq.com/sns/jscode2session', {
    params: {
      appid: config.wechat.appid,
      secret: config.wechat.secret,
      js_code: code,
      grant_type: 'authorization_code'
    }
  });

  if (sessionRes.data.errcode) {
    // 微信接口返回错误：返回友好提示但不崩溃后端
    logger.error(`微信登录失败: ${sessionRes.data.errmsg} (errcode=${sessionRes.data.errcode})`);
    return res.status(503).json(fail(503, `微信服务暂时不可用: ${sessionRes.data.errmsg || 'AppSecret 未配置'}`));
  }

  const { openid, unionid, session_key } = sessionRes.data;

  // 2. 查找或创建用户
  let user = await User.findOne({ where: { openid } });
  if (!user) {
    user = await User.create({
      openid,
      unionid,
      nickname: userInfo?.nickName || '广州老炮',
      avatarUrl: userInfo?.avatarUrl || '',
      gender: userInfo?.gender || 0
    });
  } else if (userInfo) {
    // 更新用户信息
    user.nickname = userInfo.nickName || user.nickname;
    user.avatarUrl = userInfo.avatarUrl || user.avatarUrl;
    await user.save();
  }

  // 3. 生成 token
  const payload = { id: user.id, openid: user.openid };
  const accessToken = generateAccessToken(payload);

  res.json(success({
    accessToken,
    user: {
      id: user.id,
      nickname: user.nickname,
      avatarUrl: user.avatarUrl,
      phone: user.phone,
      role: user.role,         // user / court / admin
      courtId: user.courtId,   // 球场方关联的场地 ID
      registered: !!user.role  // false=未选择注册类型(需走我的页注册分支)
    }
  }));
}

/**
 * POST /api/user/register-role
 * 小程序用户选择注册类型（个人 / 球场方）
 * 个人：role=user，无需附加信息
 * 球场方：role=court，需要提交 courtId（需先通过 admin-web 录入场地）
 */
async function registerRole(req, res) {
  const { role, courtId, courtInfo } = req.body;
  const userId = req.user.id;

  if (!['user', 'court'].includes(role)) {
    throw new BizError(ErrorCode.PARAM_INVALID, 'role 必须是 user 或 court');
  }

  const user = await User.findByPk(userId);
  if (!user) {
    throw new BizError(ErrorCode.NOT_FOUND, '用户不存在');
  }

  // 【2026-08-04 #22】支持多角色 - roles 数组
  // 已有 roles 数组的优先; 兑底读 role 字段
  let currentRoles = Array.isArray(user.roles) ? [...user.roles] : (user.role && user.role !== 'user' ? [user.role] : []);
  if (currentRoles.includes(role)) {
    throw new BizError(ErrorCode.FORBIDDEN, `已注册过 ${role} 角色`);
  }

  if (role === 'court') {
    // 球场方注册：必须提供球场基本信息（后台审核）
    if (!courtInfo || !courtInfo.name || !courtInfo.address || !courtInfo.type) {
      throw new BizError(ErrorCode.PARAM_INVALID, '请填写球场名称、地址、类型');
    }
    // 行政区必填（2026-07-28 新增）
    const ALLOWED_DISTRICTS = ['天河', '海珠', '越秀', '荔湾', '白云', '黄埔', '番禺', '花都', '南沙', '从化', '增城'];
    if (!courtInfo.district || !ALLOWED_DISTRICTS.includes(courtInfo.district)) {
      throw new BizError(ErrorCode.PARAM_INVALID, `请选择正确的行政区（${ALLOWED_DISTRICTS.join('/')}）`);
    }
    // 经纬度选填（2026-07-28 改为选填，因前端暂未接入地图 SDK）
    if (courtInfo.longitude && courtInfo.latitude) {
      // 校验范围
      const lng = Number(courtInfo.longitude);
      const lat = Number(courtInfo.latitude);
      if (isNaN(lng) || isNaN(lat) || lng < -180 || lng > 180 || lat < -90 || lat > 90) {
        throw new BizError(ErrorCode.PARAM_INVALID, '经纬度格式不正确');
      }
    }
    // 场地性质多选校验（2026-07-28 新增）
    const ALLOWED_SURFACES = ['人工草地', '天然草地', '硬地'];
    if (courtInfo.surfaceTypes && !Array.isArray(courtInfo.surfaceTypes)) {
      throw new BizError(ErrorCode.PARAM_INVALID, '场地性质必须是数组');
    }
    const surfaceTypes = (courtInfo.surfaceTypes && courtInfo.surfaceTypes.length > 0)
      ? courtInfo.surfaceTypes.filter(s => ALLOWED_SURFACES.includes(s))
      : [courtInfo.surfaceType || '人工草地'];  // 向后兼容旧字段

    // 开放时间多时段校验（2026-07-28 新增）
    let openHours = null;
    if (courtInfo.openHours && typeof courtInfo.openHours === 'object') {
      const ALLOWED_DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
      openHours = {};
      for (const day of ALLOWED_DAYS) {
        const slots = courtInfo.openHours[day];
        if (Array.isArray(slots) && slots.length > 0) {
          openHours[day] = slots.map(s => ({
            start: String(s.start || '').slice(0, 5),
            end: String(s.end || '').slice(0, 5)
          })).filter(s => s.start && s.end);
        }
      }
      // 至少有一天有数据
      if (Object.keys(openHours).length === 0) openHours = null;
    }

    // 1. 创建场地记录（status=2 审核中）
    const { Court } = require('../models');
    const court = await Court.create({
      name: courtInfo.name,
      ownerId: userId,
      type: courtInfo.type,                // '11人制' / '7人制' / '5人制'
      address: courtInfo.address,
      district: courtInfo.district,        // 行政区（2026-07-28 新增）
      longitude: courtInfo.longitude ? Number(courtInfo.longitude) : null,
      latitude: courtInfo.latitude ? Number(courtInfo.latitude) : null,
      phone: courtInfo.phone || '',
      price: courtInfo.price || 0,
      openTime: courtInfo.openTime || '08:00:00',
      closeTime: courtInfo.closeTime || '22:00:00',
      surfaceType: surfaceTypes[0] || '人工草地',  // 旧字段保留（取多选第一个作 fallback）
      surfaceTypes: surfaceTypes,          // 场地性质多选（2026-07-28 新增）
      openHours: openHours,                // 按周多时段（2026-07-28 新增）
      description: courtInfo.description || '',
      status: 2  // 2=审核中
    });

    // 2. 更新用户 role + courtId + roles 数组
    user.role = 'court';
    user.courtId = court.id;
    // 【2026-08-04 #22】同步 roles 数组 ('user'+'court')
    // 注意: 必须重新赋值触发 setter, 直接 .push() 不被 sequelize 识别为 dirty
    const courtRoles = [...new Set([...(Array.isArray(user.roles) ? user.roles : []), 'user', 'court'])];
    user.roles = courtRoles;
    await user.save();

    logger.info(`球场方注册: userId=${userId}, courtId=${court.id}, name=${court.name}`);

    return res.json(success({
      role: 'court',
      roles: user.roles,
      courtId: court.id,
      courtStatus: 'pending',  // 等待 admin-web 审核
      message: '球场已提交，请等待审核'
    }, '注册成功'));
  }

  // 个人注册
  user.role = 'user';
  user.courtId = null;
  // 【2026-08-04 #22】同步写 roles 数组
  const userRoles = [...new Set([...(Array.isArray(user.roles) ? user.roles : []), 'user'])];
  user.roles = userRoles;
  await user.save();

  res.json(success({
    role: 'user',
    roles: user.roles,
    courtId: null,
    message: '个人注册成功'
  }, '注册成功'));
}

/**
 * GET /api/user/profile
 * 获取当前用户完整信息
 */
async function getUserProfile(req, res) {
  const user = await User.findByPk(req.user.id);
  if (!user) {
    throw new BizError(ErrorCode.NOT_FOUND, '用户不存在');
  }

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
    roles: user.roles || [],  // 【2026-08-04 #22】多身份数组
    courtId: user.courtId,
    court: court && {
      id: court.id,
      name: court.name,
      address: court.address,
      district: court.district,             // 行政区（2026-07-28 新增）
      type: court.type,
      surfaceType: court.surfaceType,
      surfaceTypes: court.surfaceTypes || [],  // 场地性质多选（2026-07-28 新增）
      status: court.status,  // 1=营业 0=休息 2=审核中
      openTime: court.openTime,
      closeTime: court.closeTime,
      openHours: court.openHours || null,   // 按周多时段（2026-07-28 新增）
      createdAt: court.createdAt
    }
  }));
}

/**
 * GET /api/admin/profile
 */
async function getAdminProfile(req, res) {
  res.json(success(req.admin));
}

/**
 * POST /api/admin/logout
 * 客户端清除 token 即可，这里只返回成功
 */
async function logout(req, res) {
  res.json(success(null, '已登出'));
}

/**
 * GET /api/user/me/courts
 * 获取当前用户（球场方）已审核通过的球场列表
 * 按 createdAt DESC 排序（宏哥原话：按加入时间倒序）
 * （2026-07-28 新增）
 */
async function getMyCourts(req, res) {
  const userId = req.user.id;

  const { Court } = require('../models');

  // 同一 owner_id 可能有多条球场记录（如球场方运营多个场地），全部返回
  const courts = await Court.findAll({
    where: {
      ownerId: userId,
      status: 1  // 仅已审核通过的（1=营业中）
    },
    order: [['created_at', 'DESC']]
  });

  res.json(success({
    list: courts.map(c => ({
      id: c.id,
      name: c.name,
      type: c.type,
      district: c.district,                 // 行政区
      address: c.address,
      longitude: c.longitude ? parseFloat(c.longitude) : null,
      latitude: c.latitude ? parseFloat(c.latitude) : null,
      phone: c.phone,
      price: parseFloat(c.price),
      surfaceType: c.surfaceType,           // 场地性质（旧字段，fallback）
      surfaceTypes: c.surfaceTypes || [],   // 场地性质多选
      openTime: c.openTime,
      closeTime: c.closeTime,
      openHours: c.openHours || null,       // 按周多时段
      description: c.description,
      status: c.status,
      rating: parseFloat(c.rating),
      createdAt: c.createdAt
    })),
    total: courts.length
  }));
}

/**
 * 获取当前用户已加入的球队列表（2026-07-28 新增）
 * 用于「我的-我的球队」inline 展示
 */
async function getMyTeams(req, res) {
  const userId = req.user.id;
  const { Team, TeamMember } = require('../models');

  // 查询用户作为成员的球队（status=1: 正常成员，0: 退出）
  const memberships = await TeamMember.findAll({
    where: { userId, status: 1 },
    include: [{
      model: Team,
      as: 'team',
      attributes: ['id', 'name', 'logo', 'district', 'motto', 'memberCount', 'attendance', 'wins', 'draws', 'losses', 'recruitment', 'level', 'founded']
    }]
  });

  const list = memberships
    .filter(m => m.team)  // 过滤球队被删除的情况
    .map(m => ({
      id: m.team.id,
      name: m.team.name,
      logo: m.team.logo,
      district: m.team.district,
      motto: m.team.motto,
      memberCount: m.team.memberCount,
      attendance: m.team.attendance,
      wins: m.team.wins,
      draws: m.team.draws,
      losses: m.team.losses,
      recruitment: m.team.recruitment,
      level: m.team.level,
      founded: m.team.founded,
      role: m.role,  // 成员角色: captain / member
      joinedAt: m.createdAt
    }));

  res.json(success({
    list,
    total: list.length
  }));
}

module.exports = {
  adminLogin,
  refreshToken,
  userLogin,
  registerRole,
  getUserProfile,
  getMyCourts,
  getMyTeams,  // 我的球队列表（2026-07-28 新增）
  getAdminProfile,
  logout
};