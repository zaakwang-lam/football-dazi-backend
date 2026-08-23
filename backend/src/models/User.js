// src/models/User.js
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const User = sequelize.define('User', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    openid: { type: DataTypes.STRING(64), unique: true, allowNull: true },
    unionid: { type: DataTypes.STRING(64), allowNull: true },
    nickname: { type: DataTypes.STRING(64), allowNull: true },
    avatarUrl: { type: DataTypes.STRING(255), field: 'avatar_url' },
    phone: { type: DataTypes.STRING(20), allowNull: true },
    gender: { type: DataTypes.TINYINT, defaultValue: 0 },
    city: { type: DataTypes.STRING(32), defaultValue: '广州' },
    level: { type: DataTypes.STRING(32), defaultValue: '业余' },
    role: { type: DataTypes.ENUM('user', 'court', 'admin'), allowNull: true, defaultValue: null, field: 'role' },
    roles: {
      type: DataTypes.JSON,
      allowNull: true,
      field: 'roles',
      get() {
        const raw = this.getDataValue('roles');
        if (!raw) return [];
        return Array.isArray(raw) ? raw : (typeof raw === 'string' ? JSON.parse(raw) : []);
      },
      set(val) {
        if (!val || (Array.isArray(val) && val.length === 0)) {
          this.setDataValue('roles', null);
          this.changed('roles', true);
        } else {
          this.setDataValue('roles', Array.isArray(val) ? val : [val]);
          this.changed('roles', true);
        }
      }
    },
    courtId: { type: DataTypes.INTEGER, allowNull: true, field: 'court_id' },
    status: { type: DataTypes.TINYINT, defaultValue: 1 }
  }, {
    tableName: 'users'
  });
  return User;
};
