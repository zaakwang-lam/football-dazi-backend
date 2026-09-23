<template>
  <div class="page-card">
    <div class="toolbar">
      <div class="toolbar-title">球场管理</div>
      <div class="toolbar-actions">
        <el-button type="danger" plain :disabled="!courts.length" :loading="batchDeleting" @click="onBatchDelete">批量删除</el-button>
        <el-button @click="onDownloadTemplate">下载导入模板</el-button>
        <el-upload
          accept=".xlsx,.xls,.csv"
          :show-file-list="false"
          :http-request="onImportFile"
        >
          <el-button type="primary" :loading="importing">批量导入 Excel</el-button>
        </el-upload>
      </div>
    </div>
    <p class="hint">模板字段：球场名称、省市区、详细地址、联系人、联系电话、营业时间、座标。营业时间填 08:00-22:00。座标填「经度,纬度」（腾讯/高德地图复制，如 113.324500,23.135600），导入后写入经纬度，小程序据此计算距离。导入后默认上架。</p>

    <el-tabs v-model="activeTab" @tab-change="onTabChange">
      <el-tab-pane :label="`待审核 (${counts.pending})`" name="2" />
      <el-tab-pane :label="`已通过 (${counts.approved})`" name="1" />
      <el-tab-pane :label="`已拒绝 (${counts.rejected})`" name="3" />
      <el-tab-pane label="全部" name="all" />
    </el-tabs>

    <el-table :data="courts" stripe v-loading="loading">
      <el-table-column prop="id" label="ID" width="60" />
      <el-table-column prop="name" label="场地名称" min-width="160" />
      <el-table-column prop="district" label="省市区" min-width="160" />
      <el-table-column prop="address" label="详细地址" min-width="200" />
      <el-table-column prop="contactName" label="联系人" width="100" />
      <el-table-column prop="phone" label="联系电话" width="130" />
      <el-table-column prop="hoursText" label="营业时间" width="120" />
      <el-table-column prop="coordText" label="座标" min-width="180" />
      <el-table-column label="认领" width="90">
        <template #default="{ row }">
          <el-tag :type="row.claimed ? 'success' : 'info'" size="small">{{ row.claimed ? '已认领' : '未认领' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="price" label="单价" width="110">
        <template #default="{ row }">¥{{ row.price }}/场</template>
      </el-table-column>
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="getStatusType(row.status)">{{ getStatusText(row.status) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="createdAt" label="创建时间" width="170">
        <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="320" fixed="right">
        <template #default="{ row }">
          <el-button v-if="row.status === 2" size="small" type="primary" @click="onApprove(row)">通过</el-button>
          <el-button v-if="row.status === 2" size="small" type="danger" @click="onReject(row)">拒绝</el-button>
          <el-button size="small" @click="onEdit(row)">编辑</el-button>
          <el-button size="small" type="danger" link @click="onDelete(row)">删除</el-button>
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
        <el-descriptions-item label="联系人">{{ currentCourt.contactName || '无' }}</el-descriptions-item>
        <el-descriptions-item label="认领">{{ currentCourt.claimed ? '已认领' : '未认领' }}</el-descriptions-item>
        <el-descriptions-item label="省市区" :span="2">{{ currentCourt.district || '无' }}</el-descriptions-item>
        <el-descriptions-item label="地址" :span="2">{{ currentCourt.address }}</el-descriptions-item>
        <el-descriptions-item label="营业时间">{{ currentCourt.hoursText || '无' }}</el-descriptions-item>
        <el-descriptions-item label="座标">{{ currentCourt.coordText || '无' }}</el-descriptions-item>
        <el-descriptions-item label="描述" :span="2">
          <pre style="margin: 0; white-space: pre-wrap;">{{ currentCourt.description || '无' }}</pre>
        </el-descriptions-item>
      </el-descriptions>
    </el-dialog>

    <!-- 编辑弹窗 -->
    <el-dialog v-model="editDialog" title="编辑场地信息" width="560px" destroy-on-close>
      <el-form :model="editForm" label-width="90px">
        <el-form-item label="名称" required>
          <el-input v-model="editForm.name" maxlength="64" />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="editForm.type" style="width: 100%;">
            <el-option v-for="t in typeOptions" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="地址" required>
          <el-input v-model="editForm.address" />
        </el-form-item>
        <el-form-item label="省市区">
          <el-input v-model="editForm.district" placeholder="如：广东省 广州市 白云区" />
        </el-form-item>
        <el-form-item label="联系人">
          <el-input v-model="editForm.contactName" />
        </el-form-item>
        <el-form-item label="电话">
          <el-input v-model="editForm.phone" />
        </el-form-item>
        <el-form-item label="单价">
          <el-input-number v-model="editForm.price" :min="0" :max="99999" style="width: 100%;" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="editForm.status" style="width: 100%;">
            <el-option label="营业中" :value="1" />
            <el-option label="待审核" :value="2" />
            <el-option label="已拒绝" :value="3" />
            <el-option label="休息中" :value="0" />
          </el-select>
        </el-form-item>
        <el-form-item label="简介">
          <el-input v-model="editForm.description" type="textarea" :rows="3" maxlength="500" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="confirmEdit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { courtApi } from '@/api';

const activeTab = ref('2');
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

const editDialog = ref(false);
const saving = ref(false);
const typeOptions = ['11人制', '8人制', '7人制', '5人制', '3人制'];
const editForm = ref({
  id: null,
  name: '',
  type: '11人制',
  address: '',
  district: '',
  phone: '',
  contactName: '',
  price: 0,
  status: 2,
  description: ''
});
const importing = ref(false);
const batchDeleting = ref(false);

function getStatusType(status) {
  return { 0: 'info', 1: 'success', 2: 'warning', 3: 'info' }[status] || 'info';
}
function getStatusText(status) {
  return { 0: '休息中', 1: '营业中', 2: '待审核', 3: '已拒绝' }[status] || `状态${status}`;
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
    return;
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

function onEdit(row) {
  editForm.value = {
    id: row.id,
    name: row.name || '',
    type: row.type || '11人制',
    address: row.address || '',
    district: row.district || '',
    phone: row.phone || '',
    contactName: row.contactName || '',
    price: Number(row.price) || 0,
    status: row.status,
    description: row.description || ''
  };
  editDialog.value = true;
}

async function confirmEdit() {
  const f = editForm.value;
  if (!f.name || !f.address) {
    ElMessage.warning('请填写名称和地址');
    return;
  }
  saving.value = true;
  try {
    const res = await courtApi.update(f.id, {
      name: f.name.trim(),
      type: f.type,
      address: f.address.trim(),
      district: (f.district || '').trim(),
      phone: (f.phone || '').trim(),
      contactName: (f.contactName || '').trim(),
      price: Number(f.price) || 0,
      status: Number(f.status),
      description: (f.description || '').trim()
    });
    if (res.code === 0) {
      ElMessage.success('已保存');
      editDialog.value = false;
      loadList();
      loadCounts();
    } else {
      ElMessage.error(res.message || '保存失败');
    }
  } catch (e) {
    ElMessage.error('保存失败：' + (e.message || '网络错误'));
  } finally {
    saving.value = false;
  }
}

async function onDelete(row) {
  try {
    await ElMessageBox.confirm(
      `确认删除场地【${row.name}】？删除后小程序端将不再展示（软删除）。`,
      '删除确认',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
    );
  } catch {
    return;
  }
  try {
    const res = await courtApi.remove(row.id);
    if (res.code === 0) {
      ElMessage.success('已删除');
      loadList();
      loadCounts();
    } else {
      ElMessage.error(res.message || '删除失败');
    }
  } catch (e) {
    ElMessage.error('删除失败：' + (e.message || '网络错误'));
  }
}

async function onBatchDelete() {
  const rows = courts.value || [];
  if (!rows.length) {
    ElMessage.warning('当前页没有数据');
    return;
  }
  try {
    await ElMessageBox.confirm(
      `确认删除当前页 ${rows.length} 条场地？删除后小程序不再展示（软删除）。有未完成订单的场地会跳过。`,
      '批量删除',
      { type: 'warning', confirmButtonText: '删除本页', cancelButtonText: '取消' }
    );
  } catch {
    return;
  }
  batchDeleting.value = true;
  try {
    const res = await courtApi.batchRemove(rows.map((r) => r.id));
    if (res.code === 0) {
      const skipped = res.data?.skippedList || [];
      ElMessage.success(res.message || '已删除');
      if (skipped.length) {
        const names = skipped.slice(0, 5).map((s) => `${s.name || s.id}：${s.reason}`).join('；');
        ElMessage.warning(`未删除：${names}`);
      }
      if (page.value > 1 && rows.length && (res.data?.deleted || 0) >= rows.length) {
        page.value -= 1;
      }
      loadList();
      loadCounts();
    } else {
      ElMessage.error(res.message || '删除失败');
    }
  } catch (e) {
    ElMessage.error(e.message || '删除失败');
  } finally {
    batchDeleting.value = false;
  }
}

async function onDownloadTemplate() {
  const cells = (arr) => arr.map((c) => `<Cell><Data ss:Type="String">${String(c).replace(/&/g, '&').replace(/</g, '<')}</Data></Cell>`).join('');
  const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="球场导入">
  <Table>
   <Row>${cells(['球场名称', '省市区', '详细地址', '联系人', '联系电话', '营业时间', '座标'])}</Row>
   <Row>${cells(['白云新海足球场', '广东省 广州市 白云区', '广州市白云区新海路1号', '张经理', '13800138000', '08:00-22:00', '113.324500,23.135600'])}</Row>
  </Table>
 </Worksheet>
</Workbook>`;
  const blob = new Blob([xml], { type: 'application/vnd.ms-excel' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = '球场批量导入模板.xls';
  a.click();
  URL.revokeObjectURL(url);
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function onImportFile(options) {
  const file = options.file;
  if (!file) return;
  importing.value = true;
  try {
    const base64 = await fileToBase64(file);
    const res = await courtApi.importCourts({ filename: file.name, base64 });
    if (res.code === 0) {
      const d = res.data || {};
      ElMessage.success(res.message || `导入完成：新增 ${d.created || 0}`);
      loadList();
      loadCounts();
    } else {
      ElMessage.error(res.message || '导入失败');
    }
  } catch (e) {
    ElMessage.error(e.message || '导入失败');
  } finally {
    importing.value = false;
  }
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
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 8px;
}
.toolbar-title {
  font-size: 18px;
  font-weight: 700;
}
.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
.hint {
  margin: 0 0 16px;
  font-size: 13px;
  color: #909399;
  line-height: 1.6;
}
</style>
