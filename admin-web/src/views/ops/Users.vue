<template>
  <div class="page-card">
    <div class="toolbar">
      <el-input v-model="keyword" placeholder="搜索手机号/昵称" style="width: 240px;" :prefix-icon="Search" />
      <el-select v-model="filterStatus" placeholder="状态" style="width: 140px; margin-left: 12px;">
        <el-option label="全部" value="" />
        <el-option label="正常" :value="1" />
        <el-option label="禁用" :value="0" />
      </el-select>
    </div>

    <el-table :data="users" stripe>
      <el-table-column prop="id" label="ID" width="80" />
      <el-table-column label="头像/昵称" width="200">
        <template #default="{ row }">
          <div style="display:flex;align-items:center;gap:8px;">
            <el-avatar :size="32">{{ row.nickname?.[0] || 'U' }}</el-avatar>
            <span>{{ row.nickname }}</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="phone" label="手机号" width="140" />
      <el-table-column prop="city" label="城市" width="100" />
      <el-table-column prop="level" label="水平" width="100" />
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="row.status === 1 ? 'success' : 'danger'">
            {{ row.status === 1 ? '正常' : '禁用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="createdAt" label="注册时间" width="180" />
      <el-table-column label="操作" width="180">
        <template #default>
          <el-button size="small" link>详情</el-button>
          <el-button size="small" link type="danger">禁用</el-button>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { Search } from '@element-plus/icons-vue';

const keyword = ref('');
const filterStatus = ref('');

const users = ref([
  { id: 1, nickname: '越秀老王', phone: '138****0001', city: '广州', level: '业余校队', status: 1, createdAt: '2026-01-15 10:30' },
  { id: 2, nickname: '海珠阿强', phone: '138****0002', city: '广州', level: '业余', status: 1, createdAt: '2026-02-20 14:00' },
  { id: 3, nickname: '天河小林', phone: '138****0003', city: '广州', level: '新手友好', status: 1, createdAt: '2026-03-10 19:15' },
  { id: 4, nickname: '白云阿飞', phone: '138****0004', city: '广州', level: '业余', status: 0, createdAt: '2026-04-05 16:45' }
]);
</script>

<style lang="scss" scoped>
.toolbar {
  display: flex;
  align-items: center;
  margin-bottom: 20px;
}
</style>