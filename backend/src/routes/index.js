// src/routes/index.js
// 路由汇总
const express = require('express');
const router = express.Router();

// 鉴权
const authCtrl = require('../controllers/auth');
const adminOrderCtrl = require('../controllers/admin-order');
const adminUsersCtrl = require('../controllers/admin-users');
const { adminAuth, userAuth } = require('../middlewares/auth');

// 业务
const orderCtrl = require('../controllers/order');
const courtCtrl = require('../controllers/court');
const lfgCtrl = require('../controllers/lfg');
const teamCtrl = require('../controllers/team');
const dashCtrl = require('../controllers/dashboard');
const courtDashCtrl = require('../controllers/court-dashboard');

// ===== 公共接口 =====
router.post('/api/admin/login', authCtrl.adminLogin);
router.post('/api/admin/refresh', authCtrl.refreshToken);
router.post('/api/user/login', authCtrl.userLogin);

// ===== 微信支付回调（无鉴权）=====
router.post('/api/payment/notify', express.text({ type: '*/*' }), orderCtrl.paymentNotify);

// ===== C 端用户接口（需 userAuth）=====
router.post('/api/v1/orders', userAuth(), orderCtrl.createOrder);
router.get('/api/v1/orders', userAuth(), orderCtrl.listMyOrders);
router.get('/api/v1/orders/:id', userAuth(), orderCtrl.getOrderDetail);
router.post('/api/v1/payment/unified-order', userAuth(), orderCtrl.payOrder);
router.post('/api/v1/payment/refund', userAuth(), orderCtrl.applyRefund);

router.get('/api/v1/courts/nearby', courtCtrl.getNearbyCourts);
router.get('/api/v1/courts/:id', courtCtrl.getCourtDetail);
router.get('/api/v1/courts/:id/schedule', courtCtrl.getCourtSchedule);
router.get('/api/v1/courts/:id/free-slots', courtCtrl.getFreeSlots);
router.post('/api/v1/courts/:id/free-slots', userAuth(), courtCtrl.publishFreeSlots);

router.get('/api/v1/lfg/list', lfgCtrl.getLfgList);
router.get('/api/v1/lfg/:id', lfgCtrl.getLfgDetail);
router.post('/api/v1/lfg', userAuth(), lfgCtrl.publishLfg);
router.post('/api/v1/lfg/:id/join', userAuth(), lfgCtrl.joinLfg);
router.post('/api/v1/lfg/:id/quit', userAuth(), lfgCtrl.quitLfg);  // 退出组队（2026-07-28 新增）

router.get('/api/v1/teams', teamCtrl.getTeamList);
router.post('/api/v1/teams', userAuth(), teamCtrl.createTeam);
router.get('/api/v1/teams/:id', teamCtrl.getTeamDetail);
router.post('/api/v1/teams/:id/checkin', userAuth(), teamCtrl.checkin);

// ===== C 端用户补充接口（注册分支、附近球场）=====
router.get('/api/user/profile', userAuth(), authCtrl.getUserProfile);
router.post('/api/user/register-role', userAuth(), authCtrl.registerRole);
router.get('/api/user/me/courts', userAuth(), authCtrl.getMyCourts);  // 我的球场列表（2026-07-28 新增）
router.get('/api/user/me/teams', userAuth(), authCtrl.getMyTeams);    // 我的球队列表（2026-07-28 新增）
router.get('/api/user/me/lfg-posts', userAuth(), lfgCtrl.getMyLfgPosts);  // 我的组队列表（2026-07-28 新增）

// ===== 管理员接口 =====
router.get('/api/admin/profile', adminAuth(), authCtrl.getAdminProfile);
router.post('/api/admin/logout', adminAuth(), authCtrl.logout);

router.get('/api/admin/courts/dashboard', adminAuth(['super_admin', 'court_admin']), courtDashCtrl.getCourtDashboard);
router.get('/api/admin/courts', adminAuth(), courtCtrl.adminListCourts);
router.get('/api/admin/courts/:id', adminAuth(), courtCtrl.adminGetCourtDetail);
router.post('/api/admin/courts', adminAuth(['super_admin', 'court_admin']), courtCtrl.adminCreateCourt);
router.put('/api/admin/courts/:id', adminAuth(['super_admin', 'court_admin']), courtCtrl.adminUpdateCourt);
router.delete('/api/admin/courts/:id', adminAuth(['super_admin', 'court_admin']), courtCtrl.adminDeleteCourt);
router.post('/api/admin/courts/:id/audit', adminAuth(['super_admin']), courtCtrl.auditCourt);

router.get('/api/admin/dashboard/overview', adminAuth(['super_admin', 'ops']), dashCtrl.getOverview);
router.get('/api/admin/dashboard/revenue', adminAuth(['super_admin', 'ops']), dashCtrl.getRevenue);
router.get('/api/admin/dashboard/courts', adminAuth(['super_admin', 'ops']), dashCtrl.getTopCourts);

// 后台订单（球场方 + 运营）（2026-07-29 新增）
router.get('/api/admin/orders', adminAuth(), adminOrderCtrl.listOrders);
router.get('/api/admin/orders/:id', adminAuth(), adminOrderCtrl.getDetail);
router.post('/api/admin/orders/:id/accept', adminAuth(), adminOrderCtrl.acceptOrder);
router.post('/api/admin/orders/:id/cancel', adminAuth(), adminOrderCtrl.cancelOrder);

// 后台用户管理（2026-08-04 新增 #3.1a）
router.get('/api/admin/users', adminAuth(), adminUsersCtrl.listUsers);
router.get('/api/admin/users/:id', adminAuth(), adminUsersCtrl.getUserDetail);
router.put('/api/admin/users/:id/status', adminAuth(['super_admin', 'ops']), adminUsersCtrl.updateUserStatus);

module.exports = router;