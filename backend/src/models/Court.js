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
    images: { type: DataTypes.JSON },
    tags: { type: DataTypes.JSON },
    description: { type: DataTypes.TEXT },
    status: { type: DataTypes.TINYINT, defaultValue: 2 },  // 1营业 0休息 2审核中
    rating: { type: DataTypes.DECIMAL(2, 1), defaultValue: 5.0 }
  }, {
    tableName: 'courts'
  });
  return Court;
};