<template>
  <div class="page-card">
    <div class="card-header">
      <div>
        <h3>🖼 首页轮播图</h3>
        <p class="tip">{{ tip }}</p>
      </div>
      <el-button type="primary" :disabled="list.length >= max" @click="triggerUpload" :loading="uploading">
        上传图片（{{ list.length }}/{{ max }}）
      </el-button>
      <input ref="fileInput" type="file" accept="image/jpeg,image/png,image/webp" style="display:none" @change="onFileChange" />
    </div>

    <el-alert
      type="info"
      :closable="false"
      show-icon
      style="margin-bottom: 16px;"
      title="建议尺寸：750 × 360 像素（宽 × 高），JPG/PNG，单张 ≤ 2MB，最多 5 张。上传后小程序首页置顶左右滑动展示。"
    />

    <el-row :gutter="16" v-loading="loading">
      <el-col :span="8" v-for="item in list" :key="item.id" style="margin-bottom: 16px;">
        <div class="banner-card">
          <img :src="item.imageUrl" class="banner-img" alt="banner" />
          <div class="banner-meta">
            <el-input v-model="item.title" placeholder="可选标题" size="small" @change="saveItem(item)" />
            <div class="banner-actions">
              <el-tag size="small" :type="item.status === 1 ? 'success' : 'info'">
                {{ item.status === 1 ? '展示中' : '已停用' }}
              </el-tag>
              <el-button size="small" link @click="toggleStatus(item)">
                {{ item.status === 1 ? '停用' : '启用' }}
              </el-button>
              <el-button size="small" type="danger" link @click="removeItem(item)">删除</el-button>
            </div>
          </div>
        </div>
      </el-col>
      <el-col :span="24" v-if="!loading && list.length === 0">
        <el-empty description="暂无轮播图，请上传（建议 750×360）" />
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { bannerApi } from '@/api';

const list = ref([]);
const max = ref(5);
const tip = ref('建议尺寸 750×360 像素');
const loading = ref(false);
const uploading = ref(false);
const fileInput = ref(null);

async function loadList() {
  loading.value = true;
  try {
    const res = await bannerApi.list();
    list.value = res.data?.list || [];
    max.value = res.data?.max || 5;
    tip.value = res.data?.tip || tip.value;
  } catch (e) {
    ElMessage.error(e.message || '加载失败');
  } finally {
    loading.value = false;
  }
}

function triggerUpload() {
  if (list.value.length >= max.value) {
    ElMessage.warning(`最多 ${max.value} 张`);
    return;
  }
  fileInput.value?.click();
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function onFileChange(e) {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) {
    ElMessage.warning('单张请不超过 2MB，请压缩后再上传');
    return;
  }
  uploading.value = true;
  try {
    const base64 = await fileToBase64(file);
    const mimeType = file.type || 'image/jpeg';
    await bannerApi.upload({ base64, mimeType });
    ElMessage.success('上传成功');
    await loadList();
  } catch (err) {
    ElMessage.error(err.message || '上传失败');
  } finally {
    uploading.value = false;
  }
}

async function saveItem(item) {
  try {
    await bannerApi.update(item.id, { title: item.title });
    ElMessage.success('已保存');
  } catch (e) {
    ElMessage.error(e.message || '保存失败');
  }
}

async function toggleStatus(item) {
  const next = item.status === 1 ? 0 : 1;
  try {
    await bannerApi.update(item.id, { status: next });
    item.status = next;
    ElMessage.success(next === 1 ? '已启用' : '已停用');
  } catch (e) {
    ElMessage.error(e.message || '操作失败');
  }
}

async function removeItem(item) {
  try {
    await ElMessageBox.confirm('确定删除该轮播图？', '提示', { type: 'warning' });
  } catch {
    return;
  }
  try {
    await bannerApi.remove(item.id);
    ElMessage.success('已删除');
    await loadList();
  } catch (e) {
    ElMessage.error(e.message || '删除失败');
  }
}

onMounted(loadList);
</script>

<style lang="scss" scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
  gap: 12px;
  h3 { margin: 0 0 6px; font-size: 16px; font-weight: 600; }
  .tip { margin: 0; font-size: 13px; color: #888; }
}
.banner-card {
  border: 1px solid #f0f0f0;
  border-radius: 12px;
  overflow: hidden;
  background: #fff;
}
.banner-img {
  width: 100%;
  height: 160px;
  object-fit: cover;
  display: block;
  background: #f5f5f5;
}
.banner-meta {
  padding: 12px;
}
.banner-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}
</style>
