<template>
  <div class="ops-dashboard">
    <!-- 核心指标 -->
    <el-row :gutter="20">
      <el-col :span="4">
        <div class="metric-card">
          <div class="metric-label">👥 总用户</div>
          <div class="metric-value">{{ overview.totalUsers ?? '—' }}</div>
          <div class="metric-extra">+{{ overview.newUsers ?? 0 }} 今日新增</div>
        </div>
      </el-col>
      <el-col :span="4">
        <div class="metric-card metric-clickable" @click="openOrderDetail">
          <div class="metric-label">📋 今日订单</div>
          <div class="metric-value">{{ overview.todayOrders ?? '—' }}</div>
          <div class="metric-extra">点击查看明细 / 历史 ›</div>
        </div>
      </el-col>
      <el-col :span="4">
        <div class="metric-card">
          <div class="metric-label">💰 今日 GMV</div>
          <div class="metric-value">¥{{ formatMoney(overview.todayGmv) }}</div>
          <div class="metric-extra">已支付/已完成实付金额</div>
        </div>
      </el-col>
      <el-col :span="4">
        <div class="metric-card">
          <div class="metric-label">📍 活跃场地</div>
          <div class="metric-value">{{ overview.activeCourts ?? '—' }}</div>
          <div class="metric-extra">已审核通过</div>
        </div>
      </el-col>
      <el-col :span="4">
        <div class="metric-card metric-clickable" @click="openLfgDetail">
          <div class="metric-label">⚽ 今日组队</div>
          <div class="metric-value">{{ overview.todayLfg ?? '—' }}</div>
          <div class="metric-extra">点击查看明细 / 历史 ›</div>
        </div>
      </el-col>
      <el-col :span="4">
        <div class="metric-card">
          <div class="metric-label">🆕 今日新增</div>
          <div class="metric-value">{{ overview.newUsers ?? '—' }}</div>
          <div class="metric-extra">新注册用户</div>
        </div>
      </el-col>
    </el-row>

    <!-- 待处理订单 -->
    <el-row style="margin-top: 20px;">
      <el-col :span="24">
        <div class="page-card">
          <div class="card-header">
            <h3>⏰ 待处理订单（status=booked）</h3>
            <el-button type="primary" link @click="goToOrders">查看全部 →</el-button>
          </div>
          <el-table :data="pendingOrders" stripe v-loading="loadingPending">
            <el-table-column prop="orderNo" label="订单号" width="180" />
            <el-table-column label="预订用户" width="120">
              <template #default="{ row }">
                {{ row.user?.nickname || '—' }}
              </template>
            </el-table-column>
            <el-table-column label="球场" min-width="160">
              <template #default="{ row }">
                {{ row.court?.name || '—' }}
              </template>
            </el-table-column>
            <el-table-column label="时段" width="200">
              <template #default="{ row }">
                <span v-if="row.schedule">{{ formatSchedule(row.schedule.date, row.schedule.timeSlot) }}</span>
                <span v-else>—</span>
              </template>
            </el-table-column>
            <el-table-column label="金额" width="100">
              <template #default="{ row }">¥{{ row.amount }}</template>
            </el-table-column>
            <el-table-column label="下单时间" width="170">
              <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
            </el-table-column>
            <el-table-column label="操作" width="120" fixed="right">
              <template #default="{ row }">
                <el-button type="primary" link size="small" @click="goToOrderDetail(row.id)">去处理</el-button>
              </template>
            </el-table-column>
            <template #empty>
              <div style="padding: 20px; color: #999;">✅ 暂无待处理订单</div>
            </template>
          </el-table>
        </div>
      </el-col>
    </el-row>

    <!-- 图表区 -->
    <el-row :gutter="20" style="margin-top: 20px;">
      <el-col :span="16">
        <div class="page-card">
          <div class="card-header">
            <h3>📈 收入趋势（最近 30 天）</h3>
            <el-radio-group v-model="revenueRange" size="small" @change="loadRevenue">
              <el-radio-button value="7">7 天</el-radio-button>
              <el-radio-button value="30">30 天</el-radio-button>
              <el-radio-button value="90">90 天</el-radio-button>
            </el-radio-group>
          </div>
          <v-chart :option="revenueOption" autoresize style="height: 320px;" v-loading="loadingRevenue" />
        </div>
      </el-col>

      <el-col :span="8">
        <div class="page-card">
          <div class="card-header">
            <h3>🥧 凑人类型分布</h3>
          </div>
          <div style="height: 320px; display: flex; align-items: center; justify-content: center; color: #999;">
            <span v-if="loadingLfg">加载中...</span>
            <span v-else-if="lfgData.length === 0">⚠️ 暂无数据（接口未接通）</span>
            <v-chart v-else :option="lfgOption" autoresize style="height: 320px; width: 100%;" />
          </div>
        </div>
      </el-col>
    </el-row>

    <el-row :gutter="20" style="margin-top: 20px;">
      <el-col :span="12">
        <div class="page-card">
          <div class="card-header">
            <h3>🏆 场地运营 Top 10</h3>
          </div>
          <div style="min-height: 320px;" v-loading="loadingTopCourts">
            <v-chart v-if="topCourtsData.length > 0" :option="topCourtsOption" autoresize style="height: 320px;" />
            <div v-else style="height: 320px; display: flex; align-items: center; justify-content: center; color: #999;">
              ⚠️ 暂无数据
            </div>
          </div>
        </div>
      </el-col>

      <el-col :span="12">
        <div class="page-card">
          <div class="card-header">
            <h3>👥 用户增长（最近 30 天）</h3>
          </div>
          <div style="height: 320px; display: flex; align-items: center; justify-content: center; color: #999;">
            <span v-if="loadingUsers">加载中...</span>
            <span v-else>⚠️ 暂无数据（接口未接通）</span>
          </div>
        </div>
      </el-col>
    </el-row>

    <!-- 订单明细弹窗（含历史） -->
    <el-dialog v-model="orderDlgVisible" title="订单明细" width="960px" destroy-on-close>
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
        <el-select v-model="orderStatus" style="width: 140px; margin-left: 12px;" @change="loadOrderDetails">
          <el-option label="全部状态" value="all" />
          <el-option label="待支付" value="pending" />
          <el-option label="已预订" value="booked" />
          <el-option label="已支付" value="paid" />
          <el-option label="已完成" value="completed" />
          <el-option label="已取消" value="canceled" />
        </el-select>
        <el-button style="margin-left: 12px;" @click="setOrderRangeToday">今日</el-button>
        <el-button @click="setOrderRangeDays(7)">近7天</el-button>
        <el-button @click="setOrderRangeDays(30)">近30天</el-button>
      </div>
      <el-table :data="orderDetailList" stripe v-loading="orderDetailLoading" max-height="480" style="margin-top: 12px;">
        <el-table-column prop="orderNo" label="订单号" width="170" />
        <el-table-column label="用户" width="110">
          <template #default="{ row }">{{ row.user?.nickname || '—' }}</template>
        </el-table-column>
        <el-table-column label="球场" min-width="140">
          <template #default="{ row }">{{ row.court?.name || '—' }}</template>
        </el-table-column>
        <el-table-column label="时段" width="180">
          <template #default="{ row }">
            <span v-if="row.schedule">{{ row.schedule.date }} {{ row.schedule.timeSlot }}</span>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column label="金额" width="90">
          <template #default="{ row }">¥{{ row.amount }}</template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">{{ statusMap[row.status] || row.status }}</template>
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
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next"
          @size-change="loadOrderDetails"
          @current-change="loadOrderDetails"
        />
      </div>
    </el-dialog>

    <!-- 组队明细弹窗（含历史） -->
    <el-dialog v-model="lfgDlgVisible" title="组队明细（凑人 / 约战）" width="960px" destroy-on-close>
      <div class="dlg-toolbar">
        <el-date-picker
          v-model="lfgDateRange"
          type="daterange"
          range-separator="至"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          value-format="YYYY-MM-DD"
          :clearable="false"
          @change="loadLfgDetails"
        />
        <el-select v-model="lfgType" style="width: 120px; margin-left: 12px;" @change="loadLfgDetails">
          <el-option label="全部类型" value="all" />
          <el-option label="凑人" value="sub" />
          <el-option label="约战" value="war" />
        </el-select>
        <el-button style="margin-left: 12px;" @click="setLfgRangeToday">今日</el-button>
        <el-button @click="setLfgRangeDays(7)">近7天</el-button>
        <el-button @click="setLfgRangeDays(30)">近30天</el-button>
      </div>
      <el-table :data="lfgDetailList" stripe v-loading="lfgDetailLoading" max-height="480" style="margin-top: 12px;">
        <el-table-column label="类型" width="80">
          <template #default="{ row }">{{ row.typeLabel }}</template>
        </el-table-column>
        <el-table-column prop="title" label="标题" min-width="140" />
        <el-table-column prop="location" label="地点" min-width="120" />
        <el-table-column label="开踢时间" width="160">
          <template #default="{ row }">{{ formatTime(row.playTime) }}</template>
        </el-table-column>
        <el-table-column label="人数" width="90">
          <template #default="{ row }">{{ row.joinedCount }}/{{ row.needCount }}</template>
        </el-table-column>
        <el-table-column label="发布人" width="110">
          <template #default="{ row }">{{ row.publisher?.nickname || '—' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">{{ row.statusLabel }}</template>
        </el-table-column>
        <el-table-column label="发布时间" width="160">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
        <template #empty>
          <div style="padding: 24px; color: #999;">该时段暂无组队信息</div>
        </template>
      </el-table>
      <div style="margin-top: 12px; text-align: right;" v-if="lfgDetailTotal > 0">
        <el-pagination
          v-model:current-page="lfgPage"
          v-model:page-size="lfgPageSize"
          :total="lfgDetailTotal"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next"
          @size-change="loadLfgDetails"
          @current-change="loadLfgDetails"
        />
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { LineChart, BarChart, PieChart } from 'echarts/charts';
import {
  TitleComponent, TooltipComponent, LegendComponent, GridComponent
} from 'echarts/components';
import VChart from 'vue-echarts';
import { dashboardApi, orderApi } from '@/api';

