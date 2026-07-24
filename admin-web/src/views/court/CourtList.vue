<template>
  <div class="court-list-page">
    <div class="page-card">
      <div class="toolbar">
        <h3>我的场地</h3>
        <el-button type="primary" :icon="Plus" @click="onAdd">新增场地</el-button>
      </div>

      <el-table :data="courts" stripe>
        <el-table-column prop="name" label="场地名称" />
        <el-table-column prop="type" label="类型" width="100" />
        <el-table-column prop="address" label="地址" />
        <el-table-column prop="price" label="单价" width="100">
          <template #default="{ row }">¥{{ row.price }}/场</template>
        </el-table-column>
        <el-table-column prop="rating" label="评分" width="100">
          <template #default="{ row }">⭐ {{ row.rating }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 1 ? 'success' : 'info'">
              {{ row.status === 1 ? '营业中' : '休息' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180">
          <template #default>
            <el-button size="small" link>编辑</el-button>
            <el-button size="small" link>排期</el-button>
            <el-button size="small" link type="danger">下架</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { Plus } from '@element-plus/icons-vue';
import { courtApi } from '@/api';
import { ElMessage } from 'element-plus';

const courts = ref([]);

async function loadData() {
  try {
    const res = await courtApi.list();
    if (res.code === 0) {
      courts.value = res.data.list || [];
    }
  } catch (e) {
    // 后端未启动时使用 mock
    courts.value = [
      { id: 1, name: '天河体育中心 11人场', type: '11人制', address: '广州市天河区天河路299号', price: 1200, rating: 4.8, status: 1 },
      { id: 2, name: '天河体育中心 7人场', type: '7人制', address: '广州市天河区天河路299号', price: 580, rating: 4.7, status: 1 }
    ];
  }
}

function onAdd() {
  ElMessage.info('新增场地表单开发中');
}

onMounted(loadData);
</script>

<style lang="scss" scoped>
.toolbar {
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