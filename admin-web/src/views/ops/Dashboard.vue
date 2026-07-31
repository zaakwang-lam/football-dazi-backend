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
        <div class="metric-card">
          <div class="metric-label">📋 今日订单</div>
          <div class="metric-value">{{ overview.todayOrders ?? '—' }}</div>
          <div class="metric-extra">含已预订/已支付</div>
        </div>
      </el-col>
      <el-col :span="4">
        <div class="metric-card">
          <div class="metric-label">💰 今日 GMV</div>
          <div class="metric-value">¥{{ formatMoney(overview.todayGmv) }}</div>
          <div class="metric-extra">已支付订单</div>
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
        <div class="metric-card">
          <div class="metric-label">⚽ 今日组队</div>
          <div class="metric-value">{{ overview.todayLfg ?? '—' }}</div>
          <div class="metric-extra">凑人/约战发布数</div>
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

    <!-- 待处理订单（2026-07-31 新增） -->
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

// ========== 状态 ==========
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

// ========== 数据加载 ==========
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

// ========== 工具方法 ==========
function formatMoney(val) {
  if (val == null) return '—';
  return Number(val).toLocaleString('zh-CN');
}

function formatTime(t) {
  if (!t) return '—';
  const d = new Date(t);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
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

// ========== 图表 ==========
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
    yAxis: {
      type: 'value',
      axisLabel: { formatter: '¥{value}' }
    },
    series: [{
      name: 'GMV',
      type: 'line',
      smooth: true,
      data: yData.length > 0 ? yData : [],
      lineStyle: { color: '#FF6B00', width: 3 },
      itemStyle: { color: '#FF6B00' },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0, y: 0, x2: 0, y2: 1,
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
    yAxis: {
      type: 'category',
      data: sorted.map(d => d.name),
      axisLabel: { fontSize: 12 }
    },
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

// ========== 初始化 ==========
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
</style>