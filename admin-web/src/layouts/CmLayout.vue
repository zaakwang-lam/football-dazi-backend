<template>
  <el-container class="layout">
    <el-aside width="220px" class="sidebar">
      <div class="logo">
        <span class="logo-icon">⚽</span>
        <div>
          <div class="logo-text">爱拍球</div>
          <div class="logo-sub">城市经理</div>
        </div>
      </div>
      <el-menu :default-active="$route.path" router background-color="transparent" text-color="#666" active-text-color="#007AFF">
        <el-menu-item index="/cm/home"><span>我的业务</span></el-menu-item>
        <el-menu-item index="/cm/account"><span>账号安全</span></el-menu-item>
      </el-menu>
    </el-aside>
    <el-container>
      <el-header class="header">
        <span class="page-title">{{ $route.meta.title }}</span>
        <el-button link type="danger" @click="onLogout">退出登录</el-button>
      </el-header>
      <el-main class="main"><router-view /></el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useAuthStore } from '@/stores/auth';

const router = useRouter();
const authStore = useAuthStore();

function onLogout() {
  authStore.logout();
  ElMessage.success('已退出登录');
  router.push('/login');
}
</script>

<style scoped>
.layout { height: 100vh; }
.sidebar { background: #001529; color: #fff; }
.logo { display: flex; gap: 12px; align-items: center; padding: 24px; }
.logo-text { color: #fff; font-weight: 700; }
.logo-sub { color: rgba(255,255,255,.65); font-size: 12px; }
.header { background: #fff; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #f0f0f0; }
.page-title { font-weight: 600; }
.main { background: #f5f7fa; }
</style>
