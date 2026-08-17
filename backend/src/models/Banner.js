// src/models/Banner.js
// 小程序首页置顶轮播图（运营后台管理，最多 5 张）
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Banner = sequelize.define('Banner', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    imageUrl: { type: DataTypes.STRING(512), allowNull: false, field: 'image_url' },
    title: { type: DataTypes.STRING(64), defaultValue: '' },
    linkUrl: { type: DataTypes.STRING(255), field: 'link_url', defaultValue: '' },
    sort: { type: DataTypes.INTEGER, defaultValue: 0 },
    status: { type: DataTypes.TINYINT, defaultValue: 1 } // 1=启用 0=禁用
  }, {
    tableName: 'banners'
  });
  return Banner;
};
