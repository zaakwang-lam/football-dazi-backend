<template>
  <div class="page-card">
    <div class="card-header">
      <h3>⚽ 球队管理</h3>
      <div style="display: flex; gap: 12px;">
        <el-input v-model="keyword" placeholder="搜索球队名称/区域" style="width: 240px;" clearable @keyup.enter="loadList" />
        <el-button @click="loadList">搜索</el-button>
        <el-button type="primary" @click="loadList">刷新</el-button>
      </div>
    </div>

    <el-table :data="list" stripe v-loading="loading" border>
      <el-table-column prop="id" label="ID" width="70" />
      <el-table-column label="行政区划" width="160">
        <template #default="{ row }">
          {{ row.province || '—' }} {{ row.city || '' }} {{ row.district || '' }}
        </template>
      </el-table-column>
      <el-table-column prop="name" label="球队名称" min-width="140" />
      <el-table-column prop="captainName" label="队长" width="110" />
      <el-table-column prop="captainPhone" label="队长电话" width="130" />
      <el-table-column prop="matchType" label="队制" width="100" />
      <el-table-column prop="memberCount" label="队员人数" width="100" />
      <el-table-column prop="bookCount" label="预订场次" width="100" />
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag :type="row.status === 1 ? 'success' : 'info'">{{ row.status === 1 ? '正常' : '已解散' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="220" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="onView(row)">查看</el-button>
          <el-button size="small" @click="onEdit(row)">编辑</el-button>
          <el-button size="small" type="danger" link @click="onDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div style="margin-top: 16px; text-align: right;" v-if="total > 0">
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next"
        @size-change="loadList"
        @current-change="loadList"
      />
    </div>

    <el-dialog v-model="detailVisible" title="球队详情" width="560px">
      <el-descriptions v-if="current" :column="2" border>
        <el-descriptions-item label="球队名称">{{ current.name }}</el-descriptions-item>
        <el-descriptions-item label="队制">{{ current.matchType || '—' }}</el-descriptions-item>
        <el-descriptions-item label="省">{{ current.province }}</el-descriptions-item>
        <el-descriptions-item label="市">{{ current.city }}</el-descriptions-item>
        <el-descriptions-item label="区域">{{ current.district || '—' }}</el-descriptions-item>
        <el-descriptions-item label="队员人数">{{ current.memberCount }}</el-descriptions-item>
        <el-descriptions-item label="队长">{{ current.captainName }}</el-descriptions-item>
        <el-descriptions-item label="队长电话">{{ current.captainPhone || '—' }}</el-descriptions-item>
        <el-descriptions-item label="预订场次">{{ current.bookCount }}</el-descriptions-item>
        <el-descriptions-item label="成立">{{ current.founded || '—' }}</el-descriptions-item>
        <el-descriptions-item label="口号" :span="2">{{ current.motto || '—' }}</el-descriptions-item>
      </el-descriptions>
    </el-dialog>

    <el-dialog v-model="editVisible" title="编辑球队" width="520px" destroy-on-close>
      <el-form :model="editForm" label-width="100px">
        <el-form-item label="球队名称">
          <el-input v-model="editForm.name" maxlength="64" />
        </el-form-item>
        <el-form-item label="省">
          <el-input v-model="editForm.province" maxlength="32" />
        </el-form-item>
        <el-form-item label="市">
          <el-input v-model="editForm.city" maxlength="32" />
        </el-form-item>
        <el-form-item label="区域">
          <el-input v-model="editForm.district" maxlength="32" placeholder="如：天河区" />
        </el-form-item>
        <el-form-item label="队制">
          <el-select v-model="editForm.matchType" style="width: 100%;" clearable>
            <el-option v-for="t in matchTypes" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="队长电话">
          <el-input v-model="editForm.captainPhone" maxlength="20" />
        </el-form-item>
        <el-form-item label="队员人数">
          <el-input-number v-model="editForm.memberCount" :min="0" :max="99" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="editForm.status" style="width: 100%;">
            <el-option label="正常" :value="1" />
            <el-option label="已解散" :value="0" />
          </el-select>
        </el-form-item>
        <el-form-item label="口号">
          <el-input v-model="editForm.motto" maxlength="128" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="confirmEdit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { teamApi } from '@/api';

const keyword = ref('');
const list = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const loading = ref(false);
const saving = ref(false);
const detailVisible = ref(false);
const editVisible = ref(false);
const current = ref(null);
const matchTypes = ['11人制', '8人制', '7人制', '5人制', '3人制'];
const editForm = ref({
  id: null, name: '', province: '广东省', city: '广州市', district: '',
  matchType: '', captainPhone: '', memberCount: 0, status: 1, motto: ''
});

async function loadList() {
  loading.value = true;
  try {
    const res = await teamApi.list({
      keyword: keyword.value || undefined,
      page: page.value,
      pageSize: pageSize.value
    });
    list.value = res.data?.list || [];
    total.value = res.data?.total || 0;
  } catch (e) {
    ElMessage.error(e.message || '加载失败');
  } finally {
    loading.value = false;
  }
}

function onView(row) {
  current.value = row;
  detailVisible.value = true;
}

function onEdit(row) {
  editForm.value = {
    id: row.id,
    name: row.name || '',
    province: row.province || '广东省',
    city: row.city || '广州市',
    district: row.district || '',
    matchType: row.matchType || '',
    captainPhone: row.captainPhone || '',
    memberCount: Number(row.memberCount) || 0,
    status: row.status === 0 ? 0 : 1,
    motto: row.motto || ''
  };
  editVisible.value = true;
}

async function confirmEdit() {
  const f = editForm.value;
  if (!f.id) return;
  if (!f.name) return ElMessage.warning('请填写球队名称');
  saving.value = true;
  try {
    await teamApi.update(f.id, {
      name: f.name,
      province: f.province,
      city: f.city,
      district: f.district,
      matchType: f.matchType,
      captainPhone: f.captainPhone,
      memberCount: f.memberCount,
      status: f.status,
      motto: f.motto
    });
    ElMessage.success('已保存');
    editVisible.value = false;
    loadList();
  } catch (e) {
    ElMessage.error(e.message || '保存失败');
  } finally {
    saving.value = false;
  }
}

async function onDelete(row) {
  try {
    await ElMessageBox.confirm(`确认删除球队「${row.name}」？不可恢复。`, '删除确认', {
      type: 'warning', confirmButtonText: '删除'
    });
  } catch { return; }
  try {
    await teamApi.remove(row.id);
    ElMessage.success('已删除');
    loadList();
  } catch (e) {
    ElMessage.error(e.message || '删除失败');
  }
}

onMounted(loadList);
</script>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.card-header h3 { margin: 0; font-size: 16px; font-weight: 600; }
</style>
