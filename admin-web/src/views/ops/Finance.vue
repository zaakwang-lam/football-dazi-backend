<template>
  <div class="page-card">
    <el-row :gutter="20" style="margin-bottom: 24px;">
      <el-col :span="8">
        <div class="metric-card">
          <div class="metric-label">💰 平台累计收入</div>
          <div class="metric-value">¥38,560</div>
        </div>
      </el-col>
      <el-col :span="8">
        <div class="metric-card">
          <div class="metric-label">🏦 待结算给场地方</div>
          <div class="metric-value">¥12,800</div>
        </div>
      </el-col>
      <el-col :span="8">
        <div class="metric-card">
          <div class="metric-label">⏳ 待审批提现</div>
          <div class="metric-value">3</div>
        </div>
      </el-col>
    </el-row>

    <h3 style="margin: 0 0 16px; font-size: 16px; font-weight: 600;">提现申请</h3>
    <el-table :data="withdraws" stripe>
      <el-table-column prop="withdrawNo" label="提现单号" width="180" />
      <el-table-column prop="courtName" label="场地方" />
      <el-table-column prop="bankAccount" label="收款账户" width="200" />
      <el-table-column label="金额" width="120">
        <template #default="{ row }">¥{{ row.amount }}</template>
      </el-table-column>
      <el-table-column prop="time" label="申请时间" width="180" />
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="row.status === 'pending' ? 'warning' : 'success'">
            {{ row.status === 'pending' ? '待审批' : '已打款' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="180">
        <template #default="{ row }">
          <template v-if="row.status === 'pending'">
            <el-button size="small" type="primary" @click="onApprove(row)">通过</el-button>
            <el-button size="small" type="danger" @click="onReject(row)">拒绝</el-button>
          </template>
          <el-button v-else size="small" link>查看</el-button>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { ElMessage } from 'element-plus';

const withdraws = ref([
  { id: 1, withdrawNo: 'W202607230001', courtName: '天河体育中心', bankAccount: '招商银行 6225****1234', amount: 5000, time: '2026-07-23 10:30', status: 'pending' },
  { id: 2, withdrawNo: 'W202607220001', courtName: '海珠7人制球场', bankAccount: '工商银行 6222****5678', amount: 3000, time: '2026-07-22 14:20', status: 'pending' },
  { id: 3, withdrawNo: 'W202607200001', courtName: '番禺五人球场A', bankAccount: '建设银行 6217****9012', amount: 2000, time: '2026-07-20 09:15', status: 'pending' }
]);

function onApprove(row) {
  row.status = 'approved';
  ElMessage.success(`已批准提现 ¥${row.amount}`);
}
function onReject(row) {
  row.status = 'rejected';
  ElMessage.warning('已拒绝');
}
</script>