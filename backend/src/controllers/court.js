// src/controllers/court.js
// 场地控制器
const { Court, CourtSchedule, Order, User } = require('../models');
const { success, fail, BizError, ErrorCode } = require('../utils/response');
const { Op } = require('sequelize');

/**
 * 计算两点间距离（公里）- Haversine 公式
 * 用于附近球场排序
 */
function calcDistance(lat1, lng1, lat2, lng2) {
  if (!lat1 || !lng1 || !lat2 || !lng2) return null;
  const R = 6371;  // 地球半径 km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * GET /api/v1/courts/nearby
 * 附近场地（按距离排序）
 * query: longitude, latitude, type, page, pageSize, radiusKm
 */
async function getNearbyCourts(req, res) {
  const { longitude, latitude, type, page = 1, pageSize = 10, radiusKm = 50 } = req.query;

  const where = { status: 1 };  // 1=营业中的场地
  if (type && type !== 'all') where.type = type;

  const offset = (Number(page) - 1) * Number(pageSize);
  const { rows, count } = await Court.findAndCountAll({
    where,
    limit: Number(pageSize),
    offset,
    order: [['rating', 'DESC']]
  });

  const userLng = longitude ? Number(longitude) : null;
  const userLat = latitude ? Number(latitude) : null;

  // 计算距离并按距离排序（如果有用户坐标）
  let list = rows.map(c => {
    const dist = (userLat && userLng)
      ? calcDistance(userLat, userLng, Number(c.latitude), Number(c.longitude))
      : null;
    return {
      id: c.id,
      name: c.name,
      type: c.type,
      price: parseFloat(c.price),
      address: c.address,
      rating: parseFloat(c.rating),
      longitude: c.longitude,
      latitude: c.latitude,
      images: c.images || [],
      tags: c.tags || [],
      distanceKm: dist ? Number(dist.toFixed(2)) : null
    };
  });

  if (userLat && userLng) {
    list.sort((a, b) => (a.distanceKm || 999) - (b.distanceKm || 999));
    // 范围过滤（默认 50km）
    list = list.filter(c => !c.distanceKm || c.distanceKm <= Number(radiusKm));
  }

  res.json(success({
    list,
    total: list.length,
    userLocation: userLat && userLng ? { latitude: userLat, longitude: userLng } : null,
    coordinateSystem: 'WGS-84'  // 腾讯地图返回 GCJ-02，小程序需转换（后续接入 SDK 时处理）
  }));
}

/**
 * GET /api/v1/courts/:id
 * 场地详情
 */
async function getCourtDetail(req, res) {
  const { id } = req.params;
  const court = await Court.findByPk(id);

  if (!court) {
    throw new BizError(ErrorCode.NOT_FOUND, '场地不存在');
  }

  res.json(success({
    id: court.id,
    name: court.name,
    type: court.type,
    price: parseFloat(court.price),
    address: court.address,
    longitude: court.longitude,
    latitude: court.latitude,
    phone: court.phone,
    openTime: court.openTime,
    closeTime: court.closeTime,
    images: court.images || [],
    tags: court.tags || [],
    description: court.description,
    rating: parseFloat(court.rating)
  }));
}

/**
 * GET /api/v1/courts/:id/schedule
 * 场地排期（未来 7 天）
 */
async function getCourtSchedule(req, res) {
  const { id } = req.params;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endDate = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

  const schedules = await CourtSchedule.findAll({
    where: {
      courtId: id,
      date: { [Op.between]: [today, endDate] }
    },
    order: [['date', 'ASC'], ['timeSlot', 'ASC']]
  });

  // 按日期分组（兼容 Date 对象 / 字符串 / DATEONLY）
  const grouped = {};
  schedules.forEach(s => {
    let dateStr;
    if (s.date instanceof Date) {
      dateStr = s.date.toISOString().split('T')[0];
    } else if (typeof s.date === 'string') {
      dateStr = s.date.substring(0, 10);
    } else {
      dateStr = String(s.date).substring(0, 10);
    }
    if (!grouped[dateStr]) grouped[dateStr] = [];
    grouped[dateStr].push({
      timeSlot: s.timeSlot,
      status: s.status,
      price: parseFloat(s.price || 0)
    });
  });

  res.json(success({
    courtId: id,
    schedules: grouped
  }));
}

// ===== 管理员接口 =====

/**
 * GET /api/admin/courts
 * 管理员查看场地列表
 */
async function adminListCourts(req, res) {
  const admin = req.admin;
  const { status, page = 1, pageSize = 20 } = req.query;
  const where = {};

  // 场地方管理员只能看自己的场地
  if (admin.role === 'court_admin') {
    where.ownerId = admin.id;
  }
  if (status !== undefined) where.status = Number(status);

  const { rows, count } = await Court.findAndCountAll({
    where,
    limit: Number(pageSize),
    offset: (Number(page) - 1) * Number(pageSize),
    order: [['created_at', 'DESC']]
  });

  res.json(success({
    list: rows.map(c => ({
      id: c.id,
      name: c.name,
      type: c.type,
      price: parseFloat(c.price),
      address: c.address,
      phone: c.phone,
      rating: parseFloat(c.rating),
      status: c.status,
      createdAt: c.createdAt
    })),
    total: count
  }));
}

/**
 * POST /api/admin/courts
 * 创建场地
 */
async function adminCreateCourt(req, res) {
  const admin = req.admin;
  if (!['super_admin', 'court_admin'].includes(admin.role)) {
    throw new BizError(ErrorCode.FORBIDDEN, '无权限');
  }

  const court = await Court.create({
    ...req.body,
    ownerId: admin.id,
    status: admin.role === 'super_admin' ? 1 : 2  // 场地方创建需要审核
  });

  res.json(success({
    id: court.id,
    name: court.name
  }));
}

/**
 * GET /api/admin/courts/:id
 * 管理员查看场地详情
 */
async function adminGetCourtDetail(req, res) {
  const { id } = req.params;
  const admin = req.admin;

  const court = await Court.findByPk(id);
  if (!court) {
    throw new BizError(ErrorCode.NOT_FOUND, '场地不存在');
  }

  // 场地方管理员只能看自己的场地
  if (admin.role === 'court_admin' && court.ownerId !== admin.id) {
    throw new BizError(ErrorCode.FORBIDDEN, '无权限查看该场地');
  }

  res.json(success({
    id: court.id,
    name: court.name,
    type: court.type,
    price: parseFloat(court.price),
    address: court.address,
    longitude: court.longitude ? parseFloat(court.longitude) : null,
    latitude: court.latitude ? parseFloat(court.latitude) : null,
    phone: court.phone,
    openTime: court.openTime,
    closeTime: court.closeTime,
    images: court.images || [],
    tags: court.tags || [],
    description: court.description,
    status: court.status,
    rating: parseFloat(court.rating),
    ownerId: court.ownerId,
    createdAt: court.createdAt,
    updatedAt: court.updatedAt
  }));
}

/**
 * PUT /api/admin/courts/:id
 * 管理员更新场地（场地方编辑自己的 / 超管编辑所有）
 */
async function adminUpdateCourt(req, res) {
  const { id } = req.params;
  const admin = req.admin;

  const court = await Court.findByPk(id);
  if (!court) {
    throw new BizError(ErrorCode.NOT_FOUND, '场地不存在');
  }

  // 场地方管理员只能编辑自己的场地
  if (admin.role === 'court_admin' && court.ownerId !== admin.id) {
    throw new BizError(ErrorCode.FORBIDDEN, '无权限编辑该场地');
  }

  // 白名单字段，防止注入
  const allowed = ['name', 'type', 'address', 'longitude', 'latitude', 'phone', 'price',
    'openTime', 'closeTime', 'images', 'tags', 'description', 'status'];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  // 场地方管理员改 status 需要审核
  if (updates.status !== undefined && admin.role === 'court_admin') {
    if (Number(updates.status) === 0) {
      // 下架直接允许
    } else {
      // 上架需要重审
      updates.status = 2;
    }
  }

  await court.update(updates);

  res.json(success({
    id: court.id,
    message: '更新成功'
  }));
}

/**
 * DELETE /api/admin/courts/:id
 * 管理员删除场地（软删除：status = -1 避免破坏订单外键）
 */
async function adminDeleteCourt(req, res) {
  const { id } = req.params;
  const admin = req.admin;

  const court = await Court.findByPk(id);
  if (!court) {
    throw new BizError(ErrorCode.NOT_FOUND, '场地不存在');
  }

  // 场地方管理员只能删除自己的场地
  if (admin.role === 'court_admin' && court.ownerId !== admin.id) {
    throw new BizError(ErrorCode.FORBIDDEN, '无权限删除该场地');
  }

  // 检查是否有关联未完成订单
  const { Order } = require('../models/Order');
  const activeOrders = await Order.count({
    where: {
      courtId: id,
      status: { [require('sequelize').Op.in]: ['pending', 'paid', 'confirmed'] }
    }
  });

  if (activeOrders > 0) {
    throw new BizError(ErrorCode.CONFLICT,
      `该场地有 ${activeOrders} 个未完成订单，请先处理后再删除`);
  }

  // 软删除：标记 status = -1
  await court.update({ status: -1 });
  res.json(success({ id, message: '已删除' }));
}

/**
 * POST /api/admin/courts/:id/audit
 * 审核场地（仅 super_admin）
 */
async function auditCourt(req, res) {
  const { id } = req.params;
  const { approved, reason } = req.body;

  const court = await Court.findByPk(id);
  if (!court) {
    throw new BizError(ErrorCode.NOT_FOUND, '场地不存在');
  }
  if (court.status !== 2) {
    throw new BizError(ErrorCode.CONFLICT, `只能审核待审核场地（当前状态=${court.status}）`);
  }

  court.status = approved ? 1 : 3;  // 2026-07-30: 拒绝改为 3（原来是 0=休息，语义冲突）
  // 拒绝理由存到 description 末尾（避免数据库 schema 变更）
  if (!approved && reason) {
    const oldDesc = court.description || '';
    const auditTag = `[REJECTED] ${reason}`;
    court.description = oldDesc ? `${oldDesc}\n\n${auditTag}` : auditTag;
  } else if (approved) {
    // 通过时清除旧拒绝标记
    const oldDesc = court.description || '';
    court.description = oldDesc.replace(/\n\n\[REJECTED\][^\n]*/, '').replace(/^\[REJECTED\][^\n]*\n*/, '');
  }
  await court.save();

  res.json(success({
    id: court.id,
    status: court.status,
    message: approved ? '审核通过' : `已拒绝: ${reason || '无理由'}`
  }));
}

/**
 * POST /api/v1/courts/:id/free-slots
 * 球场方发布场地空闲信息（招录个人报名）
 * 只允许 owner（球场方管理员）调用
 * body: [{ date: '2026-07-28', timeSlot: '19:00-21:00', price: 300 }, ...]
 */
async function publishFreeSlots(req, res) {
  const { id } = req.params;
  const userId = req.user.id;
  const { slots } = req.body;

  if (!Array.isArray(slots) || slots.length === 0) {
    throw new BizError(ErrorCode.PARAM_INVALID, '请提供空闲时段');
  }

  const court = await Court.findByPk(id);
  if (!court) {
    throw new BizError(ErrorCode.NOT_FOUND, '场地不存在');
  }

  // 权限：仅场地所有者（球场方）可发布
  if (court.ownerId !== userId) {
    throw new BizError(ErrorCode.FORBIDDEN, '仅场地所有者可发布空闲信息');
  }

  // 状态检查：审核通过的场地才能发布
  if (court.status !== 1) {
    throw new BizError(ErrorCode.FORBIDDEN, '场地审核通过后才能发布空闲信息');
  }

  const { CourtSchedule } = require('../models');
  const records = [];
  for (const slot of slots) {
    if (!slot.date || !slot.timeSlot) continue;
    // 去重：如果已存在则跳过
    const existing = await CourtSchedule.findOne({
      where: { courtId: id, date: slot.date, timeSlot: slot.timeSlot }
    });
    if (existing) continue;

    const rec = await CourtSchedule.create({
      courtId: id,
      date: slot.date,
      timeSlot: slot.timeSlot,
      price: slot.price || court.price,
      status: 'free'
    });
    records.push(rec);
  }

  res.json(success({
    published: records.length,
    slots: records.map(r => ({
      id: r.id,
      date: r.date,
      timeSlot: r.timeSlot,
      price: parseFloat(r.price),
      status: r.status
    }))
  }, `成功发布 ${records.length} 个空闲时段`));
}

/**
 * GET /api/v1/courts/:id/free-slots
 * 获取场地未来空闲时段（供个人报名查看）
 * query: dateFrom, dateTo
 */
async function getFreeSlots(req, res) {
  const { id } = req.params;
  const { dateFrom, dateTo } = req.query;

  const today = new Date().toISOString().slice(0, 10);  // YYYY-MM-DD
  const from = dateFrom || today;
  const to = dateTo || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  const { CourtSchedule } = require('../models');
  const slots = await CourtSchedule.findAll({
    where: {
      courtId: id,
      date: { [Op.between]: [from, to] },
      status: 'free'
    },
    order: [['date', 'ASC'], ['timeSlot', 'ASC']]
  });

  res.json(success({
    list: slots.map(s => ({
      id: s.id,
      date: s.date,
      timeSlot: s.timeSlot,
      price: parseFloat(s.price),
      status: s.status
    })),
    dateFrom: from,
    dateTo: to
  }));
}

module.exports = {
  getNearbyCourts,
  getCourtDetail,
  getCourtSchedule,
  getFreeSlots,
  publishFreeSlots,
  adminListCourts,
  adminGetCourtDetail,
  adminCreateCourt,
  adminUpdateCourt,
  adminDeleteCourt,
  auditCourt
};