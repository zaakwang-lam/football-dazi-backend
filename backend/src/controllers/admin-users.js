// src/controllers/admin-users.js
// 后台用户管理接口（Ops / 超管视角）
const { User, Court, LfgPost, LfgJoin, TeamMember, Order, Checkin } = require('../models');
const { success, BizError, ErrorCode } = require('../utils/response');
const { Op } = require('sequelize');
const logger = require('../utils/logger');

/**
 * GET /api/admin/users
 * - ops / super_admin：全量用户列表
 * - court_admin：仅能看到自己球场的用户
 * Query 参数：
 *   role       - 过滤用户角色（user/court/admin）
 *   status     - 过滤状态（1=正常 / 0=禁用）
 *   keyword    - 模糊搜索（昵称 / 手机号）
 *   page       - 页码，默认 1
 *   pageSize   - 每页条数，默认 20，最大 100
 */
async function listUsers(req, res) {
  const { role, status, keyword, page = 1, pageSize = 20 } = req.query;
  const where = {};

  const admin = req.admin;

  // court_admin 只能看自己球场的用户
  if (admin.role === 'court_admin') {
    if (!admin.courtId) {
      throw new BizError(ErrorCode.FORBIDDEN, '球场方账号未关联球场，请联系管理员');
    }
    where.courtId = admin.courtId;
  }

  // 角色过滤
  if (role && role !== 'all') {
    where.role = role;
  }

  // 状态过滤
  if (status !== undefined && status !== '') {
    where.status = Number(status);
  }

  // 关键词模糊搜索
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

  // 补充球场名称（无 Sequelize 关联，手动查询）
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
    // roles 以 JSON 字段为准；空则表示尚未选择身份
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
      gender: json.gender,         // 0=未知 1=男 2=女
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

/**
 * GET /api/admin/users/:id
 * 用户详情
 */
async function getUserDetail(req, res) {
  const { id } = req.params;
  const admin = req.admin;

  const user = await User.findByPk(id);
  if (!user) {
    throw new BizError(ErrorCode.NOT_FOUND, '用户不存在');
  }

  // court_admin 只能查看自己球场的用户
  if (admin.role === 'court_admin') {
    if (user.courtId !== admin.courtId) {
      throw new BizError(ErrorCode.FORBIDDEN, '无权限查看该用户');
    }
  }

  // 查球场名称
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

/**
 * PUT /api/admin/users/:id/status
 * 启用/禁用用户（仅 ops / super_admin）
 */
async function updateUserStatus(req, res) {
  const { id } = req.params;
  const { status } = req.body;  // 1=启用 0=禁用
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

/**
 * DELETE /api/admin/users/:id
 * 手动删除用户（仅 super_admin / ops）
 * 【2026-08-07 新增】宏哥要求可手动清除用户信息用于重测
 * - 个人用户：删除 user 记录，同时级联删除 lfg_posts/lfg_joins/team_members/orders/checkins
 * - 球场方：额外删除其创建的球场（关联外键 court.owner_id）
 * - 事务保证：全部成功 or 全部回滚
 */
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
    // 1. 凑人/约战记录
    const lfgPosts = await LfgPost.findAll({ where: { userId: id }, transaction: t });
    const lfgIds = lfgPosts.map(p => p.id);
    if (lfgIds.length > 0) {
      await LfgJoin.destroy({ where: { lfgId: lfgIds }, transaction: t });
      await LfgPost.destroy({ where: { id: lfgIds }, transaction: t });
    }

    // 2. 作为加入者参与的记录
    await LfgJoin.destroy({ where: { userId: id }, transaction: t });

    // 3. 球队成员
    await TeamMember.destroy({ where: { userId: id }, transaction: t });

    // 4. 订单
    await Order.destroy({ where: { userId: id }, transaction: t });

    // 5. 签到
    await Checkin.destroy({ where: { userId: id }, transaction: t });

    // 6. 球场方：删除其创建的球场
    if (user.courtId) {
      await Court.destroy({ where: { id: user.courtId }, transaction: t });
    }

    // 7. 最后删用户
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
 * 仅 ops / super_admin；不删除用户、球场、订单等业务数据
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

  user.roles = null;
  user.role = null;
  await user.save();

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
