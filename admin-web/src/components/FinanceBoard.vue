<template>
  <div>
    <div class="page-card" style="margin-bottom: 16px;">
      <div class="card-header">
        <div>
          <h3>{{ title }}</h3>
          <p class="tip">{{ hint }}实收 = 已支付 + 已完成 − 已退款。待支付不计入实收。</p>
        </div>
        <div class="filters">
          <el-date-picker
            v-model="dates"
            type="daterange"
            value-format="YYYY-MM-DD"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            :clearable="false"
            @change="reload"
          />
          <el-input v-model="keyword" placeholder="订单号 / 电话 / 姓名" clearable style="width: 200px;" @keyup.enter="reload" />
          <el-button type="primary" @click="reload">查询</el-button>
          <el-button @click="exportCsv" :loading="exporting">导出流水</el-button>
        </div>
      </div>
      <el-alert v-if="summary.unbound" type="warning" :closable="false" show-icon title="当前账号还没有关联球场，暂无收支。" />
    </div>

    <el-row :gutter="16" style="margin-bottom: 16px;">
      <el-col :span="6">
        <div class="metric-card">
          <div class="metric-label">实收</div>
          <div class="metric-value">¥{{ money(summary.net) }}</div>
          <div class="metric-extra">{{ summary.paidCount || 0 }} 笔已收款</div>
        </div>
      </el-col>
      <el-col :span="6">
        <div class="metric-card">
          <div class="metric-label">收款</div>
          <div class="metric-value">¥{{ money(summary.received) }}</div>
          <div class="metric-extra">已支付与已完成</div>
        </div>
      </el-col>
      <el-col :span="6">
        <div class="metric-card">
          <div class="metric-label">退款</div>
          <div class="metric-value refund">¥{{ money(summary.refunded) }}</div>
          <div class="metric-extra">{{ summary.refundCount || 0 }} 笔</div>
        </div>
      </el-col>
      <el-col :span="6">
        <div class="metric-card">
          <div class="metric-label">待支付</div>
          <div class="metric-value">¥{{ money(summary.pending) }}</div>
          <div class="metric-extra">{{ summary.pendingCount || 0 }} 笔待付 · {{ summary.bookedCount || 0 }} 笔已预订未付</div>
        </div>
      </el-col>
    </el-row>

    <div class="page-card" style="margin-bottom: 16px;" v-if="summary.byCourt && summary.byCourt.length">
      <h3 class="block-title">球场汇总</h3>
      <el-table :data="summary.byCourt" stripe border>
        <el-table-column prop="courtName" label="球场" min-width="160" />
        <el-table-column label="收款" width="120"><template #default="{ row }">¥{{ money(row.received) }}</template></el-table-column>
        <el-table-column label="退款" width="120"><template #default="{ row }">¥{{ money(row.refunded) }}</template></el-table-column>
        <el-table-column label="实收" width="120"><template #default="{ row }">¥{{ money(row.net) }}</template></el-table-column>
        <el-table-column prop="paidCount" label="收款笔数" width="100" />
        <el-table-column prop="refundCount" label="退款笔数" width="100" />
      </el-table>
    </div>

    <div class="page-card">
      <el-tabs v-model="tab" @tab-change="onTab">
        <el-tab-pane label="收支流水" name="flows" />
        <el-tab-pane label="退款单" name="refunds" />
      </el-tabs>

      <template v-if="tab === 'flows'">
        <el-radio-group v-model="status" @change="loadFlows" style="margin-bottom: 12px;">
          <el-radio-button label="all">全部</el-radio-button>
          <el-radio-button label="paid">已收款</el-radio-button>
          <el-radio-button label="refunded">已退款</el-radio-button>
          <el-radio-button label="pending">待支付</el-radio-button>
          <el-radio-button label="booked">已预订</el-radio-button>
        </el-radio-group>
        <el-table :data="flows" stripe border v-loading="loading">
          <el-table-column prop="orderNo" label="订单号" min-width="170" />
          <el-table-column prop="courtName" label="球场" min-width="140" />
          <el-table-column label="用户" width="120">
            <template #default="{ row }">{{ row.userName || row.contactName || '—' }}</template>
          </el-table-column>
          <el-table-column prop="contactPhone" label="电话" width="130" />
          <el-table-column label="状态" width="100">
            <template #default="{ row }"><el-tag :type="tagType(row.status)" size="small">{{ statusText(row.status) }}</el-tag></template>
          </el-table-column>
          <el-table-column label="金额" width="110">
            <template #default="{ row }">¥{{ money(row.payAmount) }}</template>
          </el-table-column>
          <el-table-column label="支付时间" min-width="160">
            <template #default="{ row }">{{ fmt(row.payTime) }}</template>
          </el-table-column>
          <el-table-column label="退款时间" min-width="160">
            <template #default="{ row }">{{ fmt(row.refundTime) }}</template>
          </el-table-column>
        </el-table>
        <div class="pager">
          <el-pagination
            background
            layout="total, prev, pager, next"
            :total="flowTotal"
            :page-size="pageSize"
            :current-page="flowPage"
            @current-change="onFlowPage"
          />
        </div>
      </template>

      <template v-else>
        <el-alert v-if="refundUnavailable" type="info" :closable="false" show-icon title="退款单表暂时读不到，收支流水里的已退款订单仍可查看。" style="margin-bottom: 12px;" />
        <el-table :data="refunds" stripe border v-loading="loading">
          <el-table-column prop="refundNo" label="退款单号" min-width="170" />
          <el-table-column prop="orderNo" label="订单号" min-width="170" />
          <el-table-column prop="courtName" label="球场" min-width="140" />
          <el-table-column label="金额" width="110"><template #default="{ row }">¥{{ money(row.amount) }}</template></el-table-column>
          <el-table-column label="状态" width="110">
            <template #default="{ row }">{{ refundText(row.status) }}</template>
          </el-table-column>
          <el-table-column prop="reason" label="原因" min-width="160" />
          <el-table-column label="创建时间" min-width="160"><template #default="{ row }">{{ fmt(row.createdAt) }}</template></el-table-column>
        </el-table>
        <div class="pager">
          <el-pagination
            background
            layout="total, prev, pager, next"
            :total="refundTotal"
            :page-size="pageSize"
            :current-page="refundPage"
            @current-change="onRefundPage"
          />
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { financeApi } from '@/api';

