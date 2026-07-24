<template>
  <div class="ops-dashboard">
    <!-- 核心指标 -->
    <el-row :gutter="20">
      <el-col :span="4">
        <div class="metric-card">
          <div class="metric-label">👥 总用户</div>
          <div class="metric-value">12,350</div>
          <div class="metric-extra">+156 今日新增</div>
        </div>
      </el-col>
      <el-col :span="4">
        <div class="metric-card">
          <div class="metric-label">📋 今日订单</div>
          <div class="metric-value">156</div>
          <div class="metric-extra">+12% 较昨日</div>
        </div>
      </el-col>
      <el-col :span="4">
        <div class="metric-card">
          <div class="metric-label">💰 今日 GMV</div>
          <div class="metric-value">¥78,500</div>
          <div class="metric-extra">平台收入 ¥7,850</div>
        </div>
      </el-col>
      <el-col :span="4">
        <div class="metric-card">
          <div class="metric-label">📍 活跃场地</div>
          <div class="metric-value">38</div>
          <div class="metric-extra">共 65 家</div>
        </div>
      </el-col>
      <el-col :span="4">
        <div class="metric-card">
          <div class="metric-label">👥 凑人发布</div>
          <div class="metric-value">12</div>
          <div class="metric-extra">成功率 78%</div>
        </div>
      </el-col>
      <el-col :span="4">
        <div class="metric-card">
          <div class="metric-label">🏆 新增球队</div>
          <div class="metric-value">3</div>
          <div class="metric-extra">活跃球队 248</div>
        </div>
      </el-col>
    </el-row>

    <!-- 图表区 -->
    <el-row :gutter="20" style="margin-top: 20px;">
      <el-col :span="16">
        <div class="page-card">
          <div class="card-header">
            <h3>📈 收入趋势（最近 30 天）</h3>
            <el-radio-group v-model="revenueRange" size="small">
              <el-radio-button value="7">7 天</el-radio-button>
              <el-radio-button value="30">30 天</el-radio-button>
              <el-radio-button value="90">90 天</el-radio-button>
            </el-radio-group>
          </div>
          <v-chart :option="revenueOption" autoresize style="height: 320px;" />
        </div>
      </el-col>

      <el-col :span="8">
        <div class="page-card">
          <div class="card-header">
            <h3>🥧 凑人类型分布</h3>
          </div>
          <v-chart :option="lfgOption" autoresize style="height: 320px;" />
        </div>
      </el-col>
    </el-row>

    <el-row :gutter="20" style="margin-top: 20px;">
      <el-col :span="12">
        <div class="page-card">
          <div class="card-header">
            <h3>🏆 场地运营 Top 10</h3>
          </div>
          <v-chart :option="topCourtsOption" autoresize style="height: 320px;" />
        </div>
      </el-col>

      <el-col :span="12">
        <div class="page-card">
          <div class="card-header">
            <h3>👥 用户增长（最近 30 天）</h3>
          </div>
          <v-chart :option="userGrowthOption" autoresize style="height: 320px;" />
        </div>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { LineChart, BarChart, PieChart } from 'echarts/charts';
import {
  TitleComponent, TooltipComponent, LegendComponent, GridComponent
} from 'echarts/components';
import VChart from 'vue-echarts';

use([CanvasRenderer, LineChart, BarChart, PieChart, TitleComponent, TooltipComponent, LegendComponent, GridComponent]);

const revenueRange = ref('30');

// 收入趋势
const revenueOption = computed(() => ({
  tooltip: { trigger: 'axis' },
  xAxis: {
    type: 'category',
    data: Array.from({ length: 30 }, (_, i) => `${i + 1}日`),
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
    data: Array.from({ length: 30 }, () => Math.floor(Math.random() * 50000 + 30000)),
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
}));

// 凑人分布
const lfgOption = computed(() => ({
  tooltip: { trigger: 'item' },
  legend: { bottom: 0 },
  series: [{
    type: 'pie',
    radius: ['45%', '70%'],
    avoidLabelOverlap: false,
    itemStyle: { borderRadius: 8, borderColor: '#fff', borderWidth: 2 },
    label: { show: true, formatter: '{b}\n{d}%' },
    data: [
      { value: 45, name: '找人顶', itemStyle: { color: '#FF6B00' } },
      { value: 30, name: '约战', itemStyle: { color: '#007AFF' } },
      { value: 25, name: '凑局', itemStyle: { color: '#2ECC71' } }
    ]
  }]
}));

// 场地 Top 10
const topCourtsOption = computed(() => ({
  tooltip: { trigger: 'axis' },
  grid: { left: 100 },
  xAxis: { type: 'value' },
  yAxis: {
    type: 'category',
    data: ['白云山体育公园', '番禺五人球场A', '海珠飓风场', '海珠7人制球场', '天河体育中心'].reverse(),
    axisLabel: { fontSize: 12 }
  },
  series: [{
    type: 'bar',
    data: [8500, 12000, 18500, 22000, 35000].reverse(),
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
}));

// 用户增长
const userGrowthOption = computed(() => ({
  tooltip: { trigger: 'axis' },
  xAxis: {
    type: 'category',
    data: Array.from({ length: 30 }, (_, i) => `${i + 1}日`),
    axisLine: { lineStyle: { color: '#E0E0E0' } }
  },
  yAxis: { type: 'value' },
  series: [{
    type: 'line',
    smooth: true,
    data: Array.from({ length: 30 }, (_, i) => 8000 + i * 100 + Math.floor(Math.random() * 200)),
    lineStyle: { color: '#007AFF', width: 3 },
    itemStyle: { color: '#007AFF' },
    areaStyle: {
      color: {
        type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
        colorStops: [
          { offset: 0, color: 'rgba(0, 122, 255, 0.3)' },
          { offset: 1, color: 'rgba(0, 122, 255, 0)' }
        ]
      }
    }
  }]
}));
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