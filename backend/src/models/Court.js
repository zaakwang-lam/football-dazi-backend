// src/models/Court.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Court = sequelize.define('Court', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(64), allowNull: false },
    ownerId: { type: DataTypes.INTEGER, allowNull: false, field: 'owner_id' },
    type: { type: DataTypes.ENUM('11人制', '7人制', '5人制'), allowNull: false },
    address: { type: DataTypes.STRING(255) },
    longitude: { type: DataTypes.DECIMAL(10, 6) },
    latitude: { type: DataTypes.DECIMAL(9, 6) },
    phone: { type: DataTypes.STRING(20) },
    price: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    openTime: { type: DataTypes.TIME, field: 'open_time' },
    closeTime: { type: DataTypes.TIME, field: 'close_time' },
    surfaceType: { type: DataTypes.ENUM('人工草地', '天然草地', '硬地'), defaultValue: '人工草地', field: 'surface_type' },  // 场地性质（旧字段，保留作 fallback）
    surfaceTypes: { type: DataTypes.JSON, field: 'surface_types' },  // 场地性质多选 ["人工草地","天然草地","硬地"] (2026-07-28 新增)
    district: { type: DataTypes.STRING(32) },  // 行政区（天河/海珠/越秀/荔湾/白云/黄埔/番禺/花都/南沙/从化/增城）11选1 (2026-07-28 新增)
    images: { type: DataTypes.JSON },
    tags: { type: DataTypes.JSON },
    description: { type: DataTypes.TEXT },
    openHours: { type: DataTypes.JSON, field: 'open_hours' },  // 按周多时段 {周一:[{start:"18:00",end:"22:00"}], ...} (2026-07-28 新增)
    status: { type: DataTypes.TINYINT, defaultValue: 2 },  // 1营业 0休息 2审核中
    rating: { type: DataTypes.DECIMAL(2, 1), defaultValue: 5.0 }
  }, {
    tableName: 'courts'
  });
  return Court;
};