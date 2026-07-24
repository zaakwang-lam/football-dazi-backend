// src/controllers/court.js
// 场地控制器
const { Court, CourtSchedule, Order, User } = require('../models');
const { success, fail, BizError, ErrorCode } = require('../utils/response');
const { Op } = require('sequelize');

/**
 * GET /api/v1/courts/nearby
 * 附近场地（按距离排序）
 */
async function getNearbyCourts(req, res) {
  const { longitude, latitude, type, page = 1, pageSize = 10 } = req.query;

  const where = { status: 1 };
  if (type && type !== 'all') where.type = type;

  const offset = (Number(page) - 1) * Number(pageSize);
  const { rows, count } = await Court.findAndCountAll({
    where,
    limit: Number(pageSize),
    offset,
    order: [['rating', 'DESC']]
  });

  res.json(success({
    list: rows.map(c => ({
      id: c.id,
      name: c.name,
      type: c.type,
      price: parseFloat(c.price),
      address: c.address,
      rating: parseFloat(c.rating),
      longitude: c.longitude,
      latitude: c.latitude,
      images: c.images || [],
      tags: c.tags || []
    })),
    total: count
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

  court.status = approved ? 1 : 0;
  await court.save();

  res.json(success({
    id: court.id,
    status: court.status,
    message: approved ? '审核通过' : `已拒绝: ${reason || '无'}`
  }));
}

module.exports = {
  getNearbyCourts,
  getCourtDetail,
  getCourtSchedule,
  adminListCourts,
  adminCreateCourt,
  auditCourt
};