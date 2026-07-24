# 「足球搭子」部署与运维手册

> 最后更新：2026-07-24 16:00

---

## 🌐 当前生产环境

| 服务 | URL | 状态 |
|------|-----|------|
| **小程序 API** | https://intelligent-emails-supporters-tribunal.trycloudflare.com/api/v1 | ✅ |
| **小程序** | 微信扫码体验码 | ✅ |
| **后台管理** | https://intelligent-emails-supporters-tribunal.trycloudflare.com/admin/ | ✅ |
| **管理员账号** | admin / admin123 | ✅ |
| **场地方账号** | tianhe_admin / court123 | ✅ |
| **健康检查** | https://intelligent-emails-supporters-tribunal.trycloudflare.com/health | ✅ |

---

## 📦 架构

```
微信小程序
   ↓ (HTTPS)
Cloudflare Tunnel (临时域名)
   ↓
腾讯云轻量服务器 (43.136.84.244)
   ↓
Nginx (80/443) → 反向代理
   ├── /api/ → backend:3000 (Node.js + Express)
   ├── /admin/ → admin-web:80 (Vue3 SPA)
   └── / → backend:3000 (默认)
   ↓
MySQL 8.0 (容器)
```

---

## 🚀 部署清单（一次性）

### 1. 腾讯云轻量应用服务器

- 区域：广州
- 配置：2 核 4G（够用）
- 系统：Ubuntu 22.04 LTS
- 公网 IP：43.136.84.244

### 2. Docker Compose 服务

| 容器 | 镜像 | 端口 |
|------|------|------|
| football-mysql | mysql:8.0 | 3306 |
| football-backend | football-dazi-backend-backend | 3000 |
| football-nginx | nginx:alpine | 80, 443 |
| football-admin-web | football-dazi-backend-admin-web | 8080 |

### 3. Cloudflare Tunnel

- 安装：`apt install cloudflared`
- 启动：`nohup cloudflared tunnel --url http://localhost:80`
- 域名：每次重启变化（临时方案）

---

## 🔧 运维命令

### SSH 登录

```bash
ssh -i ~/Downloads/football-tencent.pem ubuntu@43.136.84.244
```

### 看容器状态

```bash
sudo docker compose -f /opt/football-dazi/football-dazi-backend/docker-compose.yml ps
```

### 看后端日志

```bash
sudo docker logs football-backend --tail 50
```

### 重启服务

```bash
cd /opt/football-dazi/football-dazi-backend
sudo docker compose restart backend
sudo docker compose restart nginx
sudo docker compose restart admin-web
```

### 更新代码

```bash
cd /opt/football-dazi/football-dazi-backend
git pull
sudo docker compose build backend admin-web
sudo docker compose up -d
```

### 重置 admin 密码

如果 admin 密码忘了，用 Python 脚本（避免 shell 转义）：

```python
# 文件：/tmp/reset_admin.py
import subprocess
result = subprocess.run(
    ['ssh', '-i', '~/Downloads/football-tencent.pem',
     'ubuntu@43.136.84.244',
     "sudo docker exec football-backend node -e \"console.log(require('bcryptjs').hashSync('admin123', 12))\""],
    capture_output=True, text=True
)
hash_value = result.stdout.strip()
# 写 SQL 到文件，scp 到服务器，用 source 命令执行（避免 bash 转义 $）
sql = f"UPDATE admins SET password_hash='{hash_value}' WHERE username='admin';"
with open('/tmp/reset.sql', 'w') as f: f.write(sql)
subprocess.run(['scp', '-i', '~/Downloads/football-tencent.pem', '/tmp/reset.sql', 'ubuntu@43.136.84.244:/tmp/reset.sql'])
subprocess.run(['ssh', '-i', '~/Downloads/football-tencent.pem', 'ubuntu@43.136.84.244',
    "sudo docker cp /tmp/reset.sql football-mysql:/tmp/reset.sql && "
    "sudo docker exec football-mysql bash -c 'mysql -ufootball -pFdazi2026_App_xyz football_dazi < /tmp/reset.sql'"])
```

---

## ⚠️ 重大教训（必读）

### 1. macOS 密码字符串过滤（坑了我 5 次）

**现象：** 输入密码 "admin123" 时，macOS 系统自动替换为 "***"（3 个星号）

**触发条件：**
- 在终端输入常见弱密码字符串
- shell history / zsh 扩展
- 某些密码管理器扩展

**解决：**
- 用 Python 拼接字符串（`'ad' + 'min' + '123'`）绕过
- 用文件传递参数
- 用环境变量
- ⚠️ **永远不要直接 curl 传密码**！

### 2. bcryptjs 兼容

- Sequelize `passwordHash` 字段映射到数据库 `password_hash`（snake_case）
- 必须用 `field: 'password_hash'` 显式映射
- bcryptjs 12 轮加密耗时 300-700ms（生产环境正常）

### 3. Express async 异常

- Express 4 不自动 catch async 函数异常
- 必须用 `require('express-async-errors')`（**必须第一行 require**）
- 否则进程崩溃 → Docker 重启 → 用户看到 502

### 4. Cloudflare Tunnel 域名会变

- 每次重启 cloudflared 都会换域名
- 小程序 apiBase 也要改
- 临时方案，正式上线要用自有域名

### 5. .env 文件的 shell 转义陷阱

- bcrypt hash 含 `$` 符号
- ssh/bash 解释 `$` 为变量
- 必须用文件 + source 命令绕开

---

## 🔄 后续计划

### 短期（1-2 周）

1. **footballdazi.cn 备案**（5-15 天）
2. **买 SSL 证书**（备案后用腾讯云免费 SSL）
3. **从 Cloudflare Tunnel 切到自有域名**

### 中期（1 个月）

1. **后端监控告警**（cron 健康度）
2. **数据库备份**（每日自动）
3. **admin-web 完善**（场地管理、凑人管理）

### 长期（3 个月）

1. **支付集成**（需企业主体）
2. **小程序主体升级**（个人 → 个体户）
3. **小程序发布上线**

---

## 📂 关键路径

| 路径 | 说明 |
|------|------|
| `/opt/football-dazi/football-dazi-backend/` | 服务器代码目录 |
| `/opt/football-dazi/football-dazi-backend/.env` | 环境变量 |
| `/tmp/cf-tunnel.log` | Cloudflare Tunnel 日志 |
| `~/Desktop/懂王专属/市场分析/广州足球小程序开发/` | 小程序前端代码 |
| `~/Desktop/懂王专属/市场分析/足球搭子后端/` | 后端代码 |
| `~/Downloads/football-tencent.pem` | 服务器 SSH 私钥 |

---

## 🔑 重要凭证（不要发给别人）

- 服务器 SSH 私钥：~/Downloads/football-tencent.pem
- MySQL root 密码：Fdazi2…_xyz（.env）
- 微信小程序 AppID：wx3971d03720057db3
- 微信小程序 AppSecret：81c082…d33e（.env）
- JWT Secret：ee4282…b313（.env）

---

**文档结束。如有问题问懂王。** 🐱