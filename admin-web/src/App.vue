<template>
  <div id="app">
    <!-- 备案过渡期状态横幅 -->
    <div class="filing-banner" v-if="showFilingBanner">
      <span>⚠️ 当前为备案过渡期</span>
      <span>访问后台请使用&nbsp;</span>
      <a href="http://43.136.84.244:8080/admin/" target="_blank">http://43.136.84.244:8080/admin/</a>
      <span>&nbsp;或&nbsp;</span>
      <a href="http://43.136.84.244/admin/" target="_blank">http://43.136.84.244/admin/</a>
      <span>&nbsp;（HTTPS 域名 https://footballdazi.cn 备案通过后即可使用）</span>
      <button class="banner-close" @click="showFilingBanner = false" title="关闭提示">×</button>
    </div>
    <router-view />
  </div>
</template>

<script setup>
import { ref } from 'vue'

// 备案通过后，把 showFilingBanner 改为 false，或删除此组件
const showFilingBanner = ref(true)
</script>

<style lang="scss">
html, body, #app {
  margin: 0;
  padding: 0;
  height: 100%;
  font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", Arial, sans-serif;
}

.filing-banner {
  position: sticky;
  top: 0;
  z-index: 9999;
  background: linear-gradient(135deg, #fff3cd, #ffeeba);
  border-bottom: 2px solid #ffc107;
  padding: 10px 20px;
  font-size: 13px;
  color: #856404;
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  line-height: 1.6;

  a {
    color: #0056b3;
    font-weight: 600;
    text-decoration: underline;
    word-break: break-all;

    &:hover {
      color: #004494;
    }
  }

  .banner-close {
    margin-left: auto;
    background: none;
    border: none;
    font-size: 20px;
    color: #856404;
    cursor: pointer;
    padding: 0 4px;
    line-height: 1;
    font-weight: bold;

    &:hover {
      color: #533f03;
    }
  }
}
</style>
