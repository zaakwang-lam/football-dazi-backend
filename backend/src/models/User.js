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
    gender: { type: DataTypes.TINYINT, defaultValue: 0 },  // 0未知 1男 2女
    city: { type: DataTypes.STRING(32), defaultValue: '广州' },
    level: { type: DataTypes.STRING(32), defaultValue: '业余' },
    role: { type: DataTypes.ENUM('user', 'court', 'admin'), allowNull: true, defaultValue: null, field: 'role' },  // 仅 registerRole 后写入；未选身份保持 null
    roles: {
      type: DataTypes.JSON,
      allowNull: true,
      field: 'roles',
      // 【2026-08-04 #22】get/set hook - 避免 findByPk 拿到字符串 vs 数组类型混乱
      get() {
        const raw = this.getDataValue('roles');
        if (!raw) return [];
        return Array.isArray(raw) ? raw : (typeof raw === 'string' ? JSON.parse(raw) : []);
      },
      set(val) {
        if (!val || (Array.isArray(val) && val.length === 0)) {
          this.setDataValue('roles', null);
        } else {
          // sequelize 6+ 直接传数组即可, 它会自动序列化为 JSON
          this.setDataValue('roles', Array.isArray(val) ? val : [val]);
        }
      }
    },
    courtId: { type: DataTypes.INTEGER, allowNull: true, field: 'court_id' },  // 球场方关联的场地 ID（user/court 二选一）
    status: { type: DataTypes.TINYINT, defaultValue: 1 }
  }, {
    tableName: 'users'
  });
  return User;
};
