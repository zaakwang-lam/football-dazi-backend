// src/utils/request.js
import axios from 'axios';
import { ElMessage } from 'element-plus';
import { useAuthStore } from '@/stores/auth';
import router from '@/router';

const request = axios.create({
  baseURL: '/api',
  timeout: 20000
});

let refreshing = null;
let authRedirecting = false;

function kickToLogin() {
  const authStore = useAuthStore();
  authStore.logout();
  if (authRedirecting) return;
  authRedirecting = true;
  if (router.currentRoute.value.path !== '/login') {
    router.push({ path: '/login', query: { redirect: router.currentRoute.value.fullPath } });
  }
  ElMessage.error('登录已过期，请重新登录');
  setTimeout(() => { authRedirecting = false; }, 1500);
}

function refreshAccessToken() {
  const authStore = useAuthStore();
  if (!authStore.refreshToken) return Promise.reject(new Error('no refresh'));
  if (!refreshing) {
    refreshing = axios.post('/api/admin/refresh', { refreshToken: authStore.refreshToken }, { timeout: 20000 })
      .then((res) => {
        const body = res.data;
        if (body?.code !== 0 || !body.data?.accessToken) throw new Error(body?.message || 'refresh failed');
        authStore.setTokens(body.data.accessToken, body.data.refreshToken);
        return body.data.accessToken;
      })
      .finally(() => { refreshing = null; });
  }
  return refreshing;
}

request.interceptors.request.use(
  (config) => {
    const authStore = useAuthStore();
    if (authStore.token) {
      config.headers.Authorization = `Bearer ${authStore.token}`;
    }
    return config;
  },
  (err) => Promise.reject(err)
);

request.interceptors.response.use(
  (res) => {
    if (res.data?.code === 0) {
      return res.data;
    }
    if (res.data?.code === 401) {
      kickToLogin();
      return Promise.reject(res.data);
    }
    ElMessage.error(res.data?.message || '操作失败');
    return Promise.reject(res.data);
  },
  async (err) => {
    const status = err.response?.status;
    const body = err.response?.data;
    const original = err.config || {};
    const url = String(original.url || '');
    const isAuth = status === 401 || body?.code === 401;
    const skipRefresh = url.includes('/admin/login') || url.includes('/admin/refresh') || original._retry;
    if (isAuth && !skipRefresh) {
      original._retry = true;
      try {
        const token = await refreshAccessToken();
        original.headers = original.headers || {};
        original.headers.Authorization = `Bearer ${token}`;
        return request(original);
      } catch (e) {
        kickToLogin();
        return Promise.reject(err);
      }
    }
    if (isAuth) {
      kickToLogin();
      return Promise.reject(err);
    }
    console.error('API 错误:', err);
    const msg =
      body?.message ||
      (status === 502 || status === 503
        ? '后端服务不可用，请检查 backend 容器是否启动'
        : status === 404
          ? '接口不存在，请检查 Nginx / API 反代'
          : err.message || '网络错误');
    ElMessage.error(msg);
    return Promise.reject(err);
  }
);

export default request;
