// src/scripts/init-db.js
// 数据库初始化脚本：建表 + 插入种子数据
// 运行：node src/scripts/init-db.js
require('dotenv').config();
const { sequelize, User, Court, CourtSchedule, Order, Team, TeamMember, LfgPost, Admin } = require('../models');
const bcrypt = require('bcryptjs');
const logger = require('../utils/logger');
const dayjs = require('dayjs');

async function init() {
  try {
    logger.info('开始初始化数据库...');

    // 1. 同步表结构
    await sequelize.sync({ force: true });
    logger.info('✅ 表结构已创建');

    // 2. 创建管理员
    const superAdmin = await Admin.create({
      username: 'admin',
      passwordHash: await bcrypt.hash('admin123', 12),
      role: 'super_admin',
      realName: '超级管理员',
      phone: '13800138000'
    });
    logger.info(`✅ 创建超级管理员: ${superAdmin.username} / admin123`);

    const courtAdmin = await Admin.create({
      username: 'tianhe_admin',
      passwordHash: await bcrypt.hash('court123', 12),
      role: 'court_admin',
      realName: '天河场地王经理',
      phone: '13900139000'
    });
    logger.info(`✅ 创建场地方管理员: ${courtAdmin.username} / court123`);

    // 3. 创建场地
    const courts = await Court.bulkCreate([
      {
        name: '天河体育中心 11人场',
        ownerId: courtAdmin.id,
        type: '11人制',
        address: '广州市天河区天河路299号',
        longitude: 113.3245,
        latitude: 23.1356,
        phone: '020-12345678',
        price: 1200,
        openTime: '08:00:00',
        closeTime: '23:00:00',
        images: [],
        tags: ['天然草', '灯光夜场', '停车场'],
        status: 1,
        rating: 4.8
      },
      {
        name: '番禺五人球场A',
        ownerId: courtAdmin.id,
        type: '5人制',
        address: '广州市番禺区市桥镇西丽路',
        longitude: 113.3845,
        latitude: 22.9356,
        phone: '020-23456789',
        price: 280,
        openTime: '10:00:00',
        closeTime: '23:30:00',
        tags: ['人工草', '夜场', '淋浴'],
        status: 1,
        rating: 4.6
      },
      {
        name: '海珠7人制球场',
        ownerId: courtAdmin.id,
        type: '7人制',
        address: '广州市海珠区滨江东路',
        longitude: 113.3045,
        latitude: 23.0856,
        phone: '020-34567890',
        price: 580,
        openTime: '09:00:00',
        closeTime: '22:00:00',
        tags: ['人工草', '夜场', '休息区'],
        status: 1,
        rating: 4.7
      }
    ]);
    logger.info(`✅ 创建了 ${courts.length} 个场地`);

    // 4. 创建排期（未来 7 天 × 8 时段）
    const TIME_SLOTS = ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00', '22:00'];
    const schedules = [];
    for (const court of courts) {
      for (let d = 0; d < 7; d++) {
        const date = dayjs().add(d, 'day').format('YYYY-MM-DD');
        for (const slot of TIME_SLOTS) {
          schedules.push({
            courtId: court.id,
            date,
            timeSlot: slot,
            status: Math.random() > 0.6 ? 'free' : 'free',  // 都先 free，下单后变 booked
            price: court.price
          });
        }
      }
    }
    await CourtSchedule.bulkCreate(schedules);
    logger.info(`✅ 创建了 ${schedules.length} 个排期`);

    // 5. 创建用户
    const users = await User.bulkCreate([
      {
        openid: 'mock_openid_001',
        nickname: '越秀老王',
        avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200',
        phone: '13800138001',
        gender: 1,
        city: '广州',
        level: '业余校队'
      },
      {
        openid: 'mock_openid_002',
        nickname: '海珠阿强',
        avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200',
        phone: '13800138002',
        gender: 1,
        city: '广州',
        level: '业余'
      },
      {
        openid: 'mock_openid_003',
        nickname: '天河小林',
        avatarUrl: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200',
        phone: '13800138003',
        gender: 1,
        city: '广州',
        level: '新手友好'
      }
    ]);
    logger.info(`✅ 创建了 ${users.length} 个用户`);

    // 6. 创建球队
    const teams = await Team.bulkCreate([
      {
        name: '越秀老炮队',
        captainId: users[0].id,
        district: '越秀区',
        motto: '老炮不老，踢球到老',
        description: '成立于 2020 年的老牌业余球队，每周固定 2 场夜场',
        level: 5,
        recruitment: true,
        founded: '2020-03-01',
        members: 18,
        attendance: 85,
        wins: 12,
        draws: 3,
        losses: 2
      },
      {
        name: '海珠飓风队',
        captainId: users[1].id,
        district: '海珠区',
        motto: '飓风来袭，势不可挡',
        level: 4,
        recruitment: true,
        founded: '2021-06-15',
        members: 15,
        attendance: 78,
        wins: 9,
        draws: 5,
        losses: 4
      }
    ]);

    // 添加成员
    for (const team of teams) {
      await TeamMember.bulkCreate([
        { teamId: team.id, userId: team.captainId, role: 'captain' },
        { teamId: team.id, userId: users[2].id, role: 'player' }
      ]);
    }
    logger.info(`✅ 创建了 ${teams.length} 个球队`);

    // 7. 创建凑人
    await LfgPost.bulkCreate([
      {
        userId: users[0].id,
        teamId: teams[0].id,
        type: 'sub',
        title: '越秀老炮队找人顶',
        location: '天河体育中心',
        playTime: new Date(Date.now() + 86400000),
        needCount: 2,
        level: '业余',
        contact: '微信同名',
        description: '周三夜场友谊赛，缺前锋和中场'
      },
      {
        userId: users[1].id,
        teamId: teams[1].id,
        type: 'war',
        title: '海珠飓风队发起约战',
        location: '海珠7人场',
        playTime: new Date(Date.now() + 3 * 86400000),
        needCount: 1,
        level: '业余校队',
        contact: '王队长',
        description: '7人制约战，欢迎同水平球队挑战'
      }
    ]);
    logger.info('✅ 创建了 2 条凑人信息');

    logger.info('\n🎉 数据库初始化完成！');
    logger.info('\n测试账号：');
    logger.info('  超管: admin / admin123');
    logger.info('  场地方: tianhe_admin / court123');

    await sequelize.close();
    process.exit(0);
  } catch (e) {
    logger.error('初始化失败:', e);
    process.exit(1);
  }
}

init();