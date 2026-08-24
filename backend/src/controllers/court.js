// src/controllers/court.js
const { Court, CourtSchedule, Order, User } = require('../models');
const { success, fail, BizError, ErrorCode } = require('../utils/response');
const { Op } = require('sequelize');
const { parseTableBuffer, mapRows, buildCsvTemplate, buildExcelXmlTemplate } = require('../utils/excel-import');

function calcDistance(lat1, lng1, lat2, lng2) {
  if (!lat1 || !lng1 || !lat2 || !lng2) return null;
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function pickCover(images) {
  if (Array.isArray(images) && images.length && images[0]) return images[0];
  return '';
}

async function getNearbyCourts(req, res) {
  const {
    longitude, latitude, type,
    page = 1, pageSize = 20,
    radiusKm = 50,
    keyword = ''
  } = req.query;

  const where = { status: 1 };
  const kw = String(keyword || '').trim();
  if (kw) {
    where[Op.or] = [
      { name: { [Op.like]: `%${kw}%` } },
      { address: { [Op.like]: `%${kw}%` } },
      { district: { [Op.like]: `%${kw}%` } }
    ];
  }

  const limit = Math.min(Number(pageSize) || 20, 50);
  const offset = (Number(page) - 1) * limit;
  const { rows } = await Court.findAndCountAll({
    where,
    limit: limit * 3,
    offset,
    order: [['rating', 'DESC']]
  });

  const userLng = longitude ? Number(longitude) : null;
  const userLat = latitude ? Number(latitude) : null;

  let list = rows.map(c => {
    const types = Array.isArray(c.types) && c.types.length ? c.types : (c.type ? [c.type] : []);
    const dist = (userLat && userLng && c.latitude && c.longitude)
      ? calcDistance(userLat, userLng, Number(c.latitude), Number(c.longitude)) : null;
    const images = Array.isArray(c.images) ? c.images : [];
    return {
      id: c.id, name: c.name, type: c.type, types,
      price: parseFloat(c.price),
      address: c.address,
      district: c.district || '',
      rating: parseFloat(c.rating),
      longitude: c.longitude, latitude: c.latitude,
      openTime: c.openTime,
      distance: dist != null ? Number(dist.toFixed(1)) : null,
      images,
      coverUrl: pickCover(images),
      tags: c.tags || [],
      freeSlots: [],
      distanceKm: dist != null ? Number(dist.toFixed(2)) : null
    };
  });

  if (type && type !== 'all') {
    list = list.filter(c => (c.types || []).includes(type) || c.type === type);
  }

  if (userLat && userLng) {
    list.sort((a, b) => {
      const da = a.distanceKm != null ? a.distanceKm : 9999;
      const db = b.distanceKm != null ? b.distanceKm : 9999;
      return da - db;
    });
    // 有坐标的按半径过滤；无坐标的球场仍保留（避免老数据被藏掉）
    list = list.filter(c => c.distanceKm == null || c.distanceKm <= Number(radiusKm));
  }

  list = list.slice(0, limit);
  res.json(success({
    list,
    total: list.length,
    userLocation: userLat && userLng ? { latitude: userLat, longitude: userLng } : null,
    coordinateSystem: 'GCJ-02'
  }));
}

async function getCourtDetail(req, res) {
  const court = await Court.findByPk(req.params.id);
  if (!court) throw new BizError(ErrorCode.NOT_FOUND, '场地不存在');
  const types = Array.isArray(court.types) && court.types.length ? court.types : (court.type ? [court.type] : []);
  const images = Array.isArray(court.images) ? court.images : [];
  res.json(success({
    id: court.id, name: court.name, type: court.type, types,
    price: parseFloat(court.price), address: court.address,
    longitude: court.longitude, latitude: court.latitude,
    phone: court.phone, openTime: court.openTime, closeTime: court.closeTime,
    images, coverUrl: pickCover(images), tags: court.tags || [],
    description: court.description, rating: parseFloat(court.rating),
    district: court.district, surfaceTypes: court.surfaceTypes || []
  }));
}

async function getCourtSchedule(req, res) {
  const { id } = req.params;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endDate = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

  const schedules = await CourtSchedule.findAll({
    where: { courtId: id, date: { [Op.between]: [today, endDate] } },
    order: [['date', 'ASC'], ['timeSlot', 'ASC']]
  });

  const grouped = {};
  schedules.forEach(s => {
    let dateStr;
    if (s.date instanceof Date) dateStr = s.date.toISOString().split('T')[0];
    else if (typeof s.date === 'string') dateStr = s.date.substring(0, 10);
    else dateStr = String(s.date).substring(0, 10);
    if (!grouped[dateStr]) grouped[dateStr] = [];
    grouped[dateStr].push({
      id: s.id,
      timeSlot: s.timeSlot,
      status: s.status,
      price: parseFloat(s.price || 0)
    });
  });

  res.json(success({ courtId: id, schedules: grouped }));
}

async function adminListCourts(req, res) {
  const admin = req.admin;
  const { status, page = 1, pageSize = 20 } = req.query;
  const where = {};
  if (admin.role === 'court_admin') where.ownerId = admin.id;
  if (status !== undefined) where.status = Number(status);
  const { rows, count } = await Court.findAndCountAll({
    where, limit: Number(pageSize),
    offset: (Number(page) - 1) * Number(pageSize),
    order: [['created_at', 'DESC']]
  });
  res.json(success({
    list: rows.map(c => ({
      id: c.id, name: c.name, type: c.type, types: c.types || [],
      price: parseFloat(c.price),
      address: c.address, phone: c.phone, rating: parseFloat(c.rating),
      district: c.district || '', contactName: c.contactName || '',
      ownerId: c.ownerId, claimed: !!c.ownerId,
      status: c.status, createdAt: c.createdAt,
      images: c.images || [], coverUrl: pickCover(c.images)
    })),
    total: count
  }));
}

async function adminCreateCourt(req, res) {
  const admin = req.admin;
  if (!['super_admin', 'court_admin'].includes(admin.role)) {
    throw new BizError(ErrorCode.FORBIDDEN, '无权限');
  }
  const court = await Court.create({
    ...req.body, ownerId: admin.id,
    status: admin.role === 'super_admin' ? 1 : 2
  });
  res.json(success({ id: court.id, name: court.name }));
}

async function adminGetCourtDetail(req, res) {
  const { id } = req.params;
  const admin = req.admin;
  const court = await Court.findByPk(id);
  if (!court) throw new BizError(ErrorCode.NOT_FOUND, '场地不存在');
  if (admin.role === 'court_admin' && court.ownerId !== admin.id) {
    throw new BizError(ErrorCode.FORBIDDEN, '无权限查看该场地');
  }
  res.json(success({
    id: court.id, name: court.name, type: court.type, types: court.types || [],
    price: parseFloat(court.price), address: court.address,
    longitude: court.longitude ? parseFloat(court.longitude) : null,
    latitude: court.latitude ? parseFloat(court.latitude) : null,
    phone: court.phone, contactName: court.contactName || '',
    openTime: court.openTime, closeTime: court.closeTime,
    images: court.images || [], tags: court.tags || [],
    description: court.description, status: court.status,
    rating: parseFloat(court.rating), ownerId: court.ownerId,
    claimed: !!court.ownerId, district: court.district || '',
    createdAt: court.createdAt, updatedAt: court.updatedAt
  }));
}

async function adminUpdateCourt(req, res) {
  const { id } = req.params;
  const admin = req.admin;
  const court = await Court.findByPk(id);
  if (!court) throw new BizError(ErrorCode.NOT_FOUND, '场地不存在');
  if (admin.role === 'court_admin' && court.ownerId !== admin.id) {
    throw new BizError(ErrorCode.FORBIDDEN, '无权限编辑该场地');
  }
  const allowed = ['name', 'type', 'types', 'address', 'longitude', 'latitude', 'phone', 'contactName', 'price',
    'openTime', 'closeTime', 'images', 'tags', 'description', 'status', 'district'];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }
  if (updates.status !== undefined && admin.role === 'court_admin') {
    if (Number(updates.status) !== 0) updates.status = 2;
  }
  await court.update(updates);
  res.json(success({ id: court.id, message: '更新成功' }));
}

