// 后台财务管理：收款、退款、待支付，按账号范围统计
const { Order, Court, User } = require('../models');
const { sequelize } = require('../utils/db');
const { success } = require('../utils/response');
const { Op } = require('sequelize');

function ymd(value) {
  const m = String(value || '').match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function todayYmd() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function rangeOf(query) {
  const to = ymd(query.to) || todayYmd();
  const from = ymd(query.from) || `${to.slice(0, 8)}01`;
  return { from, to, start: `${from} 00:00:00`, end: `${to} 23:59:59` };
}

async function courtIdsOf(admin) {
  if (!admin || admin.role !== 'court_admin') return null;
  const ids = [];
  if (admin.courtId) ids.push(Number(admin.courtId));
  if (admin.id) {
    const owned = await Court.findAll({ where: { ownerId: admin.id }, attributes: ['id'] });
    owned.forEach((c) => ids.push(Number(c.id)));
  }
  return [...new Set(ids.filter(Boolean))];
}

function moneyWhere(start, end) {
  return {
    [Op.or]: [
      { status: { [Op.in]: ['paid', 'completed'] }, pay_time: { [Op.between]: [start, end] } },
      {
        status: 'refunded',
        [Op.or]: [
          { refund_time: { [Op.between]: [start, end] } },
          { refund_time: null, updated_at: { [Op.between]: [start, end] } }
        ]
      },
      { status: { [Op.in]: ['pending', 'booked'] }, created_at: { [Op.between]: [start, end] } }
    ]
  };
}

function num(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

async function summary(req, res) {
  const { from, to, start, end } = rangeOf(req.query);
  const courtIds = await courtIdsOf(req.admin);
  if (courtIds && !courtIds.length) {
    return res.json(success({
      from, to, unbound: true,
      received: 0, refunded: 0, net: 0, pending: 0,
      paidCount: 0, refundCount: 0, pendingCount: 0, bookedCount: 0,
      byCourt: []
    }));
  }
  const repl = { start, end };
  let courtSql = '';
  if (courtIds) {
    courtSql = ' AND court_id IN (:courtIds)';
    repl.courtIds = courtIds;
  }
  const whereMoney = `
    (
      (status IN ('paid','completed') AND pay_time BETWEEN :start AND :end)
      OR (status = 'refunded' AND COALESCE(refund_time, updated_at) BETWEEN :start AND :end)
      OR (status IN ('pending','booked') AND created_at BETWEEN :start AND :end)
    )${courtSql}
  `;
  const [rows] = await sequelize.query(`
    SELECT
      COALESCE(SUM(CASE WHEN status IN ('paid','completed') THEN COALESCE(pay_amount, amount) ELSE 0 END), 0) AS received,
      COALESCE(SUM(CASE WHEN status = 'refunded' THEN COALESCE(pay_amount, amount) ELSE 0 END), 0) AS refunded,
      COALESCE(SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END), 0) AS pending,
      SUM(CASE WHEN status IN ('paid','completed') THEN 1 ELSE 0 END) AS paidCount,
      SUM(CASE WHEN status = 'refunded' THEN 1 ELSE 0 END) AS refundCount,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pendingCount,
      SUM(CASE WHEN status = 'booked' THEN 1 ELSE 0 END) AS bookedCount
    FROM orders
    WHERE ${whereMoney}
  `, { replacements: repl });
  const row = rows[0] || {};
  const received = num(row.received);
  const refunded = num(row.refunded);

  let courtFilter = '';
  if (courtIds) courtFilter = ' AND o.court_id IN (:courtIds)';
  const [courts] = await sequelize.query(`
    SELECT o.court_id AS courtId, c.name AS courtName,
      COALESCE(SUM(CASE WHEN o.status IN ('paid','completed') THEN COALESCE(o.pay_amount, o.amount) ELSE 0 END), 0) AS received,
      COALESCE(SUM(CASE WHEN o.status = 'refunded' THEN COALESCE(o.pay_amount, o.amount) ELSE 0 END), 0) AS refunded,
      SUM(CASE WHEN o.status IN ('paid','completed') THEN 1 ELSE 0 END) AS paidCount,
      SUM(CASE WHEN o.status = 'refunded' THEN 1 ELSE 0 END) AS refundCount
    FROM orders o
    LEFT JOIN courts c ON c.id = o.court_id
    WHERE (
      (o.status IN ('paid','completed') AND o.pay_time BETWEEN :start AND :end)
      OR (o.status = 'refunded' AND COALESCE(o.refund_time, o.updated_at) BETWEEN :start AND :end)
    )${courtFilter}
    GROUP BY o.court_id, c.name
    ORDER BY received DESC
    LIMIT 50
  `, { replacements: repl });

  res.json(success({
    from, to, unbound: false,
    received, refunded, net: num(received - refunded), pending: num(row.pending),
    paidCount: Number(row.paidCount) || 0,
    refundCount: Number(row.refundCount) || 0,
    pendingCount: Number(row.pendingCount) || 0,
    bookedCount: Number(row.bookedCount) || 0,
    byCourt: courts.map((c) => ({
      courtId: c.courtId,
      courtName: c.courtName || '—',
      received: num(c.received),
      refunded: num(c.refunded),
      net: num(num(c.received) - num(c.refunded)),
      paidCount: Number(c.paidCount) || 0,
      refundCount: Number(c.refundCount) || 0
    }))
  }));
}

async function flows(req, res) {
  const { from, to, start, end } = rangeOf(req.query);
  const courtIds = await courtIdsOf(req.admin);
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(2000, Math.max(1, Number(req.query.pageSize) || 20));
  if (courtIds && !courtIds.length) {
    return res.json(success({ list: [], total: 0, page, pageSize, from, to }));
  }
  const and = [moneyWhere(start, end)];
  if (courtIds) and.push({ courtId: { [Op.in]: courtIds } });
  const status = String(req.query.status || 'all');
  if (status === 'paid') and.push({ status: { [Op.in]: ['paid', 'completed'] } });
  else if (status === 'refunded') and.push({ status: 'refunded' });
  else if (status === 'pending') and.push({ status: 'pending' });
  else if (status === 'booked') and.push({ status: 'booked' });
  const keyword = String(req.query.keyword || '').trim().slice(0, 40);
  if (keyword) {
    const kw = `%${keyword.replace(/[%_\\]/g, '')}%`;
    and.push({
      [Op.or]: [
        { orderNo: { [Op.like]: kw } },
        { contactPhone: { [Op.like]: kw } },
        { contactName: { [Op.like]: kw } }
      ]
    });
  }
  const offset = (page - 1) * pageSize;
  const { rows, count } = await Order.findAndCountAll({
    where: { [Op.and]: and },
    include: [{ model: Court, as: 'court', attributes: ['id', 'name'] }],
    order: [['updated_at', 'DESC']],
    limit: pageSize,
    offset,
    distinct: true
  });
  const userIds = [...new Set(rows.map((o) => o.userId).filter(Boolean))];
  const users = userIds.length
    ? await User.findAll({ where: { id: userIds }, attributes: ['id', 'nickname', 'phone'] })
    : [];
  const userMap = {};
  users.forEach((u) => { userMap[u.id] = u; });
  res.json(success({
    list: rows.map((o) => ({
      id: o.id,
      orderNo: o.orderNo,
      status: o.status,
      amount: num(o.amount),
      payAmount: o.payAmount != null ? num(o.payAmount) : num(o.amount),
      payTime: o.payTime,
      refundTime: o.refundTime,
      createdAt: o.createdAt,
      contactName: o.contactName || '',
      contactPhone: o.contactPhone || '',
      courtName: o.court ? o.court.name : '',
      userName: userMap[o.userId] ? (userMap[o.userId].nickname || '') : ''
    })),
    total: count,
    page,
    pageSize,
    from,
    to
  }));
}

async function refunds(req, res) {
  const { from, to, start, end } = rangeOf(req.query);
  const courtIds = await courtIdsOf(req.admin);
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
  const offset = (page - 1) * pageSize;
  if (courtIds && !courtIds.length) {
    return res.json(success({ list: [], total: 0, page, pageSize, from, to }));
  }
  const repl = { start, end };
  let courtSql = '';
  if (courtIds) {
    courtSql = ' AND o.court_id IN (:courtIds)';
    repl.courtIds = courtIds;
  }
  const keyword = String(req.query.keyword || '').trim().slice(0, 40).replace(/[%_\\]/g, '');
  let kwSql = '';
  if (keyword) {
    kwSql = ' AND (r.refund_no LIKE :kw OR r.order_no LIKE :kw)';
    repl.kw = `%${keyword}%`;
  }
  const base = `
    FROM payment_refunds r
    LEFT JOIN orders o ON o.order_no = r.order_no
    LEFT JOIN courts c ON c.id = o.court_id
    WHERE r.created_at BETWEEN :start AND :end
    ${courtSql}${kwSql}
  `;
  try {
    const [countRows] = await sequelize.query(`SELECT COUNT(*) AS total ${base}`, { replacements: repl });
    const [rows] = await sequelize.query(`
      SELECT r.id, r.refund_no AS refundNo, r.order_no AS orderNo, r.amount, r.reason, r.status,
             r.created_at AS createdAt, r.completed_at AS completedAt,
             c.name AS courtName
      ${base}
      ORDER BY r.created_at DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `, { replacements: repl });
    res.json(success({
      list: rows.map((r) => ({ ...r, amount: num(r.amount) })),
      total: Number(countRows[0] && countRows[0].total) || 0,
      page, pageSize, from, to
    }));
  } catch (err) {
    res.json(success({ list: [], total: 0, page, pageSize, from, to, unavailable: true }));
  }
}

module.exports = { summary, flows, refunds };
