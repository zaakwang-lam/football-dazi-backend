<template>
  <div class="page-card">
    <el-tabs v-model="activeTab">
      <el-tab-pane label="待审核" name="pending" />
      <el-tab-pane label="已通过" name="approved" />
      <el-tab-pane label="已拒绝" name="rejected" />
    </el-tabs>

    <el-table :data="courts" stripe>
      <el-table-column prop="name" label="场地名称" />
      <el-table-column prop="owner" label="场地方" width="160" />
      <el-table-column prop="type" label="类型" width="100" />
      <el-table-column prop="address" label="地址" />
      <el-table-column prop="price" label="单价" width="100">
        <template #default="{ row }">¥{{ row.price }}/场</template>
      </el-table-column>
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="getStatusType(row.status)">{{ getStatusText(row.status) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="200">
        <template #default>
          <el-button v-if="row?.status === 'pending'" size="small" type="primary" @click="onApprove">通过</el-button>
          <el-button v-if="row?.status === 'pending'" size="small" type="danger" @click="onReject">拒绝</el-button>
          <el-button size="small" link>查看</el-button>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { ElMessage } from 'element-plus';

const activeTab = ref('pending');

const courts = ref([
  { id: 1, name: '越秀五人球场', owner: '李经理', type: '5人制', address: '广州市越秀区北京路', price: 280, status: 'pending' },
  { id: 2, name: '黄埔7人制球场', owner: '王经理', type: '7人制', address: '广州市黄埔区科学城', price: 600, status: 'pending' }
]);

function getStatusType(status) {
  return { pending: 'warning', approved: 'success', rejected: 'info' }[status] || 'info';
}
function getStatusText(status) {
  return { pending: '待审核', approved: '已通过', rejected: '已拒绝' }[status] || status;
}

function onApprove() {
  ElMessage.success('已通过审核');
}
function onReject() {
  ElMessage.warning('已拒绝');
}
</script>