async function adminDeleteCourt(req, res) {
  const { id } = req.params;
  const admin = req.admin;
  const court = await Court.findByPk(id);
  if (!court) throw new BizError(ErrorCode.NOT_FOUND, '场地不存在');
  if (admin.role === 'court_admin' && court.ownerId !== admin.id) {
    throw new BizError(ErrorCode.FORBIDDEN, '无权限删除该场地');
  }
  const activeOrders = await Order.count({
    where: {
      courtId: id,
      status: { [Op.in]: ['pending', 'booked', 'paid'] }
    }
  });
  if (activeOrders > 0) {
    throw new BizError(ErrorCode.CONFLICT, `该场地有 ${activeOrders} 个未完成订单，请先处理后再删除`);
  }
  await court.update({ status: -1 });
  res.json(success({ id, message: '已删除' }));
}

async function auditCourt(req, res) {
  const { id } = req.params;
  const { approved, reason } = req.body;
  const court = await Court.findByPk(id);
  if (!court) throw new BizError(ErrorCode.NOT_FOUND, '场地不存在');
  if (court.status !== 2) {
    throw new BizError(ErrorCode.CONFLICT, `只能审核待审核场地（当前状态=${court.status}）`);
  }
  court.status = approved ? 1 : 3;
  if (!approved && reason) {
    const oldDesc = court.description || '';
    court.description = oldDesc ? `${oldDesc}\n\n[REJECTED] ${reason}` : `[REJECTED] ${reason}`;
  } else if (approved) {
    const oldDesc = court.description || '';
    court.description = oldDesc.replace(/\n\n\[REJECTED\][^\n]*/g, '').replace(/^\[REJECTED\][^\n]*\n*/g, '');
  }
  await court.save();
  res.json(success({
    id: court.id, status: court.status,
    message: approved ? '审核通过' : `已拒绝: ${reason || '无理由'}`
  }));
}

