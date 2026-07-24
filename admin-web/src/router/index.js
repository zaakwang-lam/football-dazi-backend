// src/router/index.js
import { createRouter, createWebHashHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { ElMessage } from 'element-plus';

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/Login.vue'),
    meta: { title: '登录', noAuth: true }
  },
  // 场地方后台
  {
    path: '/',
    component: () => import('@/layouts/CourtLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      { path: '', redirect: '/dashboard' },
      { path: 'dashboard', name: 'CourtDashboard', component: () => import('@/views/court/Dashboard.vue'), meta: { title: '工作台' } },
      { path: 'courts', name: 'CourtList', component: () => import('@/views/court/CourtList.vue'), meta: { title: '场地管理' } },
      { path: 'orders', name: 'CourtOrders', component: () => import('@/views/court/Orders.vue'), meta: { title: '订单管理' } },
      { path: 'finance', name: 'CourtFinance', component: () => import('@/views/court/Finance.vue'), meta: { title: '财务管理' } }
    ]
  },
  // 运营后台
  {
    path: '/ops',
    component: () => import('@/layouts/OpsLayout.vue'),
    meta: { requiresAuth: true, requiresRole: ['super_admin', 'ops'] },
    children: [
      { path: '', redirect: '/ops/dashboard' },
      { path: 'dashboard', name: 'OpsDashboard', component: () => import('@/views/ops/Dashboard.vue'), meta: { title: '数据看板' } },
      { path: 'users', name: 'OpsUsers', component: () => import('@/views/ops/Users.vue'), meta: { title: '用户管理' } },
      { path: 'courts', name: 'OpsCourts', component: () => import('@/views/ops/Courts.vue'), meta: { title: '场地审核' } },
      { path: 'orders', name: 'OpsOrders', component: () => import('@/views/ops/Orders.vue'), meta: { title: '全平台订单' } },
      { path: 'finance', name: 'OpsFinance', component: () => import('@/views/ops/Finance.vue'), meta: { title: '财务管理' } }
    ]
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/dashboard'
  }
];

const router = createRouter({
  history: createWebHashHistory(),
  routes
});

// 路由守卫
router.beforeEach((to, from, next) => {
  const authStore = useAuthStore();
  document.title = to.meta.title ? `${to.meta.title} - 足球搭子后台` : '足球搭子后台';

  if (to.meta.requiresAuth && !authStore.isLoggedIn) {
    next({ path: '/login', query: { redirect: to.fullPath } });
    return;
  }

  if (to.meta.requiresRole && !to.meta.requiresRole.includes(authStore.role)) {
    ElMessage.error('权限不足');
    next('/');
    return;
  }

  next();
});

export default router;