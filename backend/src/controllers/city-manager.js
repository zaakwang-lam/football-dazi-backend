const { Op } = require('sequelize');
const { Admin, Court, sequelize } = require('../models');
const { success, BizError, ErrorCode } = require('../utils/response');

function clean(value, max) {
  const text = String(value || '').trim();
  return text ? text.slice(0, max) : '';
}

function toView(admin, courtIds = []) {
  return {
    id: admin.id,
    username: admin.username,
    realName: admin.realName || '',
    phone: admin.phone || '',
    region: admin.region || '',
    idCard: admin.idCard || '',
    bankName: admin.bankName || '',
    bankAccount: admin.bankAccount || '',
    status: admin.status,
    lastLoginAt: admin.lastLoginAt,
    courtIds,
    courtCount: courtIds.length
  };
}

async function courtIdsOf(adminIds) {
  if (!adminIds.length) return new Map();
  const [rows] = await sequelize.query(
    'SELECT admin_id AS adminId, court_id AS courtId FROM city_manager_courts WHERE admin_id IN (:ids)',
    { replacements: { ids: adminIds } }
  );
  const map = new Map();
  for (const row of rows) {
    const list = map.get(row.adminId) || [];
    list.push(row.courtId);
    map.set(row.adminId, list);
  }
  return map;
}

async function list(req, res) {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
  const keyword = clean(req.query.keyword, 32);
  const where = { role: 'city_manager' };
  if (keyword) {
    where[Op.or] = [
      { username: { [Op.like]: `%${keyword}%` } },
      { realName: { [Op.like]: `%${keyword}%` } },
      { phone: { [Op.like]: `%${keyword}%` } }
    ];
  }
  const { rows, count } = await Admin.findAndCountAll({
    where,
    order: [['id', 'DESC']],
    limit: pageSize,
    offset: (page - 1) * pageSize
  });
  const courts = await courtIdsOf(rows.map((row) => row.id));
  res.json(success({
    list: rows.map((row) => toView(row, courts.get(row.id) || [])),
    total: count,
    page,
    pageSize
  }));
}

async function create(req, res) {
  const username = clean(req.body.username, 32);
  const password = clean(req.body.password, 64) || '123456';
  const realName = clean(req.body.realName, 32);
  if (!/^[A-Za-z0-9_]{4,32}$/.test(username)) {
    throw new BizError(ErrorCode.PARAM_INVALID, '用户名需为 4-32 位字母、数字或下划线');
  }
  if (password.length < 6) throw new BizError(ErrorCode.PARAM_INVALID, '初始密码至少 6 位');
  if (!realName) throw new BizError(ErrorCode.PARAM_INVALID, '请填写城市经理姓名');
  const existed = await Admin.findOne({ where: { username } });
  if (existed) throw new BizError(ErrorCode.CONFLICT, '用户名已存在');
  const admin = await Admin.create({
    username,
    passwordHash: password,
    role: 'city_manager',
    realName,
    phone: clean(req.body.phone, 20),
    region: clean(req.body.region, 64),
    idCard: clean(req.body.idCard, 32),
    bankName: clean(req.body.bankName, 64),
    bankAccount: clean(req.body.bankAccount, 64),
    status: req.body.status === 0 ? 0 : 1
  });
  await replaceCourts(admin.id, req.body.courtIds);
  const courts = await courtIdsOf([admin.id]);
  res.json(success(toView(admin, courts.get(admin.id) || []), '城市经理已添加，可使用该用户名登录'));
}

async function update(req, res) {
  const admin = await findManager(req.params.id);
  const realName = clean(req.body.realName, 32);
  if (!realName) throw new BizError(ErrorCode.PARAM_INVALID, '请填写城市经理姓名');
  admin.realName = realName;
  admin.phone = clean(req.body.phone, 20);
  admin.region = clean(req.body.region, 64);
  admin.idCard = clean(req.body.idCard, 32);
  admin.bankName = clean(req.body.bankName, 64);
  admin.bankAccount = clean(req.body.bankAccount, 64);
  if (req.body.status === 0 || req.body.status === 1) admin.status = req.body.status;
  await admin.save();
  if (Array.isArray(req.body.courtIds)) await replaceCourts(admin.id, req.body.courtIds);
  const courts = await courtIdsOf([admin.id]);
  res.json(success(toView(admin, courts.get(admin.id) || [])));
}

async function resetPassword(req, res) {
  const admin = await findManager(req.params.id);
  admin.passwordHash = '123456';
  await admin.save();
  res.json(success({ id: admin.id }, '密码已重置为 123456'));
}

async function courtOptions(req, res) {
  const rows = await Court.findAll({
    attributes: ['id', 'name', 'district', 'status'],
    order: [['id', 'DESC']],
    limit: 500
  });
  res.json(success(rows.map((row) => ({
    id: row.id,
    name: row.name,
    district: row.district || '',
    status: row.status
  }))));
}

async function me(req, res) {
  const admin = req.admin;
  const courts = await courtsOf(admin.id);
  res.json(success({
    id: admin.id,
    username: admin.username,
    realName: admin.realName || '',
    phone: admin.phone || '',
    region: admin.region || '',
    bankName: admin.bankName || '',
    bankAccount: admin.bankAccount ? `${String(admin.bankAccount).slice(0, 4)}****${String(admin.bankAccount).slice(-4)}` : '',
    courts
  }));
}

async function myOrders(req, res) {
  const [rows] = await sequelize.query(`
    SELECT o.id, o.order_no AS orderNo, o.status, o.amount, o.pay_amount AS payAmount,
           o.floor_price AS floorPrice, o.channel_fee AS channelFee, o.agency_fee AS agencyFee,
           o.created_at AS createdAt, c.name AS courtName
    FROM orders o
    INNER JOIN city_manager_courts m ON m.court_id = o.court_id
    INNER JOIN courts c ON c.id = o.court_id
    WHERE m.admin_id = ?
    ORDER BY o.id DESC
    LIMIT 100
  `, { replacements: [req.admin.id] });
  res.json(success({
    list: rows,
    note: '报酬结算尚未开通，这里只展示绑定球场的订单，不计算分成。'
  }));
}

async function findManager(id) {
  const admin = await Admin.findByPk(id);
  if (!admin || admin.role !== 'city_manager') throw new BizError(ErrorCode.NOT_FOUND, '城市经理不存在');
  return admin;
}

async function replaceCourts(adminId, courtIds) {
  const ids = [...new Set((Array.isArray(courtIds) ? courtIds : []).map(Number).filter((id) => id > 0))];
  if (ids.length) {
    const found = await Court.findAll({ where: { id: ids }, attributes: ['id'] });
    if (found.length !== ids.length) throw new BizError(ErrorCode.PARAM_INVALID, '包含不存在的球场');
  }
  await sequelize.query('DELETE FROM city_manager_courts WHERE admin_id = ?', { replacements: [adminId] });
  for (const courtId of ids) {
    await sequelize.query(
      'INSERT INTO city_manager_courts (admin_id, court_id) VALUES (?, ?)',
      { replacements: [adminId, courtId] }
    );
  }
}

async function courtsOf(adminId) {
  const [rows] = await sequelize.query(`
    SELECT c.id, c.name, c.district, c.address, c.status
    FROM city_manager_courts m
    INNER JOIN courts c ON c.id = m.court_id
    WHERE m.admin_id = ?
    ORDER BY c.id DESC
  `, { replacements: [adminId] });
  return rows;
}

module.exports = { list, create, update, resetPassword, courtOptions, me, myOrders };
