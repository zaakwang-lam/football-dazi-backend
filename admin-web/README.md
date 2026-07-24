# 「足球搭子」Web Admin 后台

> Vue 3 + Vite + Element Plus + Pinia

---

## 🚀 启动

```bash
cd ~/Desktop/懂王专属/市场分析/足球搭子后端/admin-web
npm install
npm run dev
```

启动后访问：`http://localhost:8080`

**测试账号**（前提：后端已启动并执行 `init-db.js`）：
- 超级管理员：`admin` / `admin123` → 进入运营后台
- 场地方管理员：`tianhe_admin` / `court123` → 进入场地方后台

---

## 📁 项目结构

```
admin-web/
├── src/
│   ├── main.js              # 入口
│   ├── App.vue              # 根组件
│   ├── router/              # 路由
│   ├── stores/              # Pinia 状态
│   │   └── auth.js          #   鉴权 store
│   ├── api/                 # API 封装
│   ├── utils/               # 工具
│   │   └── request.js       #   axios + 拦截器
│   ├── layouts/             # 布局组件
│   │   ├── CourtLayout.vue #   场地方后台布局（橙色调）
│   │   └── OpsLayout.vue    #   运营后台布局（深色调）
│   ├── views/               # 页面
│   │   ├── Login.vue        #   登录页
│   │   ├── court/           #   场地方页面
│   │   │   ├── Dashboard.vue
│   │   │   ├── CourtList.vue
│   │   │   ├── Orders.vue
│   │   │   └── Finance.vue
│   │   └── ops/             #   运营页面
│   │       ├── Dashboard.vue   (含 ECharts 4 个图表)
│   │       ├── Users.vue
│   │       ├── Courts.vue
│   │       ├── Orders.vue
│   │       └── Finance.vue
│   └── styles/
│       └── global.scss      # 全局样式（设计变量）
├── index.html
├── vite.config.js           # Vite 配置（端口 8080 + 代理）
└── package.json
```

---

## 🎨 设计

| 元素 | 场地方后台 | 运营后台 |
|------|----------|---------|
| 主色调 | 橙色 `#FF6B00` | 蓝色 `#007AFF` |
| 侧边栏 | 白色 + 橙色高亮 | 深色 + 蓝色高亮 |
| 适用场景 | B 端场地方运营 | 平台超级管理员 |
| 入口路径 | `/dashboard` | `/ops/dashboard` |

### 核心组件

- **Login**：账号密码登录，自动根据角色跳转
- **CourtLayout**：工作台 + 场地 + 订单 + 财务
- **OpsLayout**：数据看板（ECharts）+ 用户 + 场地审核 + 订单 + 财务
- **OpsDashboard**：4 个图表（GMV 趋势、凑人分布、场地 Top10、用户增长）

---

## 🔌 联调

### 后端要求
1. 启动后端：`cd backend && npm run dev`
2. 服务跑在 `http://localhost:3000`

### Vite 代理
`vite.config.js` 已配置 `/api/*` 代理到 `localhost:3000`，无需 CORS。

### 环境变量（生产）
修改 `vite.config.js`：
```js
proxy: {
  '/api': {
    target: 'https://api.footballdazi.com',  // 生产后端
    changeOrigin: true
  }
}
```

---

## 📦 生产构建

```bash
npm run build
```

输出在 `dist/` 目录，可直接用 Nginx 部署。

```nginx
server {
  listen 80;
  server_name admin.footballdazi.com;
  root /www/admin-web/dist;
  index index.html;

  location / {
    try_files $uri $uri/ /index.html;
  }
}
```

---

**作者**：懂王
**最后更新**：2026-07-23