use([CanvasRenderer, LineChart, BarChart, PieChart, TitleComponent, TooltipComponent, LegendComponent, GridComponent]);

const router = useRouter();

const overview = ref({});
const pendingOrders = ref([]);
const revenueRange = ref('30');
const revenueData = ref([]);
const topCourtsData = ref([]);
const lfgData = ref([]);

const loadingPending = ref(false);
const loadingRevenue = ref(false);
const loadingTopCourts = ref(false);
const loadingLfg = ref(false);
const loadingUsers = ref(false);

const statusMap = {
  pending: '待支付', booked: '已预订', paid: '已支付',
  completed: '已完成', canceled: '已取消', refunded: '已退款'
};

// 订单明细
const orderDlgVisible = ref(false);
const orderDateRange = ref([]);
const orderStatus = ref('all');
const orderDetailList = ref([]);
const orderDetailTotal = ref(0);
const orderPage = ref(1);
const orderPageSize = ref(20);
const orderDetailLoading = ref(false);

// 组队明细
const lfgDlgVisible = ref(false);
const lfgDateRange = ref([]);
const lfgType = ref('all');
const lfgDetailList = ref([]);
const lfgDetailTotal = ref(0);
const lfgPage = ref(1);
const lfgPageSize = ref(20);
const lfgDetailLoading = ref(false);

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

