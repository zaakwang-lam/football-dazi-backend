<template>
  <div class="page-card finance-empty">
    <el-empty description="财务管理功能暂未开放">
      <template #description>
        <p class="title">财务管理</p>
        <p class="desc">收费与结算功能尚未上线，暂无财务数据可展示。</p>
        <p class="desc muted">后续接入支付与结算后再开放本模块。</p>
      </template>
    </el-empty>
  </div>
</template>

<script setup>
</script>

<style lang="scss" scoped>
.finance-empty {
  min-height: 420px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.title {
  margin: 0 0 8px;
  font-size: 18px;
  font-weight: 600;
  color: #1a1a1a;
}
.desc {
  margin: 4px 0;
  font-size: 14px;
  color: #666;
}
.muted {
  color: #999;
}
</style>
