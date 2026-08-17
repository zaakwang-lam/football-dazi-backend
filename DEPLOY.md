# 「足球搭子」部署与运维手册

> 最后更新：2026-08-17

---

## 🌐 当前生产环境

| 服务 | URL | 状态 |
|------|-----|------|
| **小程序 API** | 以现网域名为准（见 `.env` / Nginx） | ✅ |
| **后台管理** | 同域名 `/admin/` 或 `:8080` | ✅ |
| **健康检查** | `/health` | ✅ |

> 具体公网域名、账号密码以服务器 `.env` 与运维交接为准，本文不写死敏感值。

---

## 📦 架构

```
微信小程序
   ↓ (HTTPS)
Nginx (80/443) → 反向代理
   ├── /api/     → backend:3000
   ├── /uploads/ → 静态文件（头像/球场图等）
   ├── /admin/   → admin-web
   └── /health   → backend
   ↓
MySQL 8.0 (容器)
```

代码目录（服务器）：`/opt/football-dazi/football-dazi-backend/`

---

## 🔧 日常运维

### 看状态 / 日志

```bash
cd /opt/football-dazi/football-dazi-backend
sudo docker compose ps
sudo docker logs football-backend --tail 80
```

### 更新代码（推荐流程）

```bash
cd /opt/football-dazi/football-dazi-backend

# ⚠️ 不要用 sudo git（见下文「Git 权限」）
git pull

sudo docker compose build backend
# 仅 restart 不会重新读 .env；改环境变量时必须 force-recreate
sudo docker compose up -d --force-recreate backend
sudo docker compose restart nginx
```

### 只改了 `.env`（未改代码）

```bash
cd /opt/football-dazi/football-dazi-backend
sudo docker compose up -d --force-recreate backend
# 确认变量已进容器：
sudo docker exec football-backend printenv | grep -E 'TEST_LOGIN|PUBLIC_BASE|WX_APPID'
```

---

## ⚠️ 重大教训（必读）

### 1. Git 目录权限反复变 root（真坑）

**现象：** `git pull` 报 `.git/objects` Permission denied；刚 `chown` 过隔几小时又出现。

**原因：** 谁执行 `git`，新建的 object 就归谁。混用 `ubuntu` 与 `sudo git` 会在 `.git` 里混入 root 文件。

**正确做法：**

- **禁止** 对本仓库使用 `sudo git ...`
- 始终用部署用户（如 `ubuntu`）在项目目录执行 `git pull`
- 一次修复（可选 setgid，减少组权限问题）：

```bash
sudo chown -R ubuntu:ubuntu /opt/football-dazi/football-dazi-backend
sudo find /opt/football-dazi/football-dazi-backend/.git -type d -exec chmod g+s {} \;
```

- **不推荐** 用 crontab 每小时 `chown` 当主方案（治标不治本）

### 2. `.env` 与 Docker 环境变量（真坑）

Compose 有两层：

| 层级 | 作用 |
|------|------|
| 项目目录 `.env` + yml 里 `${VAR}` | 只给 **Compose 插值** 用 |
| `environment:` / `env_file:` | 才是 **容器内进程** 能读到的变量 |

因此：

- 仅把 `TEST_LOGIN_ENABLED=1` 写在 `.env`、但 yml 未声明时，旧版本容器里可能没有该变量
- 当前 `docker-compose.yml` 已为 backend 配置：
  - `env_file: .env`（整文件注入）
  - `TEST_LOGIN_ENABLED` / `TEST_LOGIN_SECRET` / `PUBLIC_BASE_URL` 显式映射
- 改 `.env` 后必须：`docker compose up -d --force-recreate backend`  
  仅 `restart` **不够**

审核期示例（服务器 `.env`）：

```bash
TEST_LOGIN_ENABLED=1
TEST_LOGIN_SECRET=football-audit-2026
PUBLIC_BASE_URL=https://你的域名
```

过审后改为 `TEST_LOGIN_ENABLED=0` 再 recreate。

### 3. Express async 异常

Express 4 不自动 catch async 异常，需 `express-async-errors`（或等价包装），否则进程崩溃 → 502。

### 4. 域名 / Tunnel

临时 Tunnel 域名会变；正式环境用自有域名 + 合法 request/upload/download 域名配置。

---

## 📂 关键路径

| 路径 | 说明 |
|------|------|
| `/opt/football-dazi/football-dazi-backend/` | 代码与 compose |
| `/opt/football-dazi/football-dazi-backend/.env` | 环境变量（勿提交 Git） |
| `./backend/uploads/` | 头像、球场图等上传文件 |

---

**文档结束。**