async function publishFreeSlots(req, res) {
  const { id } = req.params;
  const userId = req.user.id;
  const { slots } = req.body;
  if (!Array.isArray(slots) || slots.length === 0) {
    throw new BizError(ErrorCode.PARAM_INVALID, '请提供空闲时段');
  }
  const court = await Court.findByPk(id);
  if (!court) throw new BizError(ErrorCode.NOT_FOUND, '场地不存在');
  if (Number(court.ownerId) !== Number(userId)) {
    throw new BizError(ErrorCode.FORBIDDEN, '仅场地所有者可发布空闲信息');
  }
  if (court.status !== 1) {
    throw new BizError(ErrorCode.FORBIDDEN, '场地审核通过后才能发布空闲信息');
  }
  const records = [];
  for (const slot of slots) {
    if (!slot.date || !slot.timeSlot) continue;
    const existing = await CourtSchedule.findOne({
      where: { courtId: id, date: slot.date, timeSlot: slot.timeSlot }
    });
    if (existing) continue;
    const rec = await CourtSchedule.create({
      courtId: id, date: slot.date, timeSlot: slot.timeSlot,
      price: slot.price != null ? slot.price : court.price, status: 'free'
    });
    records.push(rec);
  }
  res.json(success({
    published: records.length,
    slots: records.map(r => ({
      id: r.id, date: r.date, timeSlot: r.timeSlot,
      price: parseFloat(r.price), status: r.status
    }))
  }, `成功发布 ${records.length} 个空闲时段`));
}

async function getFreeSlots(req, res) {
  const { id } = req.params;
  const { dateFrom, dateTo } = req.query;
  const today = new Date().toISOString().slice(0, 10);
  const from = dateFrom || today;
  const to = dateTo || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const slots = await CourtSchedule.findAll({
    where: { courtId: id, date: { [Op.between]: [from, to] }, status: 'free' },
    order: [['date', 'ASC'], ['timeSlot', 'ASC']]
  });
  res.json(success({
    list: slots.map(s => ({
      id: s.id, date: s.date, timeSlot: s.timeSlot,
      price: parseFloat(s.price), status: s.status
    })),
    dateFrom: from, dateTo: to
  }));
}

