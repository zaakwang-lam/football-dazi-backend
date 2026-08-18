<template>
  <div class="page-card">
    <div class="card-header">
      <h3>📋 全平台订单管理</h3>
      <div style="display: flex; gap: 12px; align-items: center;">
        <el-input v-model="keyword" placeholder="搜索订单号/电话" style="width: 240px;" clearable @keyup.enter="loadList" />
        <el-button @click="loadList">搜索</el-button>
        <el-button type="primary" @click="loadList">刷新</el-button>
      </div>
    </div>

    <el-tabs v-model="statusTab" @tab-change="loadList" style="margin-bottom: 16px;">
      <el-tab-pane label="全部" name="all" />
      <el-tab-pane label="待支付" name="pending" />
      <el-tab-pane label="已预订(待接单)" name="booked" />
      <el-tab-pane label="已完成" name="completed" />
      <el-tab-pane label="已取消" name="canceled" />
      <el-tab-pane label="已退款" name="refunded" />
    </el-tabs>

    <el-table :data="orders" stripe v-loading="loading" border>
      <el-table-column prop="orderNo" label="订单号" width="180" />
      <el-table-column label="预订用户" width="120">
        <template #default="{ row }">
          <span>{{ row.user?.nickname || '—' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="球场" min-width="160">
        <template #default="{ row }">
          <span>{{ row.court?.name || '—' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="时段" width="200">
        <template #default="{ row }">
          <span v-if="row.schedule">{{ row.schedule.date }} {{ row.schedule.timeSlot }}</span>
          <span v-else>—</span>
        </template>
      </el-table-column>
      <el-table-column label="金额" width="100">
        <template #default="{ row }">¥{{ row.amount }}</template>
      </el-table-column>
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="getStatusType(row.status)">{{ statusMap[row.status] }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="下单时间" width="160">
        <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="280" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="viewDetail(row)">查看</el-button>
          <el-button size="small" @click="onEdit(row)">编辑</el-button>
          <el-button size="small" type="danger" link @click="onDelete(row)">删除</el-button>
          <template v-if="row.status === 'booked'">
            <el-button size="small" type="primary" @click="onAccept(row)" :loading="accepting === row.id">接单</el-button>
            <el-button size="small" type="danger" @click="onCancel(row)" :loading="canceling === row.id">拒绝</el-button>
          </template>
        </template>
      </el-table-column>
      <template #empty>
        <div style="padding: 20px; color: #999;">📭 暂无订单</div>
      </template>
    </el-table>

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

    <el-dialog v-model="detailVisible" title="订单详情" width="600px">
      <div v-if="detail" class="detail-content">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="订单号">{{ detail.orderNo }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="getStatusType(detail.status)">{{ statusMap[detail.status] }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="预订用户">{{ detail.user?.nickname || '—' }}</el-descriptions-item>
          <el-descriptions-item label="联系电话">{{ detail.contactPhone || '—' }}</el-descriptions-item>
          <el-descriptions-item label="球场">{{ detail.court?.name || '—' }}</el-descriptions-item>
          <el-descriptions-item label="球场电话">{{ detail.court?.phone || '—' }}</el-descriptions-item>
          <el-descriptions-item label="时段" :span="2">
            <span v-if="detail.schedule">{{ detail.schedule.date }} {{ detail.schedule.timeSlot }}</span>
            <span v-else>—</span>
          </el-descriptions-item>
          <el-descriptions-item label="金额">¥{{ detail.amount }}</el-descriptions-item>
          <el-descriptions-item label="下单时间">{{ formatTime(detail.createdAt) }}</el-descriptions-item>
          <el-descriptions-item label="备注" :span="2">{{ detail.remark || '—' }}</el-descriptions-item>
        </el-descriptions>
      </div>
    </el-dialog>

    <el-dialog v-model="editVisible" title="编辑订单" width="520px" destroy-on-close>
      <el-form :model="editForm" label-width="90px">
        <el-form-item label="订单号">
          <el-input :model-value="editForm.orderNo" disabled />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="editForm.status" style="width: 100%;">
            <el-option v-for="(label, key) in statusMap" :key="key" :label="label" :value="key" />
          </el-select>
        </el-form-item>
        <el-form-item label="金额">
          <el-input-number v-model="editForm.amount" :min="0" :max="999999" :precision="2" style="width: 100%;" />
        </el-form-item>
        <el-form-item label="联系人">
          <el-input v-model="editForm.contactName" maxlength="32" />
        </el-form-item>
        <el-form-item label="联系电话">
          <el-input v-model="editForm.contactPhone" maxlength="20" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="editForm.remark" type="textarea" :rows="3" maxlength="255" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="confirmEdit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, onActivated, watch } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { orderApi } from '@/api';

const route = useRoute();

const keyword = ref('');
const statusTab = ref('all');
const orders = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const loading = ref(false);
const accepting = ref(null);
const canceling = ref(null);
const saving = ref(false);

const detailVisible = ref(false);
const detail = ref(null);
const editVisible = ref(false);
const editForm = ref({
  id: null,
  orderNo: '',
  status: 'pending',
  amount: 0,
  contactName: '',
  contactPhone: '',
  remark: ''
});

const statusMap = {
  pending: '待支付',
  booked: '已预订',
  completed: '已完成',
  canceled: '已取消',
  refunded: '已退款',
  paid: '已支付'
};

function getStatusType(status) {
  return { pending: 'warning', booked: 'primary', paid: 'primary', completed: 'success', refunded: 'info', canceled: 'info' }[status] || 'info';
}

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
      status: statusTab.value,
      page: page.value,
      pageSize: pageSize.value
    };
    if (keyword.value) params.keyword = keyword.value;
    const res = await orderApi.list(params);
    orders.value = res.data?.list || [];
    total.value = res.data?.total || 0;
  } catch (err) {
    console.error('加载订单失败:', err);
    ElMessage.error(err.message || '加载订单失败');
  } finally {
    loading.value = false;
  }
}

async function viewDetail(row) {
  try {
    const res = await orderApi.detail(row.id);
    detail.value = res.data;
    detailVisible.value = true;
  } catch (err) {
    ElMessage.error(err.message || '加载详情失败');
  }
}

function onEdit(row) {
  editForm.value = {
    id: row.id,
    orderNo: row.orderNo,
    status: row.status,
    amount: Number(row.amount) || 0,
    contactName: row.contactName || '',
    contactPhone: row.contactPhone || '',
    remark: row.remark || ''
  };
  editVisible.value = true;
}

async function confirmEdit() {
  const f = editForm.value;
  if (!f.id) return;
  saving.value = true;
  try {
    await orderApi.update(f.id, {
      status: f.status,
      amount: f.amount,
      contactName: f.contactName,
      contactPhone: f.contactPhone,
      remark: f.remark
    });
    ElMessage.success('已保存');
    editVisible.value = false;
    loadList();
  } catch (err) {
    ElMessage.error(err.message || '保存失败');
  } finally {
    saving.value = false;
  }
}

async function onDelete(row) {
  try {
    await ElMessageBox.confirm(
      `确认删除订单 ${row.orderNo}？删除后不可恢复。`,
      '删除确认',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
    );
  } catch {
    return;
  }
  try {
    await orderApi.remove(row.id);
    ElMessage.success('已删除');
    loadList();
  } catch (err) {
    ElMessage.error(err.message || '删除失败');
  }
}

async function onAccept(row) {
  try {
    await ElMessageBox.confirm(
      `确认接单 ${row.orderNo}? 接单后状态将标记为"已完成"`,
      '接单确认',
      { confirmButtonText: '确认接单', cancelButtonText: '取消', type: 'warning' }
    );
  } catch {
    return;
  }
  accepting.value = row.id;
  try {
    await orderApi.accept(row.id);
    ElMessage.success(`已接单 ${row.orderNo}`);
    loadList();
  } catch (err) {
    ElMessage.error(err.message || '接单失败');
  } finally {
    accepting.value = null;
  }
}

async function onCancel(row) {
  let reason = '';
  try {
    const { value } = await ElMessageBox.prompt(
      `确认拒绝订单 ${row.orderNo}? 请输入拒绝理由（可选）`,
      '拒绝订单',
      {
        confirmButtonText: '确认拒绝',
        cancelButtonText: '取消',
        type: 'warning',
        inputPlaceholder: '如：时段冲突、球场维护...'
      }
    );
    reason = value;
  } catch {
    return;
  }
  canceling.value = row.id;
  try {
    await orderApi.cancel(row.id, { reason });
    ElMessage.success(`已拒绝 ${row.orderNo}`);
    loadList();
  } catch (err) {
    ElMessage.error(err.message || '拒绝失败');
  } finally {
    canceling.value = null;
  }
}

watch(() => route.query.id, async (id) => {
  if (id) {
    try {
      const res = await orderApi.detail(id);
      detail.value = res.data;
      detailVisible.value = true;
    } catch (err) {
      ElMessage.error('订单不存在');
    }
  }
}, { immediate: true });

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
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;

  h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
  }
}

.detail-content {
  padding: 0 8px;
}
</style>
