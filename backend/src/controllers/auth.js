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

  // DEBUG: 看 admin 实例
  logger.info(`DEBUG admin login: reqPassword='${password}' (len=${password?.length}), username=${admin.username}, role=${admin.role}, hash=${admin.passwordHash?.substring(0, 15)}, hashLen=${admin.passwordHash?.length}`);
  const bcrypt = require('bcryptjs');
  const directVerify = bcrypt.compareSync(password, admin.passwordHash);
  logger.info(`DEBUG direct bcrypt.compareSync(reqPassword, hash)=${directVerify}`);

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
      phone: user.phone
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
  getAdminProfile,
  logout
};