<template>
  <div class="page-card">
    <el-tabs v-model="activeTab" @tab-change="onTabChange">
      <el-tab-pane :label="`待审核 (${counts.pending})`" name="2" />
      <el-tab-pane :label="`已通过 (${counts.approved})`" name="1" />
      <el-tab-pane :label="`已拒绝 (${counts.rejected})`" name="3" />
      <el-tab-pane :label="全部" name="all" />
    </el-tabs>

    <el-table :data="courts" stripe v-loading="loading">
      <el-table-column prop="id" label="ID" width="60" />
      <el-table-column prop="name" label="场地名称" min-width="160" />
      <el-table-column prop="type" label="类型" width="100" />
      <el-table-column prop="address" label="地址" min-width="240" />
      <el-table-column prop="phone" label="电话" width="140" />
      <el-table-column prop="price" label="单价" width="120">
        <template #default="{ row }">¥{{ row.price }}/场</template>
      </el-table-column>
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="getStatusType(row.status)">{{ getStatusText(row.status) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="createdAt" label="创建时间" width="180">
        <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="240" fixed="right">
        <template #default="{ row }">
          <el-button v-if="row.status === 2" size="small" type="primary" @click="onApprove(row)">通过</el-button>
          <el-button v-if="row.status === 2" size="small" type="danger" @click="onReject(row)">拒绝</el-button>
          <el-button size="small" link @click="onView(row)">查看</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination
      v-if="total > 0"
      layout="prev, pager, next, total"
      :total="total"
      :page-size="pageSize"
      :current-page="page"
      @current-change="onPageChange"
      style="margin-top: 20px; justify-content: flex-end; display: flex;"
    />

    <!-- 拒绝弹窗 -->
    <el-dialog v-model="rejectDialog" title="拒绝审核" width="500px">
      <el-form>
        <el-form-item label="拒绝理由" required>
          <el-input v-model="rejectReason" type="textarea" :rows="4" placeholder="请说明拒绝原因，球场方会收到此信息" maxlength="200" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="rejectDialog = false">取消</el-button>
        <el-button type="danger" @click="confirmReject" :loading="rejecting">确认拒绝</el-button>
      </template>
    </el-dialog>

    <!-- 查看详情弹窗 -->
    <el-dialog v-model="viewDialog" title="场地详情" width="640px">
      <el-descriptions v-if="currentCourt" :column="2" border>
        <el-descriptions-item label="场地 ID">{{ currentCourt.id }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="getStatusType(currentCourt.status)">{{ getStatusText(currentCourt.status) }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="名称" :span="2">{{ currentCourt.name }}</el-descriptions-item>
        <el-descriptions-item label="类型">{{ currentCourt.type }}</el-descriptions-item>
        <el-descriptions-item label="单价">¥{{ currentCourt.price }}/场</el-descriptions-item>
        <el-descriptions-item label="电话" :span="2">{{ currentCourt.phone || '无' }}</el-descriptions-item>
        <el-descriptions-item label="地址" :span="2">{{ currentCourt.address }}</el-descriptions-item>
        <el-descriptions-item label="描述" :span="2">
          <pre style="margin: 0; white-space: pre-wrap;">{{ currentCourt.description || '无' }}</pre>
        </el-descriptions-item>
      </el-descriptions>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { courtApi } from '@/api';

const activeTab = ref('2');  // 默认"待审核"
const courts = ref([]);
const loading = ref(false);
const page = ref(1);
const pageSize = ref(20);
const total = ref(0);

const counts = ref({ pending: 0, approved: 0, rejected: 0 });

const rejectDialog = ref(false);
const rejecting = ref(false);
const rejectReason = ref('');
const rejectTargetId = ref(null);

const viewDialog = ref(false);
const currentCourt = ref(null);

function getStatusType(status) {
  return { 1: 'success', 2: 'warning', 3: 'info' }[status] || 'info';
}
function getStatusText(status) {
  return { 1: '营业中', 2: '待审核', 3: '已拒绝' }[status] || `状态${status}`;
}

function formatDate(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleString('zh-CN', { hour12: false });
}

async function loadList() {
  loading.value = true;
  try {
    const params = { page: page.value, pageSize: pageSize.value };
    if (activeTab.value !== 'all') {
      params.status = Number(activeTab.value);
    }
    const res = await courtApi.list(params);
    if (res.code === 0) {
      courts.value = res.data.list || [];
      total.value = res.data.total || 0;
    } else {
      ElMessage.error(res.message || '加载失败');
    }
  } catch (e) {
    console.error(e);
    ElMessage.error('加载失败：' + (e.message || '网络错误'));
  } finally {
    loading.value = false;
  }
}

async function loadCounts() {
  // 并发拉取三个状态的总数
  try {
    const [pending, approved, rejected] = await Promise.all([
      courtApi.list({ status: 2, pageSize: 1 }),
      courtApi.list({ status: 1, pageSize: 1 }),
      courtApi.list({ status: 3, pageSize: 1 })
    ]);
    counts.value = {
      pending: pending.data?.total || 0,
      approved: approved.data?.total || 0,
      rejected: rejected.data?.total || 0
    };
  } catch (e) {
    console.error('loadCounts fail:', e);
  }
}

function onTabChange() {
  page.value = 1;
  loadList();
}

function onPageChange(newPage) {
  page.value = newPage;
  loadList();
}

async function onApprove(row) {
  try {
    await ElMessageBox.confirm(`确认通过【${row.name}】的审核？`, '审核通过', {
      type: 'success',
      confirmButtonText: '通过',
      cancelButtonText: '取消'
    });
  } catch {
    return;  // 用户取消
  }
  try {
    const res = await courtApi.audit(row.id, { approved: true });
    if (res.code === 0) {
      ElMessage.success('已通过');
      loadList();
      loadCounts();
    } else {
      ElMessage.error(res.message || '操作失败');
    }
  } catch (e) {
    ElMessage.error('操作失败：' + (e.message || '网络错误'));
  }
}

function onReject(row) {
  rejectTargetId.value = row.id;
  rejectReason.value = '';
  rejectDialog.value = true;
}

async function confirmReject() {
  if (!rejectReason.value.trim()) {
    ElMessage.warning('请填写拒绝理由');
    return;
  }
  rejecting.value = true;
  try {
    const res = await courtApi.audit(rejectTargetId.value, {
      approved: false,
      reason: rejectReason.value.trim()
    });
    if (res.code === 0) {
      ElMessage.success('已拒绝');
      rejectDialog.value = false;
      loadList();
      loadCounts();
    } else {
      ElMessage.error(res.message || '操作失败');
    }
  } catch (e) {
    ElMessage.error('操作失败：' + (e.message || '网络错误'));
  } finally {
    rejecting.value = false;
  }
}

async function onView(row) {
  currentCourt.value = row;
  viewDialog.value = true;
}

onMounted(() => {
  loadList();
  loadCounts();
});
</script>

<style lang="scss" scoped>
.page-card {
  background: #fff;
  border-radius: 8px;
  padding: 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}
</style>