// src/utils/request.js
import axios from 'axios';
import { ElMessage } from 'element-plus';
import { useAuthStore } from '@/stores/auth';
import router from '@/router';

const request = axios.create({
  baseURL: '/api',
  timeout: 15000
});

// 请求拦截器
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

// 响应拦截器
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
    ElMessage.error(err.message || '网络错误');
    return Promise.reject(err);
  }
);

export default request;