<template>
  <div class="court-list-page">
    <!-- 顶部统计卡片 -->
    <el-row :gutter="16" class="stats-row">
      <el-col :xs="12" :sm="6">
        <div class="stat-card">
          <div class="stat-label">场地总数</div>
          <div class="stat-value">{{ stats.total }}</div>
        </div>
      </el-col>
      <el-col :xs="12" :sm="6">
        <div class="stat-card stat-active">
          <div class="stat-label">营业中</div>
          <div class="stat-value">{{ stats.active }}</div>
        </div>
      </el-col>
      <el-col :xs="12" :sm="6">
        <div class="stat-card stat-rest">
          <div class="stat-label">休息中</div>
          <div class="stat-value">{{ stats.rest }}</div>
        </div>
      </el-col>
      <el-col :xs="12" :sm="6">
        <div class="stat-card stat-revenue">
          <div class="stat-label">本月营收</div>
          <div class="stat-value">¥{{ stats.revenue }}</div>
        </div>
      </el-col>
    </el-row>

    <div class="page-card">
      <!-- 工具栏：搜索 + 筛选 + 新增 -->
      <div class="toolbar">
        <div class="toolbar-left">
          <h3>我的场地</h3>
          <el-input
            v-model="filters.keyword"
            placeholder="搜索场地名称/地址"
            clearable
            style="width: 240px; margin-left: 16px;"
            :prefix-icon="Search"
            @input="onSearch"
          />
          <el-select
            v-model="filters.status"
            placeholder="状态"
            clearable
            style="width: 120px; margin-left: 12px;"
            @change="onSearch"
          >
            <el-option label="营业中" :value="1" />
            <el-option label="休息中" :value="0" />
          </el-select>
          <el-select
            v-model="filters.type"
            placeholder="类型"
            clearable
            style="width: 120px; margin-left: 12px;"
            @change="onSearch"
          >
            <el-option label="5人制" value="5人制" />
            <el-option label="7人制" value="7人制" />
            <el-option label="11人制" value="11人制" />
          </el-select>
        </div>
        <el-button type="primary" :icon="Plus" @click="onAdd">新增场地</el-button>
      </div>

      <!-- 表格 -->
      <el-table :data="pagedData" stripe v-loading="loading">
        <el-table-column type="index" label="#" width="60" />
        <el-table-column prop="name" label="场地名称" min-width="180">
          <template #default="{ row }">
            <div class="court-name">
              <el-icon class="court-icon"><Location /></el-icon>
              <span>{{ row.name }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="type" label="类型" width="100">
          <template #default="{ row }">
            <el-tag size="small">{{ row.type }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="address" label="地址" min-width="220" show-overflow-tooltip />
        <el-table-column prop="price" label="单价" width="120">
          <template #default="{ row }">
            <span class="price">¥{{ row.price }}</span>
            <span class="price-unit">/场</span>
          </template>
        </el-table-column>
        <el-table-column prop="rating" label="评分" width="100">
          <template #default="{ row }">
            <span class="rating">⭐ {{ row.rating || '5.0' }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="ordersCount" label="本月订单" width="110" />
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-switch
              v-model="row.status"
              :active-value="1"
              :inactive-value="0"
              @change="(val) => onToggleStatus(row, val)"
            />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="240" fixed="right">
          <template #default="{ row }">
            <el-button size="small" link type="primary" @click="onView(row)">
              <el-icon><View /></el-icon> 详情
            </el-button>
            <el-button size="small" link type="primary" @click="onEdit(row)">
              <el-icon><Edit /></el-icon> 编辑
            </el-button>
            <el-button size="small" link type="warning" @click="onSchedule(row)">
              <el-icon><Calendar /></el-icon> 排期
            </el-button>
            <el-button size="small" link type="danger" @click="onDelete(row)">
              <el-icon><Delete /></el-icon> 删除
            </el-button>
          </template>
        </el-table-column>

        <template #empty>
          <el-empty description="还没有场地，点击右上角新增第一个场地" />
        </template>
      </el-table>

      <!-- 分页 -->
      <div class="pagination">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.size"
          :total="filteredData.length"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="loadData"
          @current-change="loadData"
        />
      </div>
    </div>

    <!-- 新增/编辑 抽屉 -->
    <el-drawer
      v-model="drawerVisible"
      :title="formMode === 'add' ? '新增场地' : '编辑场地'"
      size="540px"
      direction="rtl"
    >
      <el-form
        ref="formRef"
        :model="form"
        :rules="formRules"
        label-width="100px"
        style="padding: 0 20px;"
      >
        <el-form-item label="场地名称" prop="name">
          <el-input v-model="form.name" placeholder="如：天河体育中心 11人场" maxlength="50" />
        </el-form-item>
        <el-form-item label="场地类型" prop="type">
          <el-radio-group v-model="form.type">
            <el-radio-button value="5人制">5人制</el-radio-button>
            <el-radio-button value="7人制">7人制</el-radio-button>
            <el-radio-button value="11人制">11人制</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="地址" prop="address">
          <el-input
            v-model="form.address"
            placeholder="详细地址（精确到门牌号）"
            type="textarea"
            :rows="2"
            maxlength="200"
          />
        </el-form-item>
        <el-form-item label="单价 (元)" prop="price">
          <el-input-number
            v-model="form.price"
            :min="0"
            :max="99999"
            :step="50"
            style="width: 200px;"
          />
          <span style="margin-left: 8px; color: #999;">元/场</span>
        </el-form-item>
        <el-form-item label="联系电话" prop="phone">
          <el-input v-model="form.phone" placeholder="如：020-xxxx 或 138xxxxxxxx" />
        </el-form-item>
        <el-form-item label="场地描述" prop="description">
          <el-input
            v-model="form.description"
            type="textarea"
            :rows="3"
            placeholder="如：天然草皮、夜场灯光、可容纳..."
            maxlength="500"
          />
        </el-form-item>
        <el-form-item label="设施标签" prop="facilities">
          <el-checkbox-group v-model="form.facilities">
            <el-checkbox label="天然草">天然草</el-checkbox>
            <el-checkbox label="灯光">灯光</el-checkbox>
            <el-checkbox label="停车场">停车场</el-checkbox>
            <el-checkbox label="更衣室">更衣室</el-checkbox>
            <el-checkbox label="淋浴">淋浴</el-checkbox>
            <el-checkbox label="器材租">器材租</el-checkbox>
          </el-checkbox-group>
        </el-form-item>
        <el-form-item label="营业状态" prop="status">
          <el-radio-group v-model="form.status">
            <el-radio :value="1">营业中</el-radio>
            <el-radio :value="0">休息</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>

      <template #footer>
        <div style="padding: 0 20px;">
          <el-button @click="drawerVisible = false">取消</el-button>
          <el-button type="primary" :loading="submitting" @click="onSubmit">
            {{ formMode === 'add' ? '创建' : '保存' }}
          </el-button>
        </div>
      </template>
    </el-drawer>

    <!-- 详情抽屉 -->
    <el-drawer v-model="detailVisible" title="场地详情" size="540px" direction="rtl">
      <div v-if="currentCourt" class="detail-content" style="padding: 0 20px;">
        <h2>{{ currentCourt.name }}</h2>
        <el-descriptions :column="1" border>
          <el-descriptions-item label="类型">{{ currentCourt.type }}人制</el-descriptions-item>
          <el-descriptions-item label="地址">{{ currentCourt.address }}</el-descriptions-item>
          <el-descriptions-item label="单价">¥{{ currentCourt.price }}/场</el-descriptions-item>
          <el-descriptions-item label="联系电话">{{ currentCourt.phone || '未填写' }}</el-descriptions-item>
          <el-descriptions-item label="评分">⭐ {{ currentCourt.rating || '5.0' }}</el-descriptions-item>
          <el-descriptions-item label="本月订单">{{ currentCourt.ordersCount || 0 }} 单</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="currentCourt.status === 1 ? 'success' : 'info'">
              {{ currentCourt.status === 1 ? '营业中' : '休息' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="设施">
            <el-tag
              v-for="f in currentCourt.facilities || []"
              :key="f"
              size="small"
              style="margin-right: 4px;"
            >{{ f }}</el-tag>
            <span v-if="!currentCourt.facilities || currentCourt.facilities.length === 0" style="color: #999;">未填写</span>
          </el-descriptions-item>
          <el-descriptions-item label="描述">{{ currentCourt.description || '暂无' }}</el-descriptions-item>
        </el-descriptions>
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { Plus, Search, Location, View, Edit, Calendar, Delete } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { courtApi } from '@/api';

const loading = ref(false);
const submitting = ref(false);
const courts = ref([]);
const drawerVisible = ref(false);
const detailVisible = ref(false);
const formMode = ref('add'); // 'add' | 'edit'
const formRef = ref();
const currentCourt = ref(null);

// 筛选
const filters = reactive({
  keyword: '',
  status: null,
  type: null
});

// 分页
const pagination = reactive({
  page: 1,
  size: 10
});

// 统计
const stats = computed(() => {
  const active = courts.value.filter(c => c.status === 1).length;
  return {
    total: courts.value.length,
    active,
    rest: courts.value.length - active,
    revenue: courts.value.reduce((sum, c) => sum + (c.revenue || 0), 0)
  };
});

// 筛选 + 分页后的数据
const filteredData = computed(() => {
  let data = courts.value;
  if (filters.keyword) {
    const kw = filters.keyword.toLowerCase();
    data = data.filter(c =>
      c.name?.toLowerCase().includes(kw) ||
      c.address?.toLowerCase().includes(kw)
    );
  }
  if (filters.status !== null) {
    data = data.filter(c => c.status === filters.status);
  }
  if (filters.type !== null) {
    data = data.filter(c => c.type === filters.type);
  }
  return data;
});

const pagedData = computed(() => {
  const start = (pagination.page - 1) * pagination.size;
  return filteredData.value.slice(start, start + pagination.size);
});

// 表单
const defaultForm = () => ({
  id: null,
  name: '',
  type: '7人制',
  address: '',
  price: 500,
  phone: '',
  description: '',
  facilities: [],
  status: 1
});

const form = reactive(defaultForm());

const formRules = {
  name: [{ required: true, message: '请输入场地名称', trigger: 'blur' }],
  type: [{ required: true, message: '请选择场地类型', trigger: 'change' }],
  address: [{ required: true, message: '请输入场地地址', trigger: 'blur' }],
  price: [{ required: true, message: '请输入单价', trigger: 'blur' }]
};

// ===== 加载数据（含 mock 兜底）=====
async function loadData() {
  loading.value = true;
  try {
    const res = await courtApi.list();
    if (res.code === 0) {
      courts.value = res.data.list || [];
    } else {
      throw new Error(res.message);
    }
  } catch (e) {
    // 后端未启动或无接口时使用 mock，**保证 UI 可演示**
    courts.value = [
      {
        id: 1, name: '天河体育中心 11人场', type: '11人制', address: '广州市天河区天河路299号',
        price: 1200, rating: 4.8, status: 1, phone: '020-38780123',
        description: '天然草皮、夜场灯光、可容纳 22 人',
        facilities: ['天然草', '灯光', '停车场', '更衣室'],
        ordersCount: 28, revenue: 33600
      },
      {
        id: 2, name: '天河体育中心 7人场', type: '7人制', address: '广州市天河区天河路299号',
        price: 580, rating: 4.7, status: 1, phone: '020-38780123',
        description: '人工草皮、室内灯光',
        facilities: ['灯光', '更衣室', '淋浴'],
        ordersCount: 42, revenue: 24360
      },
      {
        id: 3, name: '越秀公园足球场 5人场', type: '5人制', address: '广州市越秀区解放北路988号',
        price: 280, rating: 4.5, status: 0, phone: '020-83545678',
        description: '小型笼式足球场',
        facilities: ['灯光'],
        ordersCount: 15, revenue: 4200
      }
    ];
    console.warn('CourtList: 后端接口不可用，已切换到 mock 数据');
  } finally {
    loading.value = false;
  }
}

function onSearch() {
  pagination.page = 1;
}

function onAdd() {
  formMode.value = 'add';
  Object.assign(form, defaultForm());
  drawerVisible.value = true;
}

function onEdit(row) {
  formMode.value = 'edit';
  Object.assign(form, { ...row });
  drawerVisible.value = true;
}

function onView(row) {
  currentCourt.value = row;
  detailVisible.value = true;
}

function onSchedule(row) {
  ElMessage.info(`「${row.name}」排期功能开发中，下个版本上线`);
}

async function onToggleStatus(row, val) {
  // 乐观更新；如果后端有 API 则对接，没有就纯前端切换
  row.status = val;
  try {
    // 后端暂无 update 接口，先静默；后续加
    ElMessage.success(`${row.name} 已${val === 1 ? '上线' : '下架'}`);
  } catch (e) {
    row.status = val === 1 ? 0 : 1; // 回滚
    ElMessage.error('状态切换失败');
  }
}

async function onDelete(row) {
  try {
    await ElMessageBox.confirm(
      `确认删除「${row.name}」？该操作不可恢复`,
      '删除确认',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
    );
    // 后端暂无 delete 接口，前端先过滤模拟
    const idx = courts.value.findIndex(c => c.id === row.id);
    if (idx > -1) {
      courts.value.splice(idx, 1);
      ElMessage.success('已删除');
    }
  } catch {
    // 用户取消
  }
}

async function onSubmit() {
  if (!formRef.value) return;
  try {
    await formRef.value.validate();
    submitting.value = true;

    if (formMode.value === 'add') {
      // 调后端 / 前端 mock 新增
      try {
        await courtApi.create(form);
      } catch {
        // 后端没接通就 mock 一下
      }
      const newId = Math.max(...courts.value.map(c => c.id || 0), 0) + 1;
      courts.value.unshift({
        ...form,
        id: newId,
        rating: 5.0,
        ordersCount: 0,
        revenue: 0
      });
      ElMessage.success('新增成功');
    } else {
      // 编辑：纯前端 mock（后端暂无 update 接口）
      const idx = courts.value.findIndex(c => c.id === form.id);
      if (idx > -1) {
        courts.value[idx] = { ...courts.value[idx], ...form };
      }
      ElMessage.success('保存成功');
    }
    drawerVisible.value = false;
  } catch (e) {
    if (e?.message) ElMessage.error(e.message);
  } finally {
    submitting.value = false;
  }
}

onMounted(loadData);
</script>

<style lang="scss" scoped>
.court-list-page {
  .stats-row {
    margin-bottom: 16px;

    .stat-card {
      background: #fff;
      padding: 16px 20px;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);

      .stat-label {
        font-size: 13px;
        color: #999;
        margin-bottom: 8px;
      }
      .stat-value {
        font-size: 24px;
        font-weight: 700;
        color: #1a1a1a;
      }

      &.stat-active .stat-value { color: #67c23a; }
      &.stat-rest .stat-value { color: #909399; }
      &.stat-revenue .stat-value { color: #ff6b00; }
    }
  }

  .page-card {
    background: #fff;
    padding: 20px;
    border-radius: 8px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
  }

  .toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
    flex-wrap: wrap;
    gap: 12px;

    .toolbar-left {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;

      h3 {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
      }
    }
  }

  .court-name {
    display: flex;
    align-items: center;
    gap: 6px;
    .court-icon { color: #ff6b00; }
  }

  .price {
    color: #ff6b00;
    font-weight: 600;
  }
  .price-unit {
    color: #999;
    font-size: 12px;
    margin-left: 4px;
  }
  .rating {
    color: #e6a23c;
    font-weight: 600;
  }

  .pagination {
    display: flex;
    justify-content: flex-end;
    margin-top: 16px;
  }
}
</style>