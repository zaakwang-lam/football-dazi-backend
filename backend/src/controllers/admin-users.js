// src/controllers/admin-users.js
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
 * 用原生 SQL 强制清空 MySQL JSON 列 roles（Sequelize save 对 JSON 常写不进库）
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

  const { sequelize } = require('../models');
  const uid = Number(id);

  const [r1] = await sequelize.query(
    'UPDATE `users` SET `roles` = NULL, `role` = NULL WHERE `id` = ?',
    { replacements: [uid] }
  );
  let affected = (r1 && (r1.affectedRows ?? r1.changedRows)) || 0;

  const [checkRows] = await sequelize.query(
    'SELECT `id`, `role`, `roles`, JSON_TYPE(`roles`) AS roles_type, CAST(`roles` AS CHAR) AS roles_text FROM `users` WHERE `id` = ?',
    { replacements: [uid] }
  );
  const row = Array.isArray(checkRows) ? checkRows[0] : null;
  const rolesStillSet = row && row.roles != null
    && String(row.roles_text || '') !== 'null'
    && String(row.roles_text || '') !== '[]';

  if (rolesStillSet) {
    const [r2] = await sequelize.query(
      "UPDATE `users` SET `roles` = CAST('[]' AS JSON), `role` = NULL WHERE `id` = ?",
      { replacements: [uid] }
    );
    affected = (r2 && (r2.affectedRows ?? r2.changedRows)) || affected;
  }

  const [finalRows] = await sequelize.query(
    'SELECT `id`, `role`, CAST(`roles` AS CHAR) AS roles_text FROM `users` WHERE `id` = ?',
    { replacements: [uid] }
  );
  const finalRow = Array.isArray(finalRows) ? finalRows[0] : null;
  const finalText = finalRow ? String(finalRow.roles_text || '') : '';
  const rolesEmpty = finalText === '' || finalText === 'null' || finalText === '[]';
  const roleEmpty = !finalRow || finalRow.role == null || finalRow.role === '';
  const cleared = roleEmpty && rolesEmpty;

  logger.info(
    `[admin-users] user ${id} role reset by admin ${admin.id}: was role=${prevRole} roles=${JSON.stringify(prevRoles)} affected=${affected} final.role=${finalRow && finalRow.role} final.roles=${finalText} cleared=${cleared}`
  );

  if (!cleared) {
    throw new BizError(ErrorCode.INTERNAL, `重置身份写库失败，当前 roles=${finalText}，请用 SQL 清空`);
  }

  res.json(success({
    id: uid,
    roles: [],
    role: '',
    registered: false,
    prevRoles,
    prevRole,
    dbRolesText: finalText,
    affected
  }, '已重置身份，用户下次进入小程序需重新选择个人方或球场方'));
}

module.exports = {
  listUsers,
  getUserDetail,
  updateUserStatus,
  deleteUser,
  resetUserRole
};