async function evaluateCourt(req, res) {
  const { id } = req.params;
  const { score, content } = req.body || {};
  const rating = Number(score);
  if (!rating || rating < 1 || rating > 5) {
    throw new BizError(ErrorCode.PARAM_INVALID, '评分需为 1-5 分');
  }
  const court = await Court.findByPk(id);
  if (!court) throw new BizError(ErrorCode.NOT_FOUND, '场地不存在');
  const old = parseFloat(court.rating) || 0;
  const next = old > 0 ? Number(((old * 0.8) + (rating * 0.2)).toFixed(1)) : rating;
  court.rating = next;
  if (content) {
    const note = String(content).slice(0, 200);
    court.description = (court.description || '') + (note ? `\n[评价] ${note}` : '');
  }
  await court.save();
  res.json(success({ id: court.id, rating: next }, '评价成功'));
}

function normCourtName(s) {
  return String(s || '').replace(/\s+/g, '').replace(/（/g, '(').replace(/）/g, ')').toLowerCase();
}

async function adminImportTemplate(req, res) {
  const format = String(req.query.format || 'xls').toLowerCase();
  if (format === 'csv') {
    const csv = buildCsvTemplate();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="court-import.csv"');
    return res.send(csv);
  }
  const xml = buildExcelXmlTemplate();
  res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="court-import.xls"');
  return res.send(xml);
}

async function adminImportCourts(req, res) {
  const body = req.body || {};
  let rows = [];
  if (Array.isArray(body.rows) && body.rows.length) {
    rows = body.rows.map((r) => ({
      name: String(r.name || r['球场名称'] || '').trim(),
      district: String(r.district || r['省市区'] || r['所在区域'] || '').trim(),
      address: String(r.address || r['详细地址'] || r['地址'] || '').trim(),
      contactName: String(r.contactName || r['联系人'] || '').trim(),
      phone: String(r.phone || r['联系电话'] || r['电话'] || '').trim()
    }));
  } else if (body.base64 || body.csv) {
    const raw = body.base64 || body.csv;
    const buf = Buffer.from(String(raw).replace(/^data:[^;]+;base64,/, ''), body.csv && !body.base64 ? 'utf8' : 'base64');
    const table = parseTableBuffer(buf, body.filename || '');
    rows = mapRows(table);
  } else {
    throw new BizError(ErrorCode.PARAM_INVALID, '请上传 Excel / CSV 或传入 rows');
  }

  rows = rows.filter((r) => r.name);
  if (!rows.length) throw new BizError(ErrorCode.PARAM_INVALID, '没有可导入的球场（缺少球场名称）');
  if (rows.length > 500) throw new BizError(ErrorCode.PARAM_INVALID, '单次最多导入 500 条');

  const existing = await Court.findAll({
    where: { status: { [Op.ne]: -1 } },
    attributes: ['id', 'name', 'address']
  });
  const existedNames = new Set(existing.map((c) => normCourtName(c.name)));

  const created = [];
  const skipped = [];
  const failed = [];

  for (const row of rows) {
    const name = String(row.name || '').slice(0, 64);
    const key = normCourtName(name);
    if (!key) {
      failed.push({ name, reason: '名称为空' });
      continue;
    }
    if (existedNames.has(key)) {
      skipped.push({ name, reason: '已存在同名球场' });
      continue;
    }
    try {
      const court = await Court.create({
        name,
        ownerId: null,
        type: '11人制',
        types: ['11人制'],
        address: String(row.address || '').slice(0, 255),
        district: String(row.district || '').slice(0, 64),
        phone: String(row.phone || '').slice(0, 20),
        contactName: String(row.contactName || '').slice(0, 32),
        price: 0,
        openTime: '08:00:00',
        closeTime: '22:00:00',
        surfaceType: '人工草地',
        surfaceTypes: ['人工草地'],
        description: '',
        status: 1
      });
      existedNames.add(key);
      created.push({ id: court.id, name: court.name });
    } catch (err) {
      failed.push({ name, reason: String(err.message || err).slice(0, 120) });
    }
  }

  res.json(success({
    created: created.length,
    skipped: skipped.length,
    failed: failed.length,
    createdList: created,
    skippedList: skipped,
    failedList: failed
  }, `导入完成：新增 ${created.length}，跳过 ${skipped.length}，失败 ${failed.length}`));
}

module.exports = {
  getNearbyCourts, getCourtDetail, getCourtSchedule, getFreeSlots, publishFreeSlots,
  evaluateCourt,
  adminListCourts, adminGetCourtDetail, adminCreateCourt, adminUpdateCourt,
  adminDeleteCourt, auditCourt, adminImportCourts, adminImportTemplate
};
