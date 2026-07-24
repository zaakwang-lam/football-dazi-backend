// src/api/index.js
import request from '@/utils/request';

export const authApi = {
  login: (data) => request.post('/admin/login', data),
  refresh: (data) => request.post('/admin/refresh', data),
  logout: () => request.post('/admin/logout'),
  profile: () => request.get('/admin/profile')
};

export const courtApi = {
  list: (params) => request.get('/admin/courts', { params }),
  create: (data) => request.post('/admin/courts', data),
  audit: (id, data) => request.post(`/admin/courts/${id}/audit`, data)
};

export const dashboardApi = {
  overview: () => request.get('/admin/dashboard/overview'),
  revenue: () => request.get('/admin/dashboard/revenue'),
  topCourts: () => request.get('/admin/dashboard/courts')
};

export const userApi = {
  list: (params) => request.get('/admin/users', { params }),
  detail: (id) => request.get(`/admin/users/${id}`)
};