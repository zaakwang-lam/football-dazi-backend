<template>
  <div class="orders-page">
    <div class="page-card">
      <div class="page-header">
        <h3>订单管理</h3>
        <el-button type="primary" @click="loadOrders">刷新</el-button>
      </div>

      <el-tabs v-model="activeTab" @tab-change="onTabChange">
        <el-tab-pane label="全部" name="all" />
        <el-tab-pane label="待确认" name="pending" />
        <el-tab-pane label="已预订" name="booked" />
        <el-tab-pane label="已支付" name="paid" />
        <el-tab-pane label="已完成" name="completed" />
        <el-tab-pane label="已取消" name="canceled" />
        <el-tab-pane label="已退款" name="refunded" />
      </el-tabs>

      <el-table :data="orders" stripe v-loading="loading" border>
        <el-table-column prop="orderNo" label="订单号" width="170" />
        <el-table-column label="场地" min-width="140">
          <template #default="{ row }">
            <span v-if="row.court">{{ row.court.name }}</span>
            <span v-else class="muted">-</span>
          </template>
        </el-table-column>
        <el-table-column label="客户" width="110">
          <template #default="{ row }">
            <span v-if="row.user">{{ row.user.nickname }}</span>
            <span v-else class="muted">-</span>
          </template>
        </el-table-column>
        <el-table-column label="联系" width="130">
          <template #default="{ row }">
            <a v-if="row.contactPhone" :href="`tel:${row.contactPhone}`">{{ row.contactPhone }}</a>
            <span v-else-if="row.user && row.user.phone">{{ row.user.phone }}</span>
            <span v-else class="muted">-</span>
          </template>
        </el-table-column>
        <el-table-column label="时段" width="200">
          <template #default="{ row }">
            <div v-if="row.schedule">
              <div>{{ formatDate(row.schedule.date) }}</div>
              <div class="muted small">{{ row.schedule.timeSlot }}</div>
            </div>
            <span v-else class="muted">-</span>
          </template>
        </el-table-column>
        <el-table-column label="金额" width="90">
          <template #default="{ row }">
            <span class="price">¥{{ row.amount }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusType[row.status]" effect="light">{{ statusMap[row.status] || row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="260" fixed="right">
          <template #default="{ row }">
            <el-button size="small" link @click="onDetail(row)">详情</el-button>
            <el-button size="small" @click="onEdit(row)">编辑</el-button>
            <el-button size="small" type="danger" link @click="onDelete(row)">删除</el-button>
            <el-button v-if="row.status === 'booked'" size="small" type="primary" @click="onAccept(row)" :loading="actionLoadingId === row.id">确认</el-button>
            <el-button v-if="row.status === 'booked'" size="small" type="danger" @click="onCancel(row)" :loading="actionLoadingId === row.id">拒绝</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-model:current-page="page"
        :total="total"
        :page-size="pageSize"
        layout="total, prev, pager, next, jumper"
        style="margin-top: 20px; justify-content: flex-end;"
        @current-change="loadOrders"
      />

      <el-dialog v-model="detailVisible" title="订单详情" width="540px">
        <el-descriptions v-if="currentOrder" :column="1" border>
          <el-descriptions-item label="订单号">{{ currentOrder.orderNo }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="statusType[currentOrder.status]">{{ statusMap[currentOrder.status] }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="场地">{{ currentOrder.court?.name || '-' }}</el-descriptions-item>
          <el-descriptions-item label="客户">{{ currentOrder.user?.nickname || '-' }}</el-descriptions-item>
          <el-descriptions-item label="联系">{{ currentOrder.contactPhone || currentOrder.user?.phone || '-' }}</el-descriptions-item>
          <el-descriptions-item label="时段">
            <span v-if="currentOrder.schedule">{{ formatDate(currentOrder.schedule.date) }} {{ currentOrder.schedule.timeSlot }}</span>
            <span v-else>-</span>
          </el-descriptions-item>
          <el-descriptions-item label="金额">¥{{ currentOrder.amount }}</el-descriptions-item>
          <el-descriptions-item label="备注">{{ currentOrder.remark || '-' }}</el-descriptions-item>
          <el-descriptions-item label="下单时间">{{ formatDateTime(currentOrder.createdAt) }}</el-descriptions-item>
        </el-descriptions>
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
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { orderApi } from '@/api';

const activeTab = ref('all');
const page = ref(1);
const pageSize = 20;
const total = ref(0);
const orders = ref([]);
const loading = ref(false);
const actionLoadingId = ref(null);
const saving = ref(false);
const detailVisible = ref(false);
const currentOrder = ref(null);
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
  paid: '已支付',
  completed: '已完成',
  refunded: '已退款',
  canceled: '已取消'
};

const statusType = {
  pending: 'warning',
  booked: 'primary',
  paid: 'success',
  completed: 'info',
  refunded: 'danger',
  canceled: 'danger'
};

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDateTime(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function loadOrders() {
  loading.value = true;
  try {
    const params = { page: page.value, pageSize };
    if (activeTab.value !== 'all') params.status = activeTab.value;
    const res = await orderApi.list(params);
    orders.value = res.data.list || [];
    total.value = res.data.total || 0;
  } catch (e) {
    ElMessage.error(e.message || '加载订单失败');
  } finally {
    loading.value = false;
  }
}

function onTabChange() {
  page.value = 1;
  loadOrders();
}

async function onAccept(row) {
  actionLoadingId.value = row.id;
  try {
    await orderApi.accept(row.id);
    ElMessage.success('已确认订单');
    await loadOrders();
  } catch (e) {
    ElMessage.error(e.message || '确认失败');
  } finally {
    actionLoadingId.value = null;
  }
}

async function onCancel(row) {
  try {
    await ElMessageBox.confirm(`确定要拒绝订单 ${row.orderNo}？`, '提示', { type: 'warning' });
  } catch { return; }
  actionLoadingId.value = row.id;
  try {
    await orderApi.cancel(row.id, { reason: '球场方拒绝' });
    ElMessage.success('已拒绝订单');
    await loadOrders();
  } catch (e) {
    ElMessage.error(e.message || '拒绝失败');
  } finally {
    actionLoadingId.value = null;
  }
}

async function onDetail(row) {
  try {
    const res = await orderApi.detail(row.id);
    currentOrder.value = res.data;
    detailVisible.value = true;
  } catch (e) {
    ElMessage.error(e.message || '加载详情失败');
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
    await loadOrders();
  } catch (e) {
    ElMessage.error(e.message || '保存失败');
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
    await loadOrders();
  } catch (e) {
    ElMessage.error(e.message || '删除失败');
  }
}

onMounted(loadOrders);
</script>

<style lang="scss" scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  h3 { margin: 0; font-size: 16px; }
}
.price {
  color: #FF6B00;
  font-weight: 600;
}
.muted {
  color: #999;
}
.small {
  font-size: 12px;
}
</style>
