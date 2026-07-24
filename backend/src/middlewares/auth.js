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

      // 验证管理员存在 + 状态
      const admin = await Admin.findByPk(payload.id);
      if (!admin || admin.status !== 1) {
        throw new BizError(ErrorCode.FORBIDDEN, '账号已被禁用');
      }

      // 角色检查
      if (requiredRoles.length > 0 && !requiredRoles.includes(admin.role)) {
        throw new BizError(ErrorCode.FORBIDDEN, '权限不足');
      }

      req.admin = admin;
      next();
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