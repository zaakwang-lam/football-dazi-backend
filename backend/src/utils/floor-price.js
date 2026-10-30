const { BizError, ErrorCode } = require('./response');

const WX_FEE_RATE = 0.006;

function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

async function applyPendingFloor(slot) {
  if (!slot || slot.pendingFloorPrice == null || !slot.floorEffectiveAt) return slot;
  if (new Date(slot.floorEffectiveAt).getTime() > Date.now()) return slot;
  slot.floorPrice = slot.pendingFloorPrice;
  slot.pendingFloorPrice = null;
  slot.floorEffectiveAt = null;
  await slot.save();
  return slot;
}

function assignFloor(slot, rawFloor, listPrice) {
  if (rawFloor === undefined || rawFloor === null || rawFloor === '') {
    throw new BizError(ErrorCode.PARAM_INVALID, '请填写合作底价，未填写不能上架');
  }
  const floor = money(rawFloor);
  const list = money(listPrice);
  if (floor == null || floor < 0) throw new BizError(ErrorCode.PARAM_INVALID, '合作底价需为不小于 0 的数字');
  if (list == null || floor > list) throw new BizError(ErrorCode.PARAM_INVALID, '合作底价不能高于场次费用');
  const current = slot.floorPrice == null || slot.floorPrice === '' ? null : money(slot.floorPrice);
  if (current == null) {
    slot.floorPrice = floor;
    slot.pendingFloorPrice = null;
    slot.floorEffectiveAt = null;
    return { mode: 'now', effectiveAt: null };
  }
  if (Math.abs(current - floor) < 0.001) {
    slot.pendingFloorPrice = null;
    slot.floorEffectiveAt = null;
    return { mode: 'same', effectiveAt: null };
  }
  const effectiveAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  slot.pendingFloorPrice = floor;
  slot.floorEffectiveAt = effectiveAt;
  return { mode: 'pending', effectiveAt };
}

function splitPaid(payAmount, floorPrice) {
  const pay = money(payAmount) || 0;
  const floor = floorPrice == null || floorPrice === '' ? null : money(floorPrice);
  const channelFee = money(pay * WX_FEE_RATE) || 0;
  const agencyFee = floor == null ? null : money(pay - floor);
  return { payAmount: pay, floorPrice: floor, channelFee, agencyFee };
}

function slotMoney(slot) {
  return {
    price: slot.price == null ? null : money(slot.price),
    floorPrice: slot.floorPrice == null ? null : money(slot.floorPrice),
    pendingFloorPrice: slot.pendingFloorPrice == null ? null : money(slot.pendingFloorPrice),
    floorEffectiveAt: slot.floorEffectiveAt || null
  };
}

module.exports = { WX_FEE_RATE, money, applyPendingFloor, assignFloor, splitPaid, slotMoney };
