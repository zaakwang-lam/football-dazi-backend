// src/stores/auth.js
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { authApi } from '@/api';

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('admin_token') || '');
  const refreshToken = ref(localStorage.getItem('admin_refresh_token') || '');
  const adminInfo = ref(JSON.parse(localStorage.getItem('admin_info') || 'null'));

  const isLoggedIn = computed(() => !!token.value);
  const role = computed(() => adminInfo.value?.role || '');

  async function login(credentials) {
    const res = await authApi.login(credentials);
    if (res.code === 0) {
      token.value = res.data.accessToken;
      refreshToken.value = res.data.refreshToken;
      adminInfo.value = res.data.admin;
      localStorage.setItem('admin_token', token.value);
      localStorage.setItem('admin_refresh_token', refreshToken.value);
      localStorage.setItem('admin_info', JSON.stringify(adminInfo.value));
    }
    return res;
  }

  function logout() {
    token.value = '';
    refreshToken.value = '';
    adminInfo.value = null;
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_refresh_token');
    localStorage.removeItem('admin_info');
  }

  return {
    token,
    refreshToken,
    adminInfo,
    isLoggedIn,
    role,
    login,
    logout
  };
});