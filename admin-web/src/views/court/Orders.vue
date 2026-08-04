<template>
  <div class="orders-page">
    <div class="page-card">
      <el-tabs v-model="activeTab" @tab-change="onTabChange">
        <el-tab-pane label="全部" name="all" />
        <el-tab-pane label="待确认" name="pending" />
        <el-tab-pane label="已支付" name="paid" />
        <el-tab-pane label="已完成" name="completed" />
        <el-tab-pane label="已取消" name="canceled" />
        <el-tab-pane label="已退款" name="refunded" />
      </el-tabs>

      <el-table :data="orders" stripe v-loading="loading">
        <el-table-column prop="orderNo" label="订单号" width="170" />
        <el-table-column label="场地" min-width="160">
          <template #default="{ row }">
            <span v-if="row.court">{{ row.court.name }}</span>
            <span v-else class="muted">-</span>
          </template>
        </el-table-column>
        <el-table-column label="客户" width="120">
          <template #default="{ row }">
            <span v-if="row.user">{{ row.user.nickname }}</span>
            <span v-else class="muted">-</span>
          </template>
        </el-table-column>
        <el-table-column label="联系" width="140">
          <template #default="{ row }">
            <a v-if="row.contactPhone" :href="`tel:${row.contactPhone}`">{{ row.contactPhone }}</a>
            <span v-else-if="row.user && row.user.phone" :href="`tel:${row.user.phone}`">{{ row.user.phone }}</span>
            <span v-else class="muted">-</span>
          </template>
        </el-table-column>
        <el-table-column label="时段" width="220">
          <template #default="{ row }">
            <div v-if="row.schedule">
              <div>{{ formatDate(row.schedule.date) }}</div>
              <div class="muted small">{{ row.schedule.timeSlot }}</div>
            </div>
            <span v-else class="muted">-</span>
          </template>
        </el-table-column>
        <el-table-column label="金额" width="100">
          <template #default="{ row }">
            <span class="price">¥{{ row.amount }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusType[row.status]" effect="light">{{ statusMap[row.status] || row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button v-if="row.status === 'pending'" size="small" type="primary" @click="onAccept(row)" :loading="actionLoadingId === row.id">确认</el-button>
            <el-button v-if="row.status === 'pending'" size="small" type="danger" @click="onCancel(row)" :loading="actionLoadingId === row.id">拒绝</el-button>
            <el-button size="small" link @click="onDetail(row)">详情</el-button>
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

      <!-- 详情弹窗 -->
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
const detailVisible = ref(false);
const currentOrder = ref(null);

const statusMap = {
  pending: '待确认',
  paid: '已支付',
  completed: '已完成',
  refunded: '已退款',
  canceled: '已取消'
};

const statusType = {
  pending: 'warning',
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

onMounted(loadOrders);
</script>

<style lang="scss" scoped>
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