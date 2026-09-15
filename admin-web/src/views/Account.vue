<template>
  <div class="page-card">
    <div class="card-header">
      <div>
        <h3>账号安全</h3>
        <p class="tip">修改后台登录密码。改密成功后需要重新登录。</p>
      </div>
    </div>

    <el-descriptions :column="2" border style="max-width: 640px; margin-bottom: 24px;">
      <el-descriptions-item label="用户名">{{ authStore.adminInfo?.username || '-' }}</el-descriptions-item>
      <el-descriptions-item label="角色">{{ roleLabel }}</el-descriptions-item>
    </el-descriptions>

    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-width="108px"
      style="max-width: 480px;"
      @submit.prevent="onSubmit"
    >
      <el-form-item label="原密码" prop="oldPassword">
        <el-input v-model="form.oldPassword" type="password" show-password placeholder="请输入当前密码" autocomplete="current-password" />
      </el-form-item>
      <el-form-item label="新密码" prop="newPassword">
        <el-input v-model="form.newPassword" type="password" show-password placeholder="至少 8 位" autocomplete="new-password" />
      </el-form-item>
      <el-form-item label="确认新密码" prop="confirmPassword">
        <el-input v-model="form.confirmPassword" type="password" show-password placeholder="再次输入新密码" autocomplete="new-password" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" :loading="loading" @click="onSubmit">保存新密码</el-button>
      </el-form-item>
    </el-form>
  </div>
</template>

<script setup>
import { computed, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useAuthStore } from '@/stores/auth';
import { authApi } from '@/api';

const router = useRouter();
const authStore = useAuthStore();
const formRef = ref(null);
const loading = ref(false);

const ROLE_LABEL = {
  super_admin: '超级管理员',
  ops: '运营',
  court_admin: '球场管理员',
  finance: '财务'
};
const roleLabel = computed(() => ROLE_LABEL[authStore.adminInfo?.role] || authStore.adminInfo?.role || '-');

const form = reactive({
  oldPassword: '',
  newPassword: '',
  confirmPassword: ''
});

const rules = {
  oldPassword: [{ required: true, message: '请输入原密码', trigger: 'blur' }],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 8, message: '新密码至少 8 位', trigger: 'blur' }
  ],
  confirmPassword: [
    { required: true, message: '请再次输入新密码', trigger: 'blur' },
    {
      validator: (_rule, value, cb) => {
        if (value !== form.newPassword) cb(new Error('两次输入的新密码不一致'));
        else cb();
      },
      trigger: 'blur'
    }
  ]
};

async function onSubmit() {
  if (!formRef.value) return;
  await formRef.value.validate(async (valid) => {
    if (!valid) return;
    loading.value = true;
    try {
      const res = await authApi.changePassword({
        oldPassword: form.oldPassword,
        newPassword: form.newPassword
      });
      if (res.code === 0) {
        ElMessage.success(res.message || '密码已更新，请重新登录');
        authStore.logout();
        router.push('/login');
      }
    } catch (e) {
      console.error(e);
    } finally {
      loading.value = false;
    }
  });
}
</script>

<style scoped>
.tip { margin: 6px 0 0; font-size: 13px; color: #999; }
.card-header h3 { margin: 0; }
</style>
