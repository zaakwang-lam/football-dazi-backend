// src/controllers/admin-users.js
// 后台用户管理接口（Ops / 超管视角）
const { User, Court, LfgPost, LfgJoin, TeamMember, Order, Checkin } = require('../models');
const { success, BizError, ErrorCode } = require('../utils/response');
const { Op } = require('sequelize');
const logger = require('../utils/logger');

async function listUsers(req, res) {
  const { role, status, keyword, page = 1, pageSize = 20 } = req.query;
  const where = {};
  const admin = req.admin;

  if (admin.role === 'court_admin') {
    if (!admin.courtId) {
      throw new BizError(ErrorCode.FORBIDDEN, '球场方账号未关联球场，请联系管理员');
    }
    where.courtId = admin.courtId;
  }

  if (role && role !== 'all') {
    where.role = role;
  }

  if (status !== undefined && status !== '') {
    where.status = Number(status);
  }

  if (keyword && keyword.trim()) {
    const kw = keyword.trim();
    where[Op.or] = [
      { nickname: { [Op.like]: `%${kw}%` } },
      { phone: { [Op.like]: `%${kw}%` } },
      { city: { [Op.like]: `%${kw}%` } }
    ];
  }

  const offset = (Number(page) - 1) * Number(pageSize);
  const limit = Math.min(Number(pageSize), 100);

  const { rows, count } = await User.findAndCountAll({
    where,
    order: [['id', 'DESC']],
    limit,
    offset,
    distinct: true
  });

  const courtIds = [...new Set(rows.map(u => u.courtId).filter(Boolean))];
  const courtMap = {};
  if (courtIds.length > 0) {
    const courts = await Court.findAll({
      where: { id: courtIds },
      attributes: ['id', 'name']
    });
    courts.forEach(c => { courtMap[c.id] = c.name; });
  }

  const list = rows.map(u => {
    const json = u.toJSON();
    let roles = [];
    try {
      const raw = json.roles;
      if (Array.isArray(raw)) roles = raw.filter((r) => r === 'user' || r === 'court' || r === 'admin');
    } catch (_) { roles = []; }
    return {
      id: json.id,
      nickname: json.nickname || '（未设置）',
      avatarUrl: json.avatarUrl || '',
      phone: json.phone || '',
      gender: json.gender,
      city: json.city || '',
      level: json.level || '业余',
      role: json.role || (roles[0] || ''),
      roles,
      courtId: json.courtId,
      courtName: json.courtId ? (courtMap[json.courtId] || null) : null,
      status: json.status,
      createdAt: json.created_at
    };
  });

  res.json(success({
    list,
    total: count,
    page: Number(page),
    pageSize: limit,
    pages: Math.ceil(count / limit)
  }));
}

async function getUserDetail(req, res) {
  const { id } = req.params;
  const admin = req.admin;

  const user = await User.findByPk(id);
  if (!user) {
    throw new BizError(ErrorCode.NOT_FOUND, '用户不存在');
  }

  if (admin.role === 'court_admin') {
    if (user.courtId !== admin.courtId) {
      throw new BizError(ErrorCode.FORBIDDEN, '无权限查看该用户');
    }
  }

  let courtName = null;
  if (user.courtId) {
    const court = await Court.findByPk(user.courtId, { attributes: ['id', 'name'] });
    courtName = court ? court.name : null;
  }

  const json = user.toJSON();
  let roles = [];
  try {
    const raw = json.roles;
    if (Array.isArray(raw)) roles = raw.filter((r) => r === 'user' || r === 'court' || r === 'admin');
  } catch (_) { roles = []; }

  res.json(success({
    id: json.id,
    nickname: json.nickname || '（未设置）',
    avatarUrl: json.avatarUrl || '',
    phone: json.phone || '',
    gender: json.gender,
    city: json.city || '',
    level: json.level || '业余',
    role: json.role || (roles[0] || ''),
    roles,
    openid: json.openid || '',
    unionid: json.unionid || '',
    courtId: json.courtId,
    courtName,
    status: json.status,
    createdAt: json.created_at,
    updatedAt: json.updated_at
  }));
}

