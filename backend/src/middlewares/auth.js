// src/middlewares/auth.js
// JWT 鉴权中间件
const { verifyAccessToken } = require('../utils/jwt');
const { fail, BizError, ErrorCode } = require('../utils/response');
const { Admin } = require('../models');

/**
 * 通用 JWT 鉴权
 */
function authMiddleware(required = true) {
  return async (req, res, next) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

    if (!token) {
      if (!required) {
        req.user = null;
        return next();
      }
      return res.status(401).json(fail(ErrorCode.UNAUTHORIZED, '未登录'));
    }

    const payload = verifyAccessToken(token);
    if (!payload) {
      return res.status(401).json(fail(ErrorCode.UNAUTHORIZED, 'Token 无效或已过期'));
    }

    req.user = payload;
    req.token = token;
    next();
  };
}

/**
 * 管理员鉴权（必须登录 + 角色检查）
 *
 * 支持两种身份：
 * 1. Admin: payload.id 走 Admin 表，req.admin = admin
 * 2. 小程序用户作为球场方：payload.id 走 User 表，role='court',
 *    系统会查找该用户关联的 courtId 作为 req.admin.courtId，
 *    role 自动转为 'court_admin'
 */
function adminAuth(requiredRoles = []) {
  return async (req, res, next) => {
    try {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

      if (!token) {
        throw new BizError(ErrorCode.UNAUTHORIZED, '请先登录');
      }

      const payload = verifyAccessToken(token);
      if (!payload) {
        throw new BizError(ErrorCode.UNAUTHORIZED, 'Token 无效或已过期');
      }

      // 1. 先尝试 Admin 表（老路径）
      let admin = await Admin.findByPk(payload.id);
      if (admin && admin.status === 1) {
        if (requiredRoles.length > 0 && !requiredRoles.includes(admin.role)) {
          throw new BizError(ErrorCode.FORBIDDEN, '权限不足');
        }
        req.admin = admin;
        return next();
      }

      // 2. 尝试 User 表里的球场方（2026-07-29 新增：小程序球场方也能调用）
      const User = require('../models').User;
      const user = await User.findByPk(payload.id);
      if (user && user.role === 'court' && user.courtId) {
        if (requiredRoles.length > 0 && !requiredRoles.includes('court_admin')) {
          throw new BizError(ErrorCode.FORBIDDEN, '权限不足');
        }
        // 构一个虚拟 admin 对象供控制器使用
        req.admin = {
          id: user.id,
          username: user.openid || `user_${user.id}`,
          role: 'court_admin',
          courtId: user.courtId,
          realName: user.nickname || '',
          phone: user.phone || '',
          status: 1
        };
        return next();
      }

      throw new BizError(ErrorCode.FORBIDDEN, '该账号无法访问后台，需球场方身份');
    } catch (e) {
      if (e.isBizError) {
        return res.status(e.code === ErrorCode.UNAUTHORIZED ? 401 : 403)
          .json(fail(e.code, e.message));
      }
      return res.status(401).json(fail(ErrorCode.UNAUTHORIZED, '认证失败'));
    }
  };
}

/**
 * C 端用户鉴权（小程序）
 */
function userAuth() {
  return authMiddleware(true);
}

module.exports = {
  authMiddleware,
  adminAuth,
  userAuth
};