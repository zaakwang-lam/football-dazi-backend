// src/controllers/aa.js
// 球队 AA 草稿/发起/记账控制器（不接微信支付）
const { AaPayment, AaPaymentItem, Team, TeamMember, User } = require('../models');
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
  const { id: teamId, aaId } = req.params;
  const userId = req.user.id;
  await assertMember(teamId, userId);
  const aa = await AaPayment.findOne({ where: { id: aaId, teamId } });
  if (!aa) throw new BizError(ErrorCode.NOT_FOUND, 'AA 记录不存在');
  if (aa.status !== 'collecting') throw new BizError(ErrorCode.FORBIDDEN, '当前不可支付');

  const item = await AaPaymentItem.findOne({ where: { paymentId: aa.id, userId, included: 1 } });
  if (!item) throw new BizError(ErrorCode.FORBIDDEN, '你不在本次收款名单里');
  if (item.payStatus === 'paid') throw new BizError(ErrorCode.CONFLICT, '你已支付');
  const amount = Number(item.amount);
  if (!(amount > 0)) throw new BizError(ErrorCode.PARAM_INVALID, '应付金额无效');

  let openid = req.user.openid;
  if (!openid) {
    const user = await User.findByPk(userId);
    openid = user && user.openid;
  }
  if (!openid || String(openid).startsWith('audit_test')) {
    throw new BizError(ErrorCode.PARAM_INVALID, '缺少微信身份，请退出后重新登录再支付');
  }

  const { generateOrderNo } = require('../utils/wechat-sign');
  if (!item.outTradeNo) {
    item.outTradeNo = generateOrderNo('AA');
    await item.save();
  }
  const wechatPay = require('../services/wechat-pay');
  const payParams = await wechatPay.unifiedOrder({
    openid,
    outTradeNo: item.outTradeNo,
    totalFee: Math.round(amount * 100),
    body: `队费AA ${aa.title || ''}`.trim().slice(0, 40),
    notifyUrl: process.env.WX_NOTIFY_URL,
    attach: `aa:${item.id}`
  });
  logger.info(`[aa] 调起支付 aaId=${aa.id} item=${item.id} fee=${amount}`);
  res.json(success({ itemId: item.id, amount, payParams }));
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
  markPaid: withTables(markPaid),
  pay: withTables(pay)
};
