// src/models/Court.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Court = sequelize.define('Court', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(64), allowNull: false },
    ownerId: { type: DataTypes.INTEGER, allowNull: false, field: 'owner_id' },
    // 足球搭子支持 11/8/7/5/3 人制；生产数据库需执行对应 migration 才能接受新增枚举值。
    type: { type: DataTypes.ENUM('11人制', '8人制', '7人制', '5人制', '3人制'), allowNull: false },
    address: { type: DataTypes.STRING(255) },
    longitude: { type: DataTypes.DECIMAL(10, 6) },
    latitude: { type: DataTypes.DECIMAL(9, 6) },
    phone: { type: DataTypes.STRING(20) },
    price: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    openTime: { type: DataTypes.TIME, field: 'open_time' },
    closeTime: { type: DataTypes.TIME, field: 'close_time' },
    surfaceType: { type: DataTypes.STRING(32), defaultValue: '人工草地', field: 'surface_type', validate: { isIn: [['人工草地','天然草地','硬地']] } },
    surfaceTypes: { type: DataTypes.JSON, field: 'surface_types' },
    district: { type: DataTypes.STRING(32) },
    images: { type: DataTypes.JSON },
    tags: { type: DataTypes.JSON },
    description: { type: DataTypes.TEXT },
    openHours: { type: DataTypes.JSON, field: 'open_hours' },
    status: { type: DataTypes.TINYINT, defaultValue: 2 },
    rating: { type: DataTypes.DECIMAL(2, 1), defaultValue: 5.0 }
  }, { tableName: 'courts' });
  return Court;
};