async function loadOverview() {
  try {
    const res = await dashboardApi.overview();
    overview.value = res.data || {};
  } catch (err) {
    console.error('加载总览失败:', err);
  }
}

async function loadPendingOrders() {
  loadingPending.value = true;
  try {
    const res = await orderApi.list({ status: 'booked', page: 1, pageSize: 10 });
    pendingOrders.value = res.data?.list || [];
  } catch (err) {
    console.error('加载待处理订单失败:', err);
  } finally {
    loadingPending.value = false;
  }
}

async function loadRevenue() {
  loadingRevenue.value = true;
  try {
    const res = await dashboardApi.revenue({ days: revenueRange.value });
    revenueData.value = res.data || [];
  } catch (err) {
    console.error('加载收入趋势失败:', err);
  } finally {
    loadingRevenue.value = false;
  }
}

async function loadTopCourts() {
  loadingTopCourts.value = true;
  try {
    const res = await dashboardApi.topCourts();
    topCourtsData.value = res.data || [];
  } catch (err) {
    console.error('加载场地 Top 10 失败:', err);
  } finally {
    loadingTopCourts.value = false;
  }
}

function openOrderDetail() {
  const t = todayStr();
  orderDateRange.value = [t, t];
  orderStatus.value = 'all';
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
    const res = await dashboardApi.orderDetails({
      startDate, endDate,
      status: orderStatus.value,
      page: orderPage.value,
      pageSize: orderPageSize.value
    });
    orderDetailList.value = res.data?.list || [];
    orderDetailTotal.value = res.data?.total || 0;
  } catch (e) {
    console.error(e);
    orderDetailList.value = [];
    orderDetailTotal.value = 0;
  } finally {
    orderDetailLoading.value = false;
  }
}

