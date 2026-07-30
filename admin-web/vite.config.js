import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';

export default defineConfig({
  // 2026-07-30：base 必须配 '/admin/'，否则 build 出来的 HTML 引用绝对路径 /assets/...
  // nginx 只 location /admin/ 转给 admin-web，/assets/ 会落到 backend 容器（404）
  base: '/admin/',
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  },
  server: {
    port: 8080,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  }
});