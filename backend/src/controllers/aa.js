// src/controllers/aa.js
// 队费 AA 暂关：小程序无法把队员付款直接打进队长个人零钱
const { AaPayment, AaPaymentItem, Team, TeamMember, User } = require('../models');
const { success, BizError, ErrorCode } = require('../utils/response');
const logger = require('../utils/logger');
const { ensureAaPaymentTables } = require('../utils/ensure-aa-tables');

const AA_ENABLED = process.env.AA_PAY_ENABLED === '1';
const AA_CLOSED_MSG = '队费 AA 暂未开放：小程序暂无法将队员付款直接转入队长微信零钱';

function assertAaOpen() {
  if (!AA_ENABLED) throw new BizError(ErrorCode.FORBIDDEN, AA_CLOSED_MSG);
}

async function assertCaptain(teamId, userId) {
  const team = await Team.findByPk(teamId);
  if (!team) throw new BizError(ErrorCode.NOT_FOUND, '球队不存在');
  if (Number(team.captainId) !== Number(userId)) throw new BizError(ErrorCode.FORBIDDEN, '仅队长可操作 AA');
  return team;
}

async function assertMember(teamId, userId) {
  const team = await Team.findByPk(teamId);
  if (!team) throw new BizError(ErrorCode.NOT_FOUND, '球队不存在');
  if (Number(team.captainId) === Number(userId)) return team;
  const member = await TeamMember.findOne({ where: { teamId, userId, status: 1 } });
  if (!member) throw new BizError(ErrorCode.FORBIDDEN, '仅本队队员可查看 AA');
  return team;
}

async function list(req, res) {
  const { id: teamId } = req.params;
  await assertMember(teamId, req.user.id);
  const rows = await AaPayment.findAll({
    where: { teamId },
    include: [{ model: AaPaymentItem, as: 'items' }],
    order: [['id', 'DESC']]
  });
  res.json(success({
    enabled: AA_ENABLED,
    list: rows.map(a => ({
      id: a.id, teamId: a.teamId, lfgId: a.lfgId, title: a.title, remark: a.remark,
      totalAmount: Number(a.totalAmount), perAmount: Number(a.perAmount),
      matchEnded: !!a.matchEnded, status: a.status,
      itemCount: (a.items || []).length,
      items: (a.items || []).map(i => ({
        id: i.id, userId: i.userId, displayName: i.displayName,
        amount: Number(i.amount), included: !!i.included, payStatus: i.payStatus
      }))
    }))
  }));
}

function splitFen(totalYuan, n) {
  const totalFen = Math.round(Number(totalYuan) * 100);
  if (!Number.isFinite(totalFen) || totalFen <= 0 || n <= 0) return null;
  const base = Math.floor(totalFen / n);
  let rem = totalFen - base * n;
  const out = [];
  for (let i = 0; i < n; i++) {
    const fen = base + (rem > 0 ? 1 : 0);
    if (rem > 0) rem -= 1;
    out.push(fen / 100);
  }
  return out;
}

async function create(req, res) {
  assertAaOpen();
  const { id: teamId } = req.params;
  const userId = req.user.id;
  const { lfgId, title, remark, totalAmount, userIds } = req.body;
  await assertCaptain(teamId, userId);

  const total = Math.round(Number(totalAmount) * 100) / 100;
  if (!Number.isFinite(total) || total <= 0) {
    throw new BizError(ErrorCode.PARAM_INVALID, '请填写大于 0 的总金额');
  }
  const ids = [...new Set((Array.isArray(userIds) ? userIds : []).map(Number).filter((n) => n > 0))];
  if (!ids.length) throw new BizError(ErrorCode.PARAM_INVALID, '请至少勾选一名队员');

  const members = await TeamMember.findAll({
    where: { teamId, status: 1, userId: ids },
    include: [{ model: User, as: 'user', attributes: ['id', 'nickname'] }]
  });
  if (members.length !== ids.length) {
    throw new BizError(ErrorCode.FORBIDDEN, '勾选了非本队队员');
  }
  const amounts = splitFen(total, members.length);
  const perAmount = Number((total / members.length).toFixed(2));

  const aa = await AaPayment.create({
    teamId,
    lfgId: lfgId || null,
    initiatorId: userId,
    title: title || '队费 AA',
    remark: remark || '',
    totalAmount: total,
    perAmount,
    matchEnded: 1,
    status: 'collecting'
  });

  for (let i = 0; i < members.length; i++) {
    const m = members[i];
    await AaPaymentItem.create({
      paymentId: aa.id,
      userId: m.userId,
      displayName: (m.user && m.user.nickname) || '队员',
      amount: amounts[i],
      included: 1,
      payStatus: 'unpaid'
    });
  }

  logger.info(`[aa] 发起收款 teamId=${teamId} aaId=${aa.id} total=${total} n=${members.length}`);
  res.json(success({ id: aa.id, totalAmount: total, perAmount, count: members.length }));
}

async function pay(req, res) {
  assertAaOpen();
  throw new BizError(ErrorCode.FORBIDDEN, AA_CLOSED_MSG);
}

async function get(req, res) {
  const { id: teamId, aaId } = req.params;
  await assertMember(teamId, req.user.id);
  const aa = await AaPayment.findOne({
    where: { id: aaId, teamId },
    include: [{ model: AaPaymentItem, as: 'items' }]
  });
  if (!aa) throw new BizError(ErrorCode.NOT_FOUND, 'AA 记录不存在');
  res.json(success({
    id: aa.id, teamId: aa.teamId, lfgId: aa.lfgId, title: aa.title, remark: aa.remark,
    totalAmount: Number(aa.totalAmount), perAmount: Number(aa.perAmount),
    matchEnded: !!aa.matchEnded, status: aa.status,
    items: (aa.items || []).map(i => ({
      id: i.id, userId: i.userId, displayName: i.displayName,
      amount: Number(i.amount), included: !!i.included, payStatus: i.payStatus
    }))
  }));
}

async function update(req, res) {
  assertAaOpen();
  throw new BizError(ErrorCode.FORBIDDEN, AA_CLOSED_MSG);
}

async function initiate(req, res) {
  assertAaOpen();
  throw new BizError(ErrorCode.FORBIDDEN, AA_CLOSED_MSG);
}

async function markPaid(req, res) {
  assertAaOpen();
  throw new BizError(ErrorCode.FORBIDDEN, AA_CLOSED_MSG);
}

function withTables(fn) {
  return async (req, res) => {
    await ensureAaPaymentTables();
    return fn(req, res);
  };
}

module.exports = {
  list: withTables(list),
  create: withTables(create),
  get: withTables(get),
  update: withTables(update),
  initiate: withTables(initiate),
  markPaid: withTables(markPaid),
  pay: withTables(pay)
};
