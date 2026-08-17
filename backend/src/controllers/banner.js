// src/controllers/banner.js
const fs = require('fs');
const path = require('path');
const { Banner } = require('../models');
const { success, BizError, ErrorCode } = require('../utils/response');

const MAX_BANNERS = 5;

/** 小程序公开：启用中的 Banner，按 sort 升序 */
async function listPublic(req, res) {
  const rows = await Banner.findAll({
    where: { status: 1 },
    order: [['sort', 'ASC'], ['id', 'ASC']],
    limit: MAX_BANNERS
  });
  res.json(success({
    list: rows.map(b => ({
      id: b.id,
      imageUrl: b.imageUrl,
      title: b.title || '',
      linkUrl: b.linkUrl || ''
    }))
  }));
}

/** 运营后台：全部 Banner */
async function adminList(req, res) {
  const rows = await Banner.findAll({
    order: [['sort', 'ASC'], ['id', 'ASC']]
  });
  res.json(success({
    list: rows.map(b => ({
      id: b.id,
      imageUrl: b.imageUrl,
      title: b.title || '',
      linkUrl: b.linkUrl || '',
      sort: b.sort,
      status: b.status,
      createdAt: b.createdAt
    })),
    max: MAX_BANNERS,
    tip: '建议尺寸 750×360 像素（宽×高），JPG/PNG，单张不超过 2MB，最多 5 张'
  }));
}

/** 上传一张 Banner（base64），最多 5 张 */
async function adminUpload(req, res) {
  const count = await Banner.count();
  if (count >= MAX_BANNERS) {
    throw new BizError(ErrorCode.PARAM_INVALID, `最多只能上传 ${MAX_BANNERS} 张轮播图`);
  }
  const { base64, mimeType = 'image/jpeg', title = '', linkUrl = '' } = req.body || {};
  if (!base64 || typeof base64 !== 'string') {
    throw new BizError(ErrorCode.PARAM_INVALID, '缺少图片');
  }
  if (base64.length > 3 * 1024 * 1024) {
    throw new BizError(ErrorCode.PARAM_INVALID, '图片过大，请压缩后重试（建议 ≤2MB）');
  }
  const clean = base64.replace(/^data:image\/[^;]+;base64,/, '');
  const buffer = Buffer.from(clean, 'base64');
  if (!buffer.length || buffer.length > 2.5 * 1024 * 1024) {
    throw new BizError(ErrorCode.PARAM_INVALID, '图片过大，请压缩后重试');
  }
  const ext = String(mimeType).toLowerCase().includes('png') ? 'png' : 'jpg';
  const uploadDir = path.join(__dirname, '../../uploads/banners');
  fs.mkdirSync(uploadDir, { recursive: true });
  const fileName = `banner_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  fs.writeFileSync(path.join(uploadDir, fileName), buffer);
  const publicBase = process.env.PUBLIC_BASE_URL || 'https://footballdazi.cn';
  const imageUrl = `${publicBase.replace(/\/$/, '')}/uploads/banners/${fileName}`;

  const maxSort = await Banner.max('sort');
  const banner = await Banner.create({
    imageUrl,
    title: String(title || '').slice(0, 64),
    linkUrl: String(linkUrl || '').slice(0, 255),
    sort: (maxSort != null ? Number(maxSort) : -1) + 1,
    status: 1
  });

  res.json(success({
    id: banner.id,
    imageUrl: banner.imageUrl,
    title: banner.title,
    sort: banner.sort
  }, '上传成功'));
}

/** 删除 */
async function adminDelete(req, res) {
  const banner = await Banner.findByPk(req.params.id);
  if (!banner) throw new BizError(ErrorCode.NOT_FOUND, 'Banner 不存在');
  // 尝试删除本地文件
  try {
    const m = String(banner.imageUrl).match(/\/uploads\/banners\/([^/?#]+)/);
    if (m) {
      const fp = path.join(__dirname, '../../uploads/banners', m[1]);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }
  } catch (_) { /* ignore */ }
  await banner.destroy();
  res.json(success(null, '已删除'));
}

/** 更新排序/标题/状态 */
async function adminUpdate(req, res) {
  const banner = await Banner.findByPk(req.params.id);
  if (!banner) throw new BizError(ErrorCode.NOT_FOUND, 'Banner 不存在');
  const { title, linkUrl, sort, status } = req.body || {};
  if (title !== undefined) banner.title = String(title).slice(0, 64);
  if (linkUrl !== undefined) banner.linkUrl = String(linkUrl).slice(0, 255);
  if (sort !== undefined) banner.sort = Number(sort) || 0;
  if (status !== undefined) banner.status = Number(status) ? 1 : 0;
  await banner.save();
  res.json(success({
    id: banner.id,
    imageUrl: banner.imageUrl,
    title: banner.title,
    sort: banner.sort,
    status: banner.status
  }, '已更新'));
}

module.exports = {
  listPublic,
  adminList,
  adminUpload,
  adminDelete,
  adminUpdate
};
