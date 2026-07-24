<template>
  <el-container class="layout">
    <el-aside width="220px" class="sidebar">
      <div class="logo">
        <span class="logo-icon">⚽</span>
        <div>
          <div class="logo-text">足球搭子</div>
          <div class="logo-sub">运营后台</div>
        </div>
      </div>

      <el-menu
        :default-active="$route.path"
        router
        background-color="transparent"
        text-color="#666666"
        active-text-color="#007AFF"
        class="sidebar-menu"
      >
        <el-menu-item index="/ops/dashboard">
          <el-icon><DataBoard /></el-icon>
          <span>数据看板</span>
        </el-menu-item>
        <el-menu-item index="/ops/users">
          <el-icon><User /></el-icon>
          <span>用户管理</span>
        </el-menu-item>
        <el-menu-item index="/ops/courts">
          <el-icon><Location /></el-icon>
          <span>场地审核</span>
        </el-menu-item>
        <el-menu-item index="/ops/orders">
          <el-icon><Document /></el-icon>
          <span>订单管理</span>
        </el-menu-item>
        <el-menu-item index="/ops/finance">
          <el-icon><Money /></el-icon>
          <span>财务管理</span>
        </el-menu-item>
      </el-menu>
    </el-aside>

    <el-container>
      <el-header class="header">
        <div class="header-left">
          <span class="page-title">{{ $route.meta.title }}</span>
        </div>
        <div class="header-right">
          <el-tag type="info" effect="plain">超级管理员</el-tag>
          <el-dropdown @command="onCommand" style="margin-left: 16px;">
            <span class="user-info">
              <el-avatar :size="32" :src="authStore.adminInfo?.avatarUrl">
                {{ authStore.adminInfo?.realName?.[0] || 'A' }}
              </el-avatar>
              <span class="username">{{ authStore.adminInfo?.username }}</span>
              <el-icon><ArrowDown /></el-icon>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="logout">
                  <el-icon><SwitchButton /></el-icon> 退出登录
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>

      <el-main class="main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { ElMessage } from 'element-plus';
import {
  DataBoard, User, Location, Document, Money, ArrowDown, SwitchButton
} from '@element-plus/icons-vue';

const router = useRouter();
const authStore = useAuthStore();

function onCommand(cmd) {
  if (cmd === 'logout') {
    authStore.logout();
    ElMessage.success('已退出登录');
    router.push('/login');
  }
}
</script>

<style lang="scss" scoped>
.layout { height: 100vh; }

.sidebar {
  background: linear-gradient(180deg, #001529 0%, #002140 100%);

  .logo {
    display: flex;
    align-items: center;
    padding: 24px;
    gap: 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);

    .logo-icon { font-size: 32px; }
    .logo-text {
      font-size: 18px;
      font-weight: 700;
      color: #FFFFFF;
    }
    .logo-sub {
      font-size: 12px;
      color: rgba(255, 255, 255, 0.6);
    }
  }

  .sidebar-menu { border: none; padding-top: 16px; }

  :deep(.el-menu-item) {
    margin: 4px 12px;
    border-radius: 8px;
    height: 44px;
    line-height: 44px;
    color: rgba(255, 255, 255, 0.7);

    &:hover { background: rgba(255, 255, 255, 0.08) !important; }
    &.is-active {
      background: #007AFF !important;
      color: #FFFFFF !important;
      font-weight: 600;
    }
  }
}

.header {
  background: #FFFFFF;
  border-bottom: 1px solid #F0F0F0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 32px;

  .page-title { font-size: 18px; font-weight: 600; color: #1A1A1A; }
  .header-right { display: flex; align-items: center; }
  .user-info {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    .username { font-size: 14px; color: #666666; }
  }
}

.main {
  background: #F5F7FA;
  padding: 24px;
}
</style>