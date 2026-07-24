<template>
  <div class="finance-page">
    <!-- 财务概览 -->
    <el-row :gutter="20">
      <el-col :span="6">
        <div class="metric-card">
          <div class="metric-label">💰 可提现余额</div>
          <div class="metric-value">¥5,680</div>
          <el-button type="primary" size="small" style="margin-top: 12px;" @click="onWithdraw">申请提现</el-button>
        </div>
      </el-col>
      <el-col :span="6">
        <div class="metric-card">
          <div class="metric-label">📊 累计收入</div>
          <div class="metric-value">¥38,560</div>
          <div class="metric-extra">本月 ¥12,800</div>
        </div>
      </el-col>
      <el-col :span="6">
        <div class="metric-card">
          <div class="metric-label">⏳ 待结算</div>
          <div class="metric-value">¥1,200</div>
          <div class="metric-extra">T+1 自动到账</div>
        </div>
      </el-col>
      <el-col :span="6">
        <div class="metric-card">
          <div class="metric-label">🏦 已提现</div>
          <div class="metric-value">¥30,000</div>
          <div class="metric-extra">累计 8 笔</div>
        </div>
      </el-col>
    </el-row>

    <!-- 交易流水 -->
    <div class="page-card" style="margin-top: 20px;">
      <h3 style="margin: 0 0 20px; font-size: 16px; font-weight: 600;">交易流水</h3>

      <el-table :data="transactions" stripe>
        <el-table-column prop="time" label="时间" width="180" />
        <el-table-column prop="type" label="类型" width="120" />
        <el-table-column prop="orderNo" label="订单号" width="180" />
        <el-table-column prop="remark" label="说明" />
        <el-table-column label="金额" width="140" align="right">
          <template #default="{ row }">
            <span :class="row.direction === 'in' ? 'amount-in' : 'amount-out'">
              {{ row.direction === 'in' ? '+' : '-' }}¥{{ row.amount }}
            </span>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { ElMessage } from 'element-plus';

const transactions = ref([
  { time: '2026-07-23 16:30', type: '订单收入', orderNo: 'O202607230001', amount: 1200, direction: 'in', remark: '老王 - 今晚 19:00-21:00' },
  { time: '2026-07-22 20:15', type: '订单收入', orderNo: 'O202607220015', amount: 1200, direction: 'in', remark: '小林 - 昨天 20:00-22:00' },
  { time: '2026-07-20 10:00', type: '提现', orderNo: 'W202607200001', amount: 5000, direction: 'out', remark: '提现到招商银行' },
  { time: '2026-07-18 19:30', type: '订单收入', orderNo: 'O202607180022', amount: 1200, direction: 'in', remark: '阿强 - 7/18 19:00-21:00' }
]);

function onWithdraw() {
  ElMessage.success('提现申请已提交，预计 T+1 工作日到账');
}
</script>

<style lang="scss" scoped>
.amount-in {
  color: #2ECC71;
  font-weight: 600;
}
.amount-out {
  color: #FF4757;
  font-weight: 600;
}
</style>