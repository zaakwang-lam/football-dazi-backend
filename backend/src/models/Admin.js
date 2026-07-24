// src/models/Admin.js
const { DataTypes } = require('sequelize');
const bcrypt = require('bcryptjs');

module.exports = (sequelize) => {
  const Admin = sequelize.define('Admin', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    username: { type: DataTypes.STRING(32), unique: true, allowNull: false },
    passwordHash: { type: DataTypes.STRING(255), field: 'password_hash' },
    role: {
      type: DataTypes.ENUM('super_admin', 'court_admin', 'finance', 'ops'),
      defaultValue: 'court_admin'
    },
    courtId: { type: DataTypes.INTEGER, field: 'court_id' },
    realName: { type: DataTypes.STRING(32), field: 'real_name' },
    phone: { type: DataTypes.STRING(20) },
    status: { type: DataTypes.TINYINT, defaultValue: 1 },
    lastLoginAt: { type: DataTypes.DATE, field: 'last_login_at' }
  }, {
    tableName: 'admins',
    hooks: {
      beforeCreate: async (admin) => {
        if (admin.passwordHash) {
          admin.passwordHash = await bcrypt.hash(admin.passwordHash, 12);
        }
      },
      beforeUpdate: async (admin) => {
        if (admin.changed('passwordHash')) {
          admin.passwordHash = await bcrypt.hash(admin.passwordHash, 12);
        }
      }
    }
  });

  Admin.prototype.verifyPassword = function(plain) {
    return bcrypt.compare(plain, this.passwordHash);
  };

  return Admin;
};