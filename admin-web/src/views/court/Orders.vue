<template>
  <div class="orders-page">
    <div class="page-card">
      <el-tabs v-model="activeTab">
        <el-tab-pane label="全部" name="all" />
        <el-tab-pane label="待确认" name="pending" />
        <el-tab-pane label="已支付" name="paid" />
        <el-tab-pane label="已完成" name="completed" />
        <el-tab-pane label="已退款" name="refunded" />
      </el-tabs>

      <el-table :data="orders" stripe>
        <el-table-column prop="orderNo" label="订单号" width="160" />
        <el-table-column prop="courtName" label="场地" />
        <el-table-column prop="customer" label="客户" width="120" />
        <el-table-column prop="time" label="时段" width="200" />
        <el-table-column label="金额" width="120">
          <template #default="{ row }">
            <span class="price">¥{{ row.amount }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :class="`status-tag ${row.status}`">{{ statusMap[row.status] }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180">
          <template #default="{ row }">
            <el-button v-if="row.status === 'pending'" size="small" type="primary" link>确认</el-button>
            <el-button v-if="row.status === 'pending'" size="small" type="danger" link>拒绝</el-button>
            <el-button size="small" link>详情</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-model:current-page="page"
        :total="total"
        :page-size="20"
        layout="total, prev, pager, next, jumper"
        style="margin-top: 20px; justify-content: flex-end;"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';

const activeTab = ref('all');
const page = ref(1);
const total = ref(3);

const statusMap = {
  pending: '待确认',
  paid: '已支付',
  completed: '已完成',
  refunded: '已退款',
  canceled: '已取消'
};

const orders = ref([
  { id: 1, orderNo: 'O202607230001', courtName: '天河体育中心 11人场', customer: '老王', time: '今晚 19:00-21:00', amount: 1200, status: 'pending' },
  { id: 2, orderNo: 'O202607230002', courtName: '天河体育中心 11人场', customer: '阿强', time: '今晚 21:00-23:00', amount: 1200, status: 'paid' },
  { id: 3, orderNo: 'O202607220015', courtName: '天河体育中心 11人场', customer: '小林', time: '昨天 20:00-22:00', amount: 1200, status: 'completed' }
]);
</script>

<style lang="scss" scoped>
.price {
  color: #FF6B00;
  font-weight: 600;
}
</style>