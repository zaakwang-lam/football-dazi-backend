// src/utils/request.js
import axios from 'axios';
import { ElMessage } from 'element-plus';
import { useAuthStore } from '@/stores/auth';
import router from '@/router';

const request = axios.create({
  baseURL: '/api',
  timeout: 20000
});

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
      const authStore = useAuthStore();
      authStore.logout();
      router.push('/login');
      ElMessage.error('登录已过期，请重新登录');
      return Promise.reject(res.data);
    }
    ElMessage.error(res.data?.message || '操作失败');
    return Promise.reject(res.data);
  },
  (err) => {
    console.error('API 错误:', err);
    const status = err.response?.status;
    const msg =
      err.response?.data?.message ||
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
