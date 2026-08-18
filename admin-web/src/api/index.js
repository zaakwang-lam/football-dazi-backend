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
  detail: (id) => request.get(`/admin/courts/${id}`),
  create: (data) => request.post('/admin/courts', data),
  update: (id, data) => request.put(`/admin/courts/${id}`, data),
  remove: (id) => request.delete(`/admin/courts/${id}`),
  audit: (id, data) => request.post(`/admin/courts/${id}/audit`, data)
};

export const dashboardApi = {
  overview: () => request.get('/admin/dashboard/overview'),
  revenue: (params) => request.get('/admin/dashboard/revenue', { params }),
  topCourts: (params) => request.get('/admin/dashboard/courts', { params }),
  courtDashboard: () => request.get('/admin/courts/dashboard'),
  orderDetails: (params) => request.get('/admin/dashboard/orders', { params }),
  lfgDetails: (params) => request.get('/admin/dashboard/lfg', { params })
};

export const bannerApi = {
  list: () => request.get('/admin/banners'),
  upload: (data) => request.post('/admin/banners', data),
  update: (id, data) => request.put(`/admin/banners/${id}`, data),
  remove: (id) => request.delete(`/admin/banners/${id}`)
};

export const userApi = {
  list: (params) => request.get('/admin/users', { params }),
  detail: (id) => request.get(`/admin/users/${id}`),
  updateStatus: (id, data) => request.put(`/admin/users/${id}/status`, data),
  delete: (id) => request.delete(`/admin/users/${id}`)
};

export const orderApi = {
  list: (params) => request.get('/admin/orders', { params }),
  detail: (id) => request.get(`/admin/orders/${id}`),
  accept: (id) => request.post(`/admin/orders/${id}/accept`),
  cancel: (id, data) => request.post(`/admin/orders/${id}/cancel`, data)
};
