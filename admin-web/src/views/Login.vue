<template>
  <div class="login-page">
    <div class="login-card">
      <div class="brand">
        <div class="logo">⚽</div>
        <h1>足球搭子后台</h1>
        <p class="subtitle">广州业余足球运营管理平台</p>
      </div>

      <el-form ref="formRef" :model="form" :rules="rules" class="login-form" @submit.prevent="onSubmit">
        <el-form-item prop="username">
          <el-input v-model="form.username" placeholder="用户名" size="large" :prefix-icon="User" />
        </el-form-item>

        <el-form-item prop="password">
          <el-input
            v-model="form.password"
            type="password"
            placeholder="密码"
            size="large"
            :prefix-icon="Lock"
            show-password
            @keyup.enter="onSubmit"
          />
        </el-form-item>

        <el-button
          type="primary"
          size="large"
          :loading="loading"
          class="login-btn"
          @click="onSubmit"
        >
          登 录
        </el-button>
      </el-form>

      <div class="tips">
        <p>测试账号：</p>
        <p>超级管理员：admin / admin123</p>
        <p>场地方管理员：tianhe_admin / court123</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { User, Lock } from '@element-plus/icons-vue';
import { useAuthStore } from '@/stores/auth';

const router = useRouter();
const authStore = useAuthStore();

const formRef = ref(null);
const loading = ref(false);
const form = reactive({
  username: '',
  password: ''
});

const rules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }]
};

async function onSubmit() {
  if (!formRef.value) return;
  await formRef.value.validate(async (valid) => {
    if (!valid) return;
    loading.value = true;
    try {
      const res = await authStore.login(form);
      if (res.code === 0) {
        ElMessage.success('登录成功');
        // 根据角色跳转
        const target = res.data.admin.role === 'court_admin' ? '/dashboard' : '/ops/dashboard';
        router.push(target);
      }
    } catch (e) {
      console.error(e);
    } finally {
      loading.value = false;
    }
  });
}
</script>

<style lang="scss" scoped>
.login-page {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #FF6B00 0%, #FF8C42 50%, #FFB800 100%);
}

.login-card {
  width: 420px;
  background: #FFFFFF;
  border-radius: 24px;
  padding: 48px 40px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.15);
}

.brand {
  text-align: center;
  margin-bottom: 32px;

  .logo {
    font-size: 64px;
    margin-bottom: 16px;
  }

  h1 {
    font-size: 24px;
    font-weight: 700;
    color: #1A1A1A;
    margin: 0 0 8px;
  }

  .subtitle {
    font-size: 14px;
    color: #999999;
    margin: 0;
  }
}

.login-form {
  .login-btn {
    width: 100%;
    margin-top: 8px;
  }
}

.tips {
  margin-top: 24px;
  padding: 16px;
  background: #F5F7FA;
  border-radius: 12px;
  font-size: 12px;
  color: #666666;

  p {
    margin: 4px 0;
  }
}
</style>