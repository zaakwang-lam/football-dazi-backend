# 足球搭子 - 云服务器部署指南

> 灰度期部署 · 腾讯云轻量应用服务器 · 广州 · Ubuntu 22.04

---

## 📋 前置清单（一次性）

- [ ] 腾讯云账号 + 实名认证
- [ ] 已购买「轻量应用服务器」（2核2G，广州，Ubuntu 22.04）
- [ ] 服务器 root 密码（或 SSH key）
- [ ] 服务器公网 IP（控制台可查）

---

## 🚀 一键部署流程

### Step 1：SSH 登录服务器

```bash
ssh root@你的服务器IP
# 输入密码
```

### Step 2：安装 Docker + Docker Compose

```bash
# 更新源
apt update && apt upgrade -y

# 装 Docker
curl -fsSL https://get.docker.com | bash

# 装 docker compose plugin
apt install -y docker-compose-plugin

# 验证
docker --version
docker compose version
```

### Step 3：克隆后端代码

```bash
mkdir -p /opt/football-dazi && cd /opt/football-dazi

git clone https://github.com/jujishouhong/football-dazi-backend.git .

# 进入后端目录
cd football-dazi-backend
```

### Step 4：配置环境变量

```bash
cp .env.example .env
nano .env   # 或 vim .env
```

**必须修改的：**
- `JWT_SECRET`：32 位随机字符串
- `WX_SECRET`：小程序 AppSecret（在小程序后台查）
- `WX_MCHID` / `WX_PAY_KEY`：商户号 + 支付 key（**灰度期可先用测试值**）

### Step 5：启动服务

```bash
# 构建并启动
docker compose up -d

# 看日志
docker compose logs -f backend
```

**成功标志：** 看到 `Server running on port 3000`

### Step 6：初始化数据库

```bash
# 等 MySQL 完全启动（约 30 秒）
sleep 30

# 进入 backend 容器执行初始化脚本
docker compose exec backend node src/scripts/init-db.js

# 应该看到：
# ✅ 数据库连接成功
# ✅ 12 张表已创建
# ✅ 管理员账号已创建（admin/admin123）
# ✅ 3 个场地 + 168 个排期 已初始化
```

### Step 7：验证 API

```bash
# 服务器本地测试
curl http://localhost:3000/health
# → {"status":"ok"}

# 浏览器/小程序访问
curl http://你的服务器IP/api/v1/courts/nearby
# → 返回场地 JSON 列表
```

---

## 🔄 后续更新代码

```bash
cd /opt/football-dazi/football-dazi-backend

git pull

# 重启后端
docker compose restart backend
```

---

## 📱 小程序对接

### 修改 API 地址

打开小程序项目，编辑 `utils/api.js`：

```js
// 灰度期：直接用服务器 IP
const API_BASE = 'http://你的服务器IP:3000';
```

或在 `app.js`：
```js
apiBase: 'http://你的服务器IP:3000'
```

### 微信开发者工具

打开小程序项目 → 详情 → 本地设置 → 勾选：

```
☑ 不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书
```

这样**灰度期间**可以直接用 HTTP/IP，无需域名+备案。

### 真机预览

微信开发者工具 → 预览 → 扫码 → 手机测试。

---

## 🔐 安全加固（上线前必做）

- [ ] 修改 MySQL root 密码
- [ ] 修改 JWT_SECRET
- [ ] 服务器防火墙：仅开放 80/443/22 端口
- [ ] 微信支付证书放到 `certs/`（不提交 git）
- [ ] 域名 + ICP 备案 + Let's Encrypt SSL
- [ ] 修改 API_BASE 为 HTTPS

---

## 🆘 常见问题

### Q1：MySQL 启动失败
```bash
docker compose logs mysql
# 看是不是数据卷冲突
docker compose down -v  # ⚠️ 删数据，慎用
```

### Q2：小程序访问后端报错「不在合法域名列表」
**A：** 微信开发者工具 → 详情 → 本地设置 → 勾选「不校验合法域名」

### Q3：服务器内存不足
**A：** 升级到 4G，或加 swap：
```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
```

### Q4：忘记 root 密码
**A：** 腾讯云控制台 → 实例 → 重置密码 → 重启

---

## 📞 关键账号

| 服务 | 地址 |
|------|------|
| 腾讯云控制台 | https://cloud.tencent.com |
| 微信小程序后台 | https://mp.weixin.qq.com |
| 微信支付商户平台 | https://pay.weixin.qq.com |
| GitHub 仓库 | https://github.com/jujishouhong/football-dazi-backend |

---

**最后更新：** 2026-07-24
**作者：** 懂王
**适用版本：** v1.0