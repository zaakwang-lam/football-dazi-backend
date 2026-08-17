<template>
  <div class="dashboard">
    <!-- 今日数据 -->
    <el-row :gutter="20">
      <el-col :span="6">
        <div class="metric-card metric-clickable" @click="openOrderDetail">
          <div class="metric-label">📋 今日订单</div>
          <div class="metric-value">{{ metrics.todayOrders ?? '—' }}</div>
          <div class="metric-extra" :class="orderTrendClass">
            {{ formatTrend(metrics.todayOrders, metrics.yesterdayOrders) }} 较昨日 · 点看明细
          </div>
        </div>
      </el-col>
      <el-col :span="6">
        <div class="metric-card">
          <div class="metric-label">💰 今日收入</div>
          <div class="metric-value">¥{{ formatMoney(metrics.todayRevenue) }}</div>
          <div class="metric-extra" :class="revenueTrendClass">
            {{ formatTrendPercent(metrics.todayRevenue, metrics.yesterdayRevenue) }} 较昨日
          </div>
        </div>
      </el-col>
      <el-col :span="6">
        <div class="metric-card">
          <div class="metric-label">👥 新增客户</div>
          <div class="metric-value">{{ metrics.newCustomers ?? '—' }}</div>
          <div class="metric-extra" :class="customerTrendClass">
            {{ formatTrend(metrics.newCustomers, metrics.yesterdayNewCustomers) }} 较昨日
          </div>
        </div>
      </el-col>
      <el-col :span="6">
        <div class="metric-card">
          <div class="metric-label">⭐ 场地评分</div>
          <div class="metric-value">{{ metrics.rating?.toFixed(1) ?? '—' }}</div>
          <div class="metric-extra">{{ metrics.courtName || '基于历史评价' }}</div>
        </div>
      </el-col>
    </el-row>

    <!-- 待处理订单 -->
    <div class="page-card" style="margin-top: 20px;">
      <div class="card-header">
        <h3>⏰ 待处理订单 ({{ pendingOrders.length }})</h3>
        <el-button type="primary" link @click="$router.push('/court/orders')">查看全部 ›</el-button>
      </div>

      <el-table :data="pendingOrders" stripe v-loading="loading">
        <el-table-column prop="orderNo" label="订单号" width="170" />
        <el-table-column label="预订用户" width="140">
          <template #default="{ row }">
            <div style="display: flex; align-items: center; gap: 8px;">
              <el-avatar v-if="row.user?.avatarUrl" :src="row.user.avatarUrl" :size="28" />
              <el-avatar v-else :size="28">{{ row.user?.nickname?.[0] || '?' }}</el-avatar>
              <span>{{ row.user?.nickname || '—' }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="时段" width="200">
          <template #default="{ row }">
            <span v-if="row.schedule">{{ row.schedule.date }} {{ row.schedule.timeSlot }}</span>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <el-table-column label="金额" width="100">
          <template #default="{ row }">
            <span class="price">¥{{ row.amount }}</span>
          </template>
        </el-table-column>
        <el-table-column label="下单时间" width="160">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="primary" @click="goToOrders">去处理</el-button>
          </template>
        </el-table-column>
        <template #empty>
          <div style="padding: 20px; color: #999;">✅ 暂无待处理订单</div>
        </template>
      </el-table>
    </div>

    <!-- 最近订单 -->
    <div class="page-card" style="margin-top: 20px;">
      <div class="card-header">
        <h3>📋 最近订单</h3>
        <el-button type="primary" link @click="$router.push('/court/orders')">查看全部 ›</el-button>
      </div>

      <el-table :data="recentOrders" stripe v-loading="loading">
        <el-table-column prop="orderNo" label="订单号" width="170" />
        <el-table-column label="用户" width="140">
          <template #default="{ row }">
            <span>{{ row.user?.nickname || '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="时段" width="200">
          <template #default="{ row }">
            <span v-if="row.schedule">{{ row.schedule.date }} {{ row.schedule.timeSlot }}</span>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <el-table-column label="金额" width="100">
          <template #default="{ row }">
            <span class="price">¥{{ row.amount }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusType[row.status]" size="small">{{ statusMap[row.status] || row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="下单时间" width="160">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
        <template #empty>
          <div style="padding: 20px; color: #999;">暂无订单</div>
        </template>
      </el-table>
    </div>

    <!-- 订单明细（含历史） -->
    <el-dialog v-model="orderDlgVisible" title="订单明细" width="900px" destroy-on-close>
      <div class="dlg-toolbar">
        <el-date-picker
          v-model="orderDateRange"
          type="daterange"
          range-separator="至"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          value-format="YYYY-MM-DD"
          :clearable="false"
          @change="loadOrderDetails"
        />
        <el-button style="margin-left: 12px;" @click="setOrderRangeToday">今日</el-button>
        <el-button @click="setOrderRangeDays(7)">近7天</el-button>
        <el-button @click="setOrderRangeDays(30)">近30天</el-button>
        <el-button type="primary" link @click="$router.push('/court/orders')">去订单管理 ›</el-button>
      </div>
      <el-table :data="orderDetailList" stripe v-loading="orderDetailLoading" max-height="480" style="margin-top: 12px;">
        <el-table-column prop="orderNo" label="订单号" width="170" />
        <el-table-column label="用户" width="120">
          <template #default="{ row }">{{ row.user?.nickname || '—' }}</template>
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
            <el-tag :type="statusType[row.status]" size="small">{{ statusMap[row.status] || row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="下单时间" width="160">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
        <template #empty>
          <div style="padding: 24px; color: #999;">该时段暂无订单</div>
        </template>
      </el-table>
      <div style="margin-top: 12px; text-align: right;" v-if="orderDetailTotal > 0">
        <el-pagination
          v-model:current-page="orderPage"
          v-model:page-size="orderPageSize"
          :total="orderDetailTotal"
          layout="total, prev, pager, next"
          @current-change="loadOrderDetails"
        />
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { dashboardApi, orderApi } from '@/api';
import { ElMessage } from 'element-plus';

const router = useRouter();

const loading = ref(false);
const metrics = ref({});
const pendingOrders = ref([]);
const recentOrders = ref([]);

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

const orderDlgVisible = ref(false);
const orderDateRange = ref([]);
const orderDetailList = ref([]);
const orderDetailTotal = ref(0);
const orderPage = ref(1);
const orderPageSize = ref(20);
const orderDetailLoading = ref(false);

const orderTrendClass = computed(() => {
  if (metrics.value.yesterdayOrders == null) return '';
  const diff = (metrics.value.todayOrders || 0) - (metrics.value.yesterdayOrders || 0);
  return diff > 0 ? 'trend-up' : diff < 0 ? 'trend-down' : 'trend-flat';
});
const revenueTrendClass = computed(() => {
  if (metrics.value.yesterdayRevenue == null) return '';
  const diff = (metrics.value.todayRevenue || 0) - (metrics.value.yesterdayRevenue || 0);
  return diff > 0 ? 'trend-up' : diff < 0 ? 'trend-down' : 'trend-flat';
});
const customerTrendClass = computed(() => {
  if (metrics.value.yesterdayNewCustomers == null) return '';
  const diff = (metrics.value.newCustomers || 0) - (metrics.value.yesterdayNewCustomers || 0);
  return diff > 0 ? 'trend-up' : diff < 0 ? 'trend-down' : 'trend-flat';
});

function todayStr() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function daysAgoStr(n) {
  const d = new Date(Date.now() - n * 86400000);
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function loadDashboard() {
  loading.value = true;
  try {
    const res = await dashboardApi.courtDashboard();
    const d = res.data || {};
    metrics.value = d.metrics || {};
    pendingOrders.value = d.pendingOrders || [];
    recentOrders.value = d.recentOrders || [];
  } catch (e) {
    ElMessage.error(e.message || '加载 Dashboard 失败');
  } finally {
    loading.value = false;
  }
}

function openOrderDetail() {
  const t = todayStr();
  orderDateRange.value = [t, t];
  orderPage.value = 1;
  orderDlgVisible.value = true;
  loadOrderDetails();
}

function setOrderRangeToday() {
  const t = todayStr();
  orderDateRange.value = [t, t];
  orderPage.value = 1;
  loadOrderDetails();
}

function setOrderRangeDays(n) {
  orderDateRange.value = [daysAgoStr(n - 1), todayStr()];
  orderPage.value = 1;
  loadOrderDetails();
}

async function loadOrderDetails() {
  orderDetailLoading.value = true;
  try {
    const [startDate, endDate] = orderDateRange.value || [];
    const res = await orderApi.list({
      startDate,
      endDate,
      page: orderPage.value,
      pageSize: orderPageSize.value,
      status: 'all'
    });
    orderDetailList.value = res.data?.list || [];
    orderDetailTotal.value = res.data?.total || 0;
  } catch (e) {
    orderDetailList.value = [];
    orderDetailTotal.value = 0;
  } finally {
    orderDetailLoading.value = false;
  }
}

function formatMoney(val) {
  if (val == null) return '—';
  return Number(val).toLocaleString('zh-CN', { maximumFractionDigits: 0 });
}

function formatTrend(today, yesterday) {
  if (yesterday == null || yesterday === 0) {
    return today > 0 ? `+${today}` : '±0';
  }
  const diff = today - yesterday;
  return diff >= 0 ? `+${diff}` : `${diff}`;
}

function formatTrendPercent(today, yesterday) {
  if (yesterday == null || yesterday === 0) {
    if (today > 0) return '+∞%';
    return '±0%';
  }
  const pct = Math.round(((today - yesterday) / yesterday) * 100);
  return pct >= 0 ? `+${pct}%` : `${pct}%`;
}

function formatTime(t) {
  if (!t) return '—';
  const d = new Date(t);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function goToOrders() {
  router.push('/court/orders');
}

onMounted(loadDashboard);
</script>

<style lang="scss" scoped>
.dashboard {
  :deep(.metric-card) {
    background: linear-gradient(135deg, #FFFFFF 0%, #FFFAF5 100%);
    border: 1px solid #FFE8D6;
  }
}

.metric-clickable {
  cursor: pointer;
  transition: box-shadow 0.2s, transform 0.15s;
  &:hover {
    box-shadow: 0 4px 16px rgba(255, 107, 0, 0.18);
    transform: translateY(-2px);
  }
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;

  h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: #1A1A1A;
  }
}

.price {
  color: #FF6B00;
  font-weight: 600;
}

.muted {
  color: #999;
}

.trend-up { color: #67C23A; }
.trend-down { color: #F56C6C; }
.trend-flat { color: #999; }

.dlg-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}
</style>
