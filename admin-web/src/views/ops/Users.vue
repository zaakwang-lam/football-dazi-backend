<template>
  <div class="page-card">
    <div class="card-header">
      <h3>👥 用户管理</h3>
      <div style="display: flex; gap: 12px; align-items: center;">
        <el-input v-model="keyword" placeholder="搜索昵称/手机号/城市" style="width: 240px;" clearable @keyup.enter="loadList" @clear="loadList" />
        <el-select v-model="filterStatus" placeholder="状态" style="width: 140px;" @change="loadList" clearable>
          <el-option label="全部状态" value="" />
          <el-option label="正常" :value="1" />
          <el-option label="禁用" :value="0" />
        </el-select>
        <el-select v-model="filterRole" placeholder="身份" style="width: 140px;" @change="loadList" clearable>
          <el-option label="全部身份" value="" />
          <el-option label="个人用户" value="user" />
          <el-option label="球场方" value="court" />
          <el-option label="管理员" value="admin" />
        </el-select>
        <el-button @click="loadList">刷新</el-button>
      </div>
    </div>

    <el-table :data="users" stripe v-loading="loading" border>
      <el-table-column prop="id" label="ID" width="80" />
      <el-table-column label="头像/昵称" min-width="200">
        <template #default="{ row }">
          <div style="display:flex;align-items:center;gap:8px;">
            <el-avatar :size="32" :src="row.avatarUrl">{{ row.nickname?.[0] || 'U' }}</el-avatar>
            <span>{{ row.nickname }}</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="phone" label="手机号" width="140" />
      <el-table-column prop="city" label="城市" width="100" />
      <el-table-column prop="level" label="水平" width="100" />
      <el-table-column label="身份" min-width="200">
        <template #default="{ row }">
          <el-tag
            v-for="r in (row.roles || [row.role])"
            :key="r"
            :type="r === 'admin' ? 'danger' : (r === 'court' ? 'warning' : '')"
            style="margin-right: 4px;"
          >
            {{ ROLE_LABEL[r] || r }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column v-if="showCourt" label="关联球场" min-width="160">
        <template #default="{ row }">
          <span>{{ row.courtName || '—' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="row.status === 1 ? 'success' : 'danger'">
            {{ row.status === 1 ? '正常' : '禁用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="注册时间" width="170">
        <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="180" fixed="right">
        <template #default="{ row }">
          <el-button size="small" link @click="viewDetail(row)">详情</el-button>
          <el-button
            size="small"
            link
            :type="row.status === 1 ? 'danger' : 'primary'"
            :loading="toggling === row.id"
            @click="onToggleStatus(row)"
          >
            {{ row.status === 1 ? '禁用' : '启用' }}
          </el-button>
        </template>
      </el-table-column>
      <template #empty>
        <div style="padding: 20px; color: #999;">📭 暂无用户</div>
      </template>
    </el-table>

    <!-- 分页 -->
    <div style="margin-top: 16px; text-align: right;" v-if="total > 0">
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next, jumper"
        @size-change="loadList"
        @current-change="loadList"
      />
    </div>

    <!-- 用户详情弹窗 -->
    <el-dialog v-model="detailVisible" title="用户详情" width="600px">
      <div v-if="detail">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="ID">{{ detail.id }}</el-descriptions-item>
          <el-descriptions-item label="昵称">{{ detail.nickname }}</el-descriptions-item>
          <el-descriptions-item label="手机号">{{ detail.phone || '—' }}</el-descriptions-item>
          <el-descriptions-item label="性别">{{ GENDER_LABEL[detail.gender] || '未知' }}</el-descriptions-item>
          <el-descriptions-item label="城市">{{ detail.city }}</el-descriptions-item>
          <el-descriptions-item label="水平">{{ detail.level }}</el-descriptions-item>
          <el-descriptions-item label="主身份">
            <el-tag>{{ ROLE_LABEL[detail.role] || detail.role }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="关联球场">{{ detail.courtName || '—' }}</el-descriptions-item>
          <el-descriptions-item label="状态" :span="2">
            <el-tag :type="detail.status === 1 ? 'success' : 'danger'">
              {{ detail.status === 1 ? '正常' : '禁用' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="OpenID" :span="2">
            <span style="font-family: monospace; font-size: 12px;">{{ detail.openid || '—' }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="注册时间">{{ formatTime(detail.createdAt) }}</el-descriptions-item>
          <el-descriptions-item label="更新时间">{{ formatTime(detail.updatedAt) }}</el-descriptions-item>
        </el-descriptions>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onActivated } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { userApi } from '@/api';
import { useAuthStore } from '@/stores/auth';

const authStore = useAuthStore();

// 角色中文映射
const ROLE_LABEL = {
  user: '个人',
  court: '球场方',
  admin: '管理员'
};

const GENDER_LABEL = {
  0: '未知',
  1: '男',
  2: '女'
};

const keyword = ref('');
const filterStatus = ref('');
const filterRole = ref('');
const users = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const loading = ref(false);
const toggling = ref(null);

const detailVisible = ref(false);
const detail = ref(null);

// court_admin 不显示关联球场列（他自己就是球场方）
const showCourt = computed(() => authStore.adminInfo?.role !== 'court_admin');

function formatTime(t) {
  if (!t) return '—';
  const d = new Date(t);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function loadList() {
  loading.value = true;
  try {
    const params = {
      page: page.value,
      pageSize: pageSize.value
    };
    if (keyword.value) params.keyword = keyword.value;
    if (filterStatus.value !== '') params.status = filterStatus.value;
    if (filterRole.value) params.role = filterRole.value;
    const res = await userApi.list(params);
    users.value = res.data?.list || [];
    total.value = res.data?.total || 0;
  } catch (err) {
    console.error('加载用户失败:', err);
    ElMessage.error(err.message || '加载用户失败');
  } finally {
    loading.value = false;
  }
}

async function viewDetail(row) {
  try {
    const res = await userApi.detail(row.id);
    detail.value = res.data;
    detailVisible.value = true;
  } catch (err) {
    ElMessage.error(err.message || '加载详情失败');
  }
}

async function onToggleStatus(row) {
  const action = row.status === 1 ? '禁用' : '启用';
  const newStatus = row.status === 1 ? 0 : 1;
  try {
    await ElMessageBox.confirm(
      `确认${action}用户「${row.nickname}」？`,
      `${action}用户`,
      { confirmButtonText: `确认${action}`, cancelButtonText: '取消', type: 'warning' }
    );
  } catch {
    return; // 用户取消
  }
  toggling.value = row.id;
  try {
    await userApi.updateStatus(row.id, { status: newStatus });
    ElMessage.success(`已${action}用户「${row.nickname}」`);
    // 局部更新列表，避免重新拉取
    row.status = newStatus;
  } catch (err) {
    ElMessage.error(err.message || `${action}失败`);
  } finally {
    toggling.value = null;
  }
}

onMounted(() => {
  loadList();
});

onActivated(() => {
  loadList();
});
</script>

<style lang="scss" scoped>
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}
</style>