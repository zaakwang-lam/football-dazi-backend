<template>
  <div class="page-card">
    <div class="card-header">
      <div>
        <h3>城市经理</h3>
        <p class="tip">只有这里添加并且状态为启用的账号可以登录。停用后立即不能登录。初始密码留空则为 123456。</p>
      </div>
      <el-button type="primary" @click="openCreate">添加城市经理</el-button>
    </div>

    <el-table :data="list" v-loading="loading">
      <el-table-column prop="realName" label="姓名" width="100" />
      <el-table-column prop="username" label="用户名" width="140" />
      <el-table-column prop="phone" label="手机" width="130" />
      <el-table-column prop="region" label="服务城市" width="120" />
      <el-table-column prop="courtCount" label="绑定球场" width="100" />
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag :type="row.status === 1 ? 'success' : 'info'">{{ row.status === 1 ? '启用' : '停用' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="220">
        <template #default="{ row }">
          <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
          <el-button link type="warning" @click="onReset(row)">重置密码</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="visible" :title="form.id ? '编辑城市经理' : '添加城市经理'" width="640px">
      <el-form :model="form" label-width="110px">
        <el-form-item label="姓名" required><el-input v-model="form.realName" maxlength="32" /></el-form-item>
        <el-form-item label="用户名" required>
          <el-input v-model="form.username" :disabled="!!form.id" maxlength="32" placeholder="4-32 位字母、数字或下划线" />
        </el-form-item>
        <el-form-item v-if="!form.id" label="初始密码">
          <el-input v-model="form.password" placeholder="留空则为 123456" />
        </el-form-item>
        <el-form-item label="手机"><el-input v-model="form.phone" /></el-form-item>
        <el-form-item label="服务城市"><el-input v-model="form.region" /></el-form-item>
        <el-form-item label="身份证号"><el-input v-model="form.idCard" /></el-form-item>
        <el-form-item label="开户行"><el-input v-model="form.bankName" /></el-form-item>
        <el-form-item label="本人账号"><el-input v-model="form.bankAccount" /></el-form-item>
        <el-form-item label="状态">
          <el-switch v-model="form.status" :active-value="1" :inactive-value="0" active-text="启用" inactive-text="停用" />
        </el-form-item>
        <el-form-item label="绑定球场">
          <el-select v-model="form.courtIds" multiple filterable style="width: 100%;" placeholder="选择开拓的球场">
            <el-option v-for="court in courts" :key="court.id" :label="`${court.name}${court.district ? ' / ' + court.district : ''}`" :value="court.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="visible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="onSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { cityManagerApi } from '@/api';

const list = ref([]);
const courts = ref([]);
const loading = ref(false);
const saving = ref(false);
const visible = ref(false);
const form = reactive(blank());

function blank() {
  return {
    id: null, realName: '', username: '', password: '', phone: '', region: '',
    idCard: '', bankName: '', bankAccount: '', status: 1, courtIds: []
  };
}

async function load() {
  loading.value = true;
  try {
    const res = await cityManagerApi.list({ pageSize: 100 });
    if (res.code === 0) list.value = res.data.list || [];
    else ElMessage.error(res.message || '加载失败');
  } finally {
    loading.value = false;
  }
}

async function openCreate() {
  Object.assign(form, blank());
  await loadCourts();
  visible.value = true;
}

async function openEdit(row) {
  Object.assign(form, blank(), row, { password: '' });
  await loadCourts();
  visible.value = true;
}

async function loadCourts() {
  if (courts.value.length) return;
  const res = await cityManagerApi.courtOptions();
  if (res.code === 0) courts.value = res.data || [];
}

async function onSave() {
  saving.value = true;
  try {
    const payload = { ...form };
    const res = form.id
      ? await cityManagerApi.update(form.id, payload)
      : await cityManagerApi.create(payload);
    if (res.code !== 0) {
      ElMessage.error(res.message || '保存失败');
      return;
    }
    ElMessage.success(form.id ? '已保存' : '已添加，可使用该用户名登录');
    visible.value = false;
    load();
  } finally {
    saving.value = false;
  }
}

async function onReset(row) {
  await ElMessageBox.confirm(`确认把 ${row.realName} 的密码重置为 123456？`, '重置密码');
  const res = await cityManagerApi.resetPassword(row.id);
  if (res.code === 0) ElMessage.success('密码已重置为 123456');
  else ElMessage.error(res.message || '重置失败');
}

onMounted(load);
</script>