async function updateUserStatus(req, res) {
  const { id } = req.params;
  const { status } = req.body;
  const admin = req.admin;

  if (admin.role === 'court_admin') {
    throw new BizError(ErrorCode.FORBIDDEN, '球场方无权操作用户状态');
  }

  if (status === undefined || ![0, 1].includes(Number(status))) {
    throw new BizError(ErrorCode.PARAM_INVALID, 'status 必须是 0 或 1');
  }

  const user = await User.findByPk(id);
  if (!user) {
    throw new BizError(ErrorCode.NOT_FOUND, '用户不存在');
  }

  user.status = Number(status);
  await user.save();

  logger.info(`[admin-users] user ${id} status -> ${status} by admin ${admin.id}`);
  res.json(success({ id: user.id, status: user.status }));
}

async function deleteUser(req, res) {
  const { id } = req.params;
  const admin = req.admin;

  if (admin.role === 'court_admin') {
    throw new BizError(ErrorCode.FORBIDDEN, '球场方无权删除用户');
  }

  const user = await User.findByPk(id);
  if (!user) {
    throw new BizError(ErrorCode.NOT_FOUND, '用户不存在');
  }

  const { sequelize } = require('../models');
  const t = await sequelize.transaction();
  try {
    const lfgPosts = await LfgPost.findAll({ where: { userId: id }, transaction: t });
    const lfgIds = lfgPosts.map(p => p.id);
    if (lfgIds.length > 0) {
      await LfgJoin.destroy({ where: { lfgId: lfgIds }, transaction: t });
      await LfgPost.destroy({ where: { id: lfgIds }, transaction: t });
    }

    await LfgJoin.destroy({ where: { userId: id }, transaction: t });
    await TeamMember.destroy({ where: { userId: id }, transaction: t });
    await Order.destroy({ where: { userId: id }, transaction: t });
    await Checkin.destroy({ where: { userId: id }, transaction: t });

    if (user.courtId) {
      await Court.destroy({ where: { id: user.courtId }, transaction: t });
    }

    await user.destroy({ transaction: t });
    await t.commit();

    logger.info(`[admin-users] user ${id} (${user.nickname}) deleted by admin ${admin.id} (${admin.role})`);
    res.json(success({
      id: Number(id),
      deletedLfgPosts: lfgIds.length,
      note: '用户及关联数据已全部清理'
    }, '用户已删除'));
  } catch (err) {
    await t.rollback();
    logger.error(`[admin-users] delete user ${id} failed:`, err);
    throw err;
  }
}

/**
 * POST /api/admin/users/:id/reset-role
 * 重置用户身份：清空 roles / role，下次打开小程序需重新选择「个人方 / 球场方」
 */
async function resetUserRole(req, res) {
  const { id } = req.params;
  const admin = req.admin;

  if (admin.role === 'court_admin') {
    throw new BizError(ErrorCode.FORBIDDEN, '球场方无权重置用户身份');
  }

  const user = await User.findByPk(id);
  if (!user) {
    throw new BizError(ErrorCode.NOT_FOUND, '用户不存在');
  }

  const prevRoles = Array.isArray(user.roles) ? [...user.roles] : [];
  const prevRole = user.role || '';

  // 强制清空：兼容 ENUM/JSON 在部分环境下 null 写不进去的问题
  user.set('roles', null);
  user.set('role', null);
  user.changed('roles', true);
  user.changed('role', true);
  await user.save();
  await user.reload();
  if (user.role || (Array.isArray(user.roles) && user.roles.length)) {
    await User.update({ roles: null, role: null }, { where: { id: user.id } });
    await user.reload();
  }

  logger.info(`[admin-users] user ${id} role reset by admin ${admin.id}: was role=${prevRole} roles=${JSON.stringify(prevRoles)}`);
  res.json(success({
    id: user.id,
    roles: [],
    role: '',
    registered: false,
    prevRoles,
    prevRole
  }, '已重置身份，用户下次进入小程序需重新选择个人方或球场方'));
}

module.exports = {
  listUsers,
  getUserDetail,
  updateUserStatus,
  deleteUser,
  resetUserRole
};
