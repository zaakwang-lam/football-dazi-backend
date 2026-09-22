// src/controllers/aa.js
// 球队 AA 草稿/发起/记账控制器（不接微信支付）
const { AaPayment, AaPaymentItem, Team, TeamMember } = require('../models');
const { success, BizError, ErrorCode } = require('../utils/response');
const logger = require('../utils/logger');
const { ensureAaPaymentTables } = require('../utils/ensure-aa-tables');

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

async function create(req, res) {
  const { id: teamId } = req.params;
  const userId = req.user.id;
  const { lfgId, title, remark, items } = req.body;
  await assertCaptain(teamId, userId);

  if (!Array.isArray(items) || items.length === 0) {
    throw new BizError(ErrorCode.PARAM_INVALID, '至少勾选一名队员');
  }

  const members = await TeamMember.findAll({ where: { teamId, status: 1 } });
  const memberIds = new Set(members.map(m => m.userId));
  for (const it of items) {
    if (!memberIds.has(it.userId)) {
      throw new BizError(ErrorCode.FORBIDDEN, `用户 ${it.userId} 不是本队队员`);
    }
  }

  const totalAmount = items.reduce((sum, it) => sum + (Number(it.amount) || 0), 0);
  const perAmount = items.length > 0 ? totalAmount / items.length : 0;

  const aa = await AaPayment.create({
    teamId,
    lfgId: lfgId || null,
    initiatorId: userId,
    title: title || '队费 AA',
    remark: remark || '',
    totalAmount,
    perAmount,
    matchEnded: 0,
    status: 'draft'
  });

  for (const it of items) {
    await AaPaymentItem.create({
      paymentId: aa.id,
      userId: it.userId,
      displayName: it.displayName || '',
      amount: it.amount || 0,
      included: it.included ? 1 : 0,
      payStatus: 'unpaid'
    });
  }

  logger.info(`[aa] 草稿创建 teamId=${teamId} aaId=${aa.id} totalAmount=${totalAmount}`);
  res.json(success({ id: aa.id, totalAmount, perAmount }));
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
  const { id: teamId, aaId } = req.params;
  await assertCaptain(teamId, req.user.id);
  const aa = await AaPayment.findOne({ where: { id: aaId, teamId } });
  if (!aa) throw new BizError(ErrorCode.NOT_FOUND, 'AA 记录不存在');
  if (aa.status !== 'draft') throw new BizError(ErrorCode.FORBIDDEN, '仅草稿状态可修改');

  const { title, remark, items, totalAmount } = req.body;
  if (title !== undefined) aa.title = title;
  if (remark !== undefined) aa.remark = remark;
  if (totalAmount !== undefined) aa.totalAmount = totalAmount;

  if (Array.isArray(items) && items.length > 0) {
    aa.perAmount = items.length > 0 ? Number(totalAmount || aa.totalAmount) / items.length : 0;
    await AaPaymentItem.destroy({ where: { paymentId: aaId } });
    for (const it of items) {
      await AaPaymentItem.create({
        paymentId: aa.id,
        userId: it.userId,
        displayName: it.displayName || '',
        amount: it.amount || 0,
        included: it.included ? 1 : 0,
        payStatus: 'unpaid'
      });
    }
  }

  await aa.save();
  logger.info(`[aa] 草稿修改 aaId=${aaId}`);
  res.json(success({ id: aa.id }));
}

async function initiate(req, res) {
  const { id: teamId, aaId } = req.params;
  await assertCaptain(teamId, req.user.id);
  const aa = await AaPayment.findOne({ where: { id: aaId, teamId } });
  if (!aa) throw new BizError(ErrorCode.NOT_FOUND, 'AA 记录不存在');
  if (aa.status !== 'draft') throw new BizError(ErrorCode.FORBIDDEN, '仅草稿可发起');

  const { matchEnded } = req.body;
  if (!matchEnded) {
    throw new BizError(ErrorCode.PARAM_INVALID, '发起前必须确认比赛已结束');
  }

  aa.status = 'collecting';
  aa.matchEnded = 1;
  await aa.save();

  logger.info(`[aa] 发起 aaId=${aaId} status=collecting`);
  res.json(success({ id: aa.id, status: aa.status }));
}

async function markPaid(req, res) {
  const { id: teamId, aaId, itemId } = req.params;
  await assertCaptain(teamId, req.user.id);

  const item = await AaPaymentItem.findOne({
    where: { id: itemId, paymentId: aaId }
  });
  if (!item) throw new BizError(ErrorCode.NOT_FOUND, 'AA 明细不存在');

  const aa = await AaPayment.findOne({ where: { id: aaId, teamId } });
  if (!aa) throw new BizError(ErrorCode.NOT_FOUND, 'AA 记录不存在');
  if (aa.status === 'draft') throw new BizError(ErrorCode.FORBIDDEN, '草稿状态不可标记已付');

  item.payStatus = 'paid';
  await item.save();

  logger.info(`[aa] 标记已付 aaId=${aaId} itemId=${itemId}`);
  res.json(success({ id: item.id, payStatus: item.payStatus }));
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
  markPaid: withTables(markPaid)
};
