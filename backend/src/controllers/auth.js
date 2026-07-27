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

  if (user.role && user.role !== 'user') {
    throw new BizError(ErrorCode.FORBIDDEN, '已注册过，不能重复注册');
  }

  if (role === 'court') {
    // 球场方注册：必须提供球场基本信息（后台审核）
    if (!courtInfo || !courtInfo.name || !courtInfo.address || !courtInfo.type) {
      throw new BizError(ErrorCode.PARAM_INVALID, '请填写球场名称、地址、类型');
    }
    if (!courtInfo.longitude || !courtInfo.latitude) {
      throw new BizError(ErrorCode.PARAM_INVALID, '请提供球场坐标（可从腾讯地图选点获取）');
    }

    // 1. 创建场地记录（status=2 审核中）
    const { Court } = require('../models');
    const court = await Court.create({
      name: courtInfo.name,
      ownerId: userId,
      type: courtInfo.type,                // '11人制' / '7人制' / '5人制'
      address: courtInfo.address,
      longitude: courtInfo.longitude,
      latitude: courtInfo.latitude,
      phone: courtInfo.phone || '',
      price: courtInfo.price || 0,
      openTime: courtInfo.openTime || '08:00:00',
      closeTime: courtInfo.closeTime || '22:00:00',
      surfaceType: courtInfo.surfaceType || '人工草地',  // 人工草地/天然草地/硬地
      description: courtInfo.description || '',
      status: 2  // 2=审核中
    });

    // 2. 更新用户 role + courtId
    user.role = 'court';
    user.courtId = court.id;
    await user.save();

    logger.info(`球场方注册: userId=${userId}, courtId=${court.id}, name=${court.name}`);

    return res.json(success({
      role: 'court',
      courtId: court.id,
      courtStatus: 'pending',  // 等待 admin-web 审核
      message: '球场已提交，请等待审核'
    }, '注册成功'));
  }

  // 个人注册
  user.role = 'user';
  user.courtId = null;
  await user.save();

  res.json(success({
    role: 'user',
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
    courtId: user.courtId,
    court: court && {
      id: court.id,
      name: court.name,
      address: court.address,
      type: court.type,
      surfaceType: court.surfaceType,
      status: court.status,  // 1=营业 0=休息 2=审核中
      openTime: court.openTime,
      closeTime: court.closeTime
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

module.exports = {
  adminLogin,
  refreshToken,
  userLogin,
  getUserProfile,
  registerRole,
  getAdminProfile,
  logout
};