function openLfgDetail() {
  const t = todayStr();
  lfgDateRange.value = [t, t];
  lfgType.value = 'all';
  lfgPage.value = 1;
  lfgDlgVisible.value = true;
  loadLfgDetails();
}

function setLfgRangeToday() {
  const t = todayStr();
  lfgDateRange.value = [t, t];
  lfgPage.value = 1;
  loadLfgDetails();
}

function setLfgRangeDays(n) {
  lfgDateRange.value = [daysAgoStr(n - 1), todayStr()];
  lfgPage.value = 1;
  loadLfgDetails();
}

async function loadLfgDetails() {
  lfgDetailLoading.value = true;
  try {
    const [startDate, endDate] = lfgDateRange.value || [];
    const res = await dashboardApi.lfgDetails({
      startDate, endDate,
      type: lfgType.value,
      page: lfgPage.value,
      pageSize: lfgPageSize.value
    });
    lfgDetailList.value = res.data?.list || [];
    lfgDetailTotal.value = res.data?.total || 0;
  } catch (e) {
    console.error(e);
    lfgDetailList.value = [];
    lfgDetailTotal.value = 0;
  } finally {
    lfgDetailLoading.value = false;
  }
}

function formatMoney(val) {
  if (val == null) return '—';
  return Number(val).toLocaleString('zh-CN');
}

function formatTime(t) {
  if (!t) return '—';
  const d = new Date(t);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatSchedule(date, timeSlot) {
  if (!date || !timeSlot) return '—';
  return `${date} ${timeSlot}`;
}

function goToOrders() {
  router.push('/ops/orders');
}

function goToOrderDetail(id) {
  router.push({ path: '/ops/orders', query: { id } });
}

const revenueOption = computed(() => {
  const xData = revenueData.value.map(d => d.date?.slice(5) || '');
  const yData = revenueData.value.map(d => Number(d.amount) || 0);
  return {
    tooltip: { trigger: 'axis' },
    grid: { left: 60, right: 20, top: 30, bottom: 30 },
    xAxis: {
      type: 'category',
      data: xData.length > 0 ? xData : Array.from({ length: 30 }, (_, i) => `${i + 1}日`),
      axisLine: { lineStyle: { color: '#E0E0E0' } }
    },
    yAxis: { type: 'value', axisLabel: { formatter: '¥{value}' } },
    series: [{
      name: 'GMV',
      type: 'line',
      smooth: true,
      data: yData.length > 0 ? yData : [],
      lineStyle: { color: '#FF6B00', width: 3 },
      itemStyle: { color: '#FF6B00' },
      areaStyle: {
        color: {
          type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(255, 107, 0, 0.3)' },
            { offset: 1, color: 'rgba(255, 107, 0, 0)' }
          ]
        }
      }
    }]
  };
});

const lfgOption = computed(() => ({
  tooltip: { trigger: 'item' },
  legend: { bottom: 0 },
  series: [{
    type: 'pie',
    radius: ['45%', '70%'],
    avoidLabelOverlap: false,
    itemStyle: { borderRadius: 8, borderColor: '#fff', borderWidth: 2 },
    label: { show: true, formatter: '{b}\n{d}%' },
    data: lfgData.value.length > 0 ? lfgData.value : []
  }]
}));

const topCourtsOption = computed(() => {
  const sorted = [...topCourtsData.value].sort((a, b) => Number(a.revenue) - Number(b.revenue));
  return {
    tooltip: { trigger: 'axis' },
    grid: { left: 100, right: 30, top: 20, bottom: 30 },
    xAxis: { type: 'value', axisLabel: { formatter: '¥{value}' } },
    yAxis: { type: 'category', data: sorted.map(d => d.name), axisLabel: { fontSize: 12 } },
    series: [{
      name: '收入',
      type: 'bar',
      data: sorted.map(d => Number(d.revenue) || 0),
      itemStyle: {
        color: {
          type: 'linear', x: 0, y: 0, x2: 1, y2: 0,
          colorStops: [
            { offset: 0, color: '#FF8C42' },
            { offset: 1, color: '#FF6B00' }
          ]
        },
        borderRadius: [0, 8, 8, 0]
      }
    }]
  };
});

onMounted(() => {
  loadOverview();
  loadPendingOrders();
  loadRevenue();
  loadTopCourts();
});
</script>

<style lang="scss" scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;

  h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
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

.dlg-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}
</style>
