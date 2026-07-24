<template>
  <div class="page-card">
    <el-input v-model="keyword" placeholder="搜索订单号/客户" style="width: 280px; margin-bottom: 16px;" />

    <el-table :data="orders" stripe>
      <el-table-column prop="orderNo" label="订单号" width="180" />
      <el-table-column prop="user" label="用户" width="120" />
      <el-table-column prop="courtName" label="场地" />
      <el-table-column prop="time" label="时段" width="180" />
      <el-table-column label="金额" width="100">
        <template #default="{ row }">¥{{ row.amount }}</template>
      </el-table-column>
      <el-table-column label="平台收入" width="100">
        <template #default="{ row }">¥{{ (row.amount * 0.1).toFixed(0) }}</template>
      </el-table-column>
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="getStatusType(row.status)">{{ statusMap[row.status] }}</el-tag>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup>
import { ref } from 'vue';

const keyword = ref('');

const statusMap = {
  pending: '待支付', paid: '已支付', completed: '已完成', refunded: '已退款', canceled: '已取消'
};

const orders = ref([
  { id: 1, orderNo: 'O202607230001', user: '越秀老王', courtName: '天河体育中心 11人场', time: '今晚 19:00-21:00', amount: 1200, status: 'paid' },
  { id: 2, orderNo: 'O202607230002', user: '海珠阿强', courtName: '海珠7人制球场', time: '今晚 21:00-23:00', amount: 580, status: 'completed' },
  { id: 3, orderNo: 'O202607230003', user: '天河小林', courtName: '番禺五人球场A', time: '明天 19:00-21:00', amount: 280, status: 'pending' }
]);

function getStatusType(status) {
  return { pending: 'warning', paid: 'primary', completed: 'success', refunded: 'info', canceled: 'info' }[status] || 'info';
}
</script>