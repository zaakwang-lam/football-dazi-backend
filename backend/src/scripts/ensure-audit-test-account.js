#!/usr/bin/env node
/**
 * 确保存在「审核测试账号」：同时具备个人方(user) + 球场方(court)
 *
 * 用法（在 backend 目录或容器内）：
 *   node src/scripts/ensure-audit-test-account.js
 *
 * 固定 openid: audit_test_openid_dual_role
 * 测试登录（需开启环境变量）：
 *   TEST_LOGIN_ENABLED=1
 *   TEST_LOGIN_SECRET=football-audit-2026
 *   POST /api/user/login-test  body: { "secret": "football-audit-2026" }
 */
require('dotenv').config();
const { sequelize, User, Court } = require('../models');

const OPENID = 'audit_test_openid_dual_role';
const NICKNAME = '审核测试账号';
const PHONE = '13800000000';

async function main() {
  await sequelize.authenticate();

  let user = await User.findOne({ where: { openid: OPENID } });
  if (!user) {
    user = await User.create({
      openid: OPENID,
      nickname: NICKNAME,
      avatarUrl: '',
      phone: PHONE,
      gender: 1,
      city: '广州',
      level: '业余',
      role: 'user',
      roles: ['user', 'court'],
      status: 1
    });
    console.log('✅ 已创建用户 id=', user.id);
  } else {
    user.nickname = NICKNAME;
    user.phone = PHONE;
    user.roles = ['user', 'court'];
    user.role = 'user';
    user.status = 1;
    await user.save();
    console.log('✅ 已更新用户 id=', user.id, 'roles=user+court');
  }

  let court = await Court.findOne({ where: { ownerId: user.id } });
  if (!court) {
    court = await Court.create({
      name: '审核测试球场（天河）',
      ownerId: user.id,
      type: '5人制',
      types: ['11人制', '7人制', '5人制'],
      address: '广州市天河区测试路 1 号',
      district: '天河',
      longitude: 113.3245,
      latitude: 23.1356,
      phone: '020-88888888',
      price: 300,
      openTime: '08:00:00',
      closeTime: '22:00:00',
      surfaceType: '人工草地',
      surfaceTypes: ['人工草地'],
      images: [],
      tags: ['审核测试', '人工草'],
      description: '供微信审核与联调用的测试球场，可编辑信息与发布空闲时段。',
      status: 1,
      rating: 5.0
    });
    console.log('✅ 已创建测试球场 id=', court.id, 'status=营业中');
  } else {
    court.name = court.name || '审核测试球场（天河）';
    court.status = 1;
    if (!Array.isArray(court.types) || !court.types.length) {
      court.types = ['11人制', '7人制', '5人制'];
      court.type = '5人制';
    }
    await court.save();
    console.log('✅ 已更新测试球场 id=', court.id, 'status=营业中');
  }

  user.courtId = court.id;
  user.roles = ['user', 'court'];
  await user.save();

  console.log('\n========== 审核测试账号 ==========');
  console.log('用户 ID   :', user.id);
  console.log('openid    :', OPENID);
  console.log('昵称      :', NICKNAME);
  console.log('角色      : user + court（可在小程序「我的」切换）');
  console.log('球场 ID   :', court.id, court.name);
  console.log('球场状态  : 1（营业中，无需再审）');
  console.log('\n测试登录接口（服务器需设置）：');
  console.log('  TEST_LOGIN_ENABLED=1');
  console.log('  TEST_LOGIN_SECRET=football-audit-2026');
  console.log('  POST /api/user/login-test');
  console.log('  Body: { "secret": "football-audit-2026" }');
  console.log('================================\n');

  await sequelize.close();
  process.exit(0);
}

main().catch((e) => {
  console.error('失败:', e);
  process.exit(1);
});
