<template>
  <div class="page-card">
    <h3>我的业务</h3>
    <p class="tip">{{ note }}</p>
    <el-descriptions :column="2" border style="margin: 16px 0;">
      <el-descriptions-item label="姓名">{{ profile.realName || '-' }}</el-descriptions-item>
      <el-descriptions-item label="用户名">{{ profile.username || '-' }}</el-descriptions-item>
      <el-descriptions-item label="手机">{{ profile.phone || '-' }}</el-descriptions-item>
      <el-descriptions-item label="服务城市">{{ profile.region || '-' }}</el-descriptions-item>
      <el-descriptions-item label="收款账户" :span="2">{{ profile.bankName || '-' }} {{ profile.bankAccount || '' }}</el-descriptions-item>
    </el-descriptions>

    <h4>绑定球场</h4>
    <el-table :data="profile.courts || []" size="small" empty-text="还没有绑定球场">
      <el-table-column prop="name" label="球场" />
      <el-table-column prop="district" label="地区" width="160" />
      <el-table-column prop="address" label="地址" />
    </el-table>

    <h4 style="margin-top: 20px;">相关订单</h4>
    <el-table :data="orders" size="small" empty-text="暂无订单">
      <el-table-column prop="orderNo" label="订单号" min-width="160" />
      <el-table-column prop="courtName" label="球场" min-width="140" />
      <el-table-column prop="status" label="状态" width="100" />
      <el-table-column prop="payAmount" label="实付" width="90" />
      <el-table-column prop="floorPrice" label="合作底价" width="100" />
    </el-table>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue';
import { cityManagerApi } from '@/api';

const profile = reactive({ courts: [] });
const orders = ref([]);
const note = ref('报酬结算尚未开通。');

onMounted(async () => {
  const [me, orderRes] = await Promise.all([cityManagerApi.me(), cityManagerApi.myOrders()]);
  if (me.code === 0) Object.assign(profile, me.data || {});
  if (orderRes.code === 0) {
    orders.value = orderRes.data?.list || [];
    note.value = orderRes.data?.note || note.value;
  }
});
</script>