defineProps({
  title: { type: String, default: '财务管理' },
  hint: { type: String, default: '' }
});

const STATUS = {
  paid: '已支付', completed: '已完成', refunded: '已退款',
  pending: '待支付', booked: '已预订', canceled: '已取消'
};
const REFUND = { processing: '处理中', success: '成功', failed: '失败' };

function monthStart() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-01`;
}
function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const dates = ref([monthStart(), today()]);
const keyword = ref('');
const status = ref('all');
const tab = ref('flows');
const summary = ref({});
const flows = ref([]);
const flowTotal = ref(0);
const flowPage = ref(1);
const refunds = ref([]);
const refundTotal = ref(0);
const refundPage = ref(1);
const refundUnavailable = ref(false);
const pageSize = 20;
const loading = ref(false);
const exporting = ref(false);

function money(v) {
  const n = Number(v);
  return (Number.isFinite(n) ? n : 0).toFixed(2);
}
function statusText(s) { return STATUS[s] || s || '—'; }
function refundText(s) { return REFUND[s] || s || '—'; }
function tagType(s) {
  if (s === 'paid' || s === 'completed') return 'success';
  if (s === 'refunded') return 'warning';
  if (s === 'pending' || s === 'booked') return 'info';
  return '';
}
function fmt(v) {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v).replace('T', ' ').slice(0, 19);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function params(extra) {
  return {
    from: dates.value?.[0],
    to: dates.value?.[1],
    keyword: keyword.value.trim(),
    ...extra
  };
}

async function loadSummary() {
  const res = await financeApi.summary(params());
  summary.value = res.data || {};
}
async function loadFlows() {
  loading.value = true;
  try {
    const res = await financeApi.flows(params({ status: status.value, page: flowPage.value, pageSize }));
    flows.value = res.data?.list || [];
    flowTotal.value = res.data?.total || 0;
  } finally {
    loading.value = false;
  }
}
async function loadRefunds() {
  loading.value = true;
  try {
    const res = await financeApi.refunds(params({ page: refundPage.value, pageSize }));
    refunds.value = res.data?.list || [];
    refundTotal.value = res.data?.total || 0;
    refundUnavailable.value = !!res.data?.unavailable;
  } finally {
    loading.value = false;
  }
}
function reload() {
  flowPage.value = 1;
  refundPage.value = 1;
  loadSummary().catch(() => {});
  if (tab.value === 'refunds') loadRefunds();
  else loadFlows();
}
function onTab() {
  if (tab.value === 'refunds') loadRefunds();
  else loadFlows();
}
function onFlowPage(p) { flowPage.value = p; loadFlows(); }
function onRefundPage(p) { refundPage.value = p; loadRefunds(); }

async function exportCsv() {
  exporting.value = true;
  try {
    const res = await financeApi.flows(params({ status: status.value, page: 1, pageSize: 2000 }));
    const list = res.data?.list || [];
    if (!list.length) {
      ElMessage.info('当前筛选没有可导出的流水');
      return;
    }
    const head = ['订单号', '球场', '用户', '电话', '状态', '金额', '支付时间', '退款时间'];
    const lines = [head.join(',')];
    list.forEach((row) => {
      const cells = [
        row.orderNo, row.courtName, row.userName || row.contactName, row.contactPhone,
        statusText(row.status), money(row.payAmount), fmt(row.payTime), fmt(row.refundTime)
      ].map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`);
      lines.push(cells.join(','));
    });
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `财务流水_${dates.value[0]}_${dates.value[1]}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (e) {
    ElMessage.error(e?.message || '导出失败');
  } finally {
    exporting.value = false;
  }
}

onMounted(reload);
</script>

<style scoped>
.card-header { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; flex-wrap: wrap; }
.card-header h3 { margin: 0 0 6px; font-size: 16px; }
.tip { margin: 0; color: #888; font-size: 13px; }
.filters { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.block-title { margin: 0 0 12px; font-size: 15px; }
.metric-value.refund { color: #e54d42; }
.pager { display: flex; justify-content: flex-end; margin-top: 16px; }
</style>
