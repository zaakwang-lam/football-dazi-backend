<template>
  <el-container class="layout">
    <el-aside width="220px" class="sidebar">
      <div class="logo">
        <span class="logo-icon">⚽</span>
        <span class="logo-text">足球搭子</span>
      </div>

      <el-menu
        :default-active="$route.path"
        router
        background-color="transparent"
        text-color="#666666"
        active-text-color="#FF6B00"
        class="sidebar-menu"
      >
        <el-menu-item index="/dashboard">
          <el-icon><DataBoard /></el-icon>
          <span>工作台</span>
        </el-menu-item>
        <el-menu-item index="/courts">
          <el-icon><Location /></el-icon>
          <span>场地管理</span>
        </el-menu-item>
        <el-menu-item index="/orders">
          <el-icon><Document /></el-icon>
          <span>订单管理</span>
        </el-menu-item>
        <el-menu-item index="/finance">
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
          <el-dropdown @command="onCommand">
            <span class="user-info">
              <el-avatar :size="32" :src="authStore.adminInfo?.avatarUrl">
                {{ authStore.adminInfo?.realName?.[0] || 'A' }}
              </el-avatar>
              <span class="username">{{ authStore.adminInfo?.realName || authStore.adminInfo?.username }}</span>
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
  DataBoard, Location, Document, Money, ArrowDown, SwitchButton
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
.layout {
  height: 100vh;
}

.sidebar {
  background: #FFFFFF;
  border-right: 1px solid #F0F0F0;

  .logo {
    display: flex;
    align-items: center;
    padding: 24px;
    gap: 12px;
    border-bottom: 1px solid #F5F7FA;

    .logo-icon {
      font-size: 32px;
    }

    .logo-text {
      font-size: 18px;
      font-weight: 700;
      color: #FF6B00;
    }
  }

  .sidebar-menu {
    border: none;
    padding-top: 16px;
  }

  :deep(.el-menu-item) {
    margin: 4px 12px;
    border-radius: 8px;
    height: 44px;
    line-height: 44px;

    &.is-active {
      background: #FFE8D6 !important;
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

  .page-title {
    font-size: 18px;
    font-weight: 600;
    color: #1A1A1A;
  }

  .user-info {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;

    .username {
      font-size: 14px;
      color: #666666;
    }
  }
}

.main {
  background: #F5F7FA;
  padding: 24px;
}
</style>