<template>
  <div class="dashboard">
    <!-- 今日数据 -->
    <el-row :gutter="20">
      <el-col :span="6">
        <div class="metric-card">
          <div class="metric-label">📋 今日订单</div>
          <div class="metric-value">12</div>
          <div class="metric-extra">+3 较昨日</div>
        </div>
      </el-col>
      <el-col :span="6">
        <div class="metric-card">
          <div class="metric-label">💰 今日收入</div>
          <div class="metric-value">¥3,200</div>
          <div class="metric-extra">+12% 较昨日</div>
        </div>
      </el-col>
      <el-col :span="6">
        <div class="metric-card">
          <div class="metric-label">👥 新增客户</div>
          <div class="metric-value">5</div>
          <div class="metric-extra">+2 较昨日</div>
        </div>
      </el-col>
      <el-col :span="6">
        <div class="metric-card">
          <div class="metric-label">⭐ 场地评分</div>
          <div class="metric-value">4.8</div>
          <div class="metric-extra">基于 156 条评价</div>
        </div>
      </el-col>
    </el-row>

    <!-- 待处理订单 -->
    <div class="page-card" style="margin-top: 20px;">
      <div class="card-header">
        <h3>待处理订单 (3)</h3>
        <el-button type="primary" link @click="$router.push('/orders')">查看全部 ›</el-button>
      </div>

      <el-table :data="pendingOrders" stripe>
        <el-table-column prop="orderNo" label="订单号" width="140" />
        <el-table-column prop="courtName" label="场地" />
        <el-table-column prop="customer" label="客户" width="100" />
        <el-table-column prop="time" label="时段" width="140" />
        <el-table-column prop="amount" label="金额" width="100">
          <template #default="{ row }">¥{{ row.amount }}</template>
        </el-table-column>
        <el-table-column label="操作" width="180">
          <template #default>
            <el-button size="small" type="primary">确认</el-button>
            <el-button size="small">拒绝</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 最近评价 -->
    <div class="page-card" style="margin-top: 20px;">
      <div class="card-header">
        <h3>💬 最近评价</h3>
      </div>
      <div class="review-list">
        <div class="review-item" v-for="(r, i) in recentReviews" :key="i">
          <el-avatar :size="40">{{ r.name[0] }}</el-avatar>
          <div class="review-content">
            <div class="review-name">{{ r.name }} <span class="rating">⭐⭐⭐⭐⭐</span></div>
            <div class="review-text">{{ r.text }}</div>
            <div class="review-time">{{ r.time }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';

const pendingOrders = ref([
  { orderNo: 'O1001', courtName: '天河体育中心 11人场', customer: '老王', time: '今晚 19:00-21:00', amount: 1200 },
  { orderNo: 'O1002', courtName: '天河体育中心 11人场', customer: '阿强', time: '今晚 21:00-23:00', amount: 1200 },
  { orderNo: 'O1003', courtName: '天河体育中心 11人场', customer: '小林', time: '明天 19:00-21:00', amount: 1200 }
]);

const recentReviews = ref([
  { name: '王队长', text: '场地质量好，灯光夜场效果佳，下次再来！', time: '3 天前' },
  { name: '李前锋', text: '停车场大，旁边吃饭方便，价格略贵。', time: '1 周前' }
]);
</script>

<style lang="scss" scoped>
.dashboard {
  :deep(.metric-card) {
    background: linear-gradient(135deg, #FFFFFF 0%, #FFFAF5 100%);
    border: 1px solid #FFE8D6;
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

.review-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.review-item {
  display: flex;
  gap: 12px;

  .review-content {
    flex: 1;

    .review-name {
      font-size: 14px;
      font-weight: 600;
      color: #1A1A1A;

      .rating {
        margin-left: 8px;
        color: #FFB800;
        font-weight: normal;
      }
    }

    .review-text {
      margin: 4px 0;
      font-size: 14px;
      color: #666666;
      line-height: 1.5;
    }

    .review-time {
      font-size: 12px;
      color: #999999;
    }
  }
}
</style>