// src/middlewares/auth.js
const { verifyAccessToken } = require('../utils/jwt');
const { fail, BizError, ErrorCode } = require('../utils/response');
const { Admin } = require('../models');

function authMiddleware(required = true) {
  return async (req, res, next) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) {
      if (!required) { req.user = null; return next(); }
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

function adminAuth(requiredRoles = []) {
  return async (req, res, next) => {
    try {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
      if (!token) throw new BizError(ErrorCode.UNAUTHORIZED, '请先登录');
      const payload = verifyAccessToken(token);
      if (!payload) throw new BizError(ErrorCode.UNAUTHORIZED, 'Token 无效或已过期');

      let admin = await Admin.findByPk(payload.id);
      if (admin && admin.status === 1) {
        if (requiredRoles.length > 0 && !requiredRoles.includes(admin.role)) {
          throw new BizError(ErrorCode.FORBIDDEN, '权限不足');
        }
        req.admin = admin;
        return next();
      }

      const { User, Court } = require('../models');
      const user = await User.findByPk(payload.id);
      const roles = Array.isArray(user?.roles) ? user.roles.filter(Boolean) : [];
      const isCourt = user && (user.role === 'court' || roles.includes('court'));
      if (isCourt) {
        if (requiredRoles.length > 0 && !requiredRoles.includes('court_admin')) {
          throw new BizError(ErrorCode.FORBIDDEN, '权限不足');
        }
        let courtId = user.courtId || null;
        if (!courtId) {
          const owned = await Court.findOne({
            where: { ownerId: user.id },
            order: [['id', 'DESC']],
            attributes: ['id']
          });
          courtId = owned ? owned.id : null;
        }
        req.admin = {
          id: user.id,
          username: user.openid || `user_${user.id}`,
          role: 'court_admin',
          courtId,
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

function userAuth() {
  return authMiddleware(true);
}

module.exports = { authMiddleware, adminAuth, userAuth };
