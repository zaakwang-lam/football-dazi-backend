# 「足球搭子」后端 + 支付系统

> Node.js + Express + MySQL + Sequelize + 微信支付 v2

---

## 🚀 快速启动

### 1. 安装依赖

```bash
cd ~/Desktop/懂王专属/市场分析/足球搭子后端/backend
npm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env，填入真实配置：
# - DB_PASSWORD（MySQL 密码）
# - WX_APPID / WX_SECRET（小程序 AppID）
# - WX_MCHID / WX_PAY_KEY（微信支付商户号）
```

### 3. 创建数据库

```sql
CREATE DATABASE football_dazi CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 4. 初始化数据

```bash
node src/scripts/init-db.js
```

会创建：
- 12 张表
- 2 个管理员（admin/admin123 + tianhe_admin/court123）
- 3 个场地 + 168 个排期
- 3 个用户 + 2 个球队 + 2 条凑人

### 5. 启动服务

```bash
# 开发模式（nodemon 热更新）
npm run dev

# 生产模式
npm start
```

服务启动在 `http://localhost:3000`

---

## 📁 项目结构

```
backend/
├── src/
│   ├── app.js                 # 主入口
│   ├── config/                # 配置中心
│   ├── models/                # 12 张表的 Sequelize 模型
│   ├── controllers/           # 业务控制器
│   │   ├── auth.js            #   鉴权
│   │   ├── order.js           #   订单+支付
│   │   ├── court.js           #   场地
│   │   ├── lfg.js             #   凑人
│   │   ├── team.js            #   球队
│   │   └── dashboard.js       #   数据看板
│   ├── routes/                # 路由
│   ├── services/              # 服务层
│   │   └── wechat-pay.js      #   微信支付 v2 API
│   ├── middlewares/           # 中间件
│   │   ├── auth.js            #   JWT 鉴权
│   │   ├── error.js           #   错误处理
│   │   └── logger.js          #   请求日志
│   ├── utils/                 # 工具
│   │   ├── db.js              #   数据库连接
│   │   ├── jwt.js             #   JWT 签发/验证
│   │   ├── wechat-sign.js     #   微信签名/验签
│   │   ├── response.js        #   统一响应格式
│   │   └── logger.js          #   Winston 日志
│   └── scripts/
│       └── init-db.js         # 初始化脚本
├── logs/                      # 日志目录
├── certs/                     # 微信支付证书
├── .env.example               # 环境变量示例
├── package.json
└── README.md
```

---

## 📡 API 路由清单

### 公共
| Method | URL | 说明 |
|--------|-----|------|
| POST | `/api/admin/login` | 管理员登录 |
| POST | `/api/admin/refresh` | 刷新 Token |
| POST | `/api/user/login` | 小程序用户登录 |
| POST | `/api/payment/notify` | 微信支付回调（无需鉴权） |

### C 端（小程序，需 userAuth）
| Method | URL | 说明 |
|--------|-----|------|
| POST | `/api/v1/orders` | 创建订单 |
| GET | `/api/v1/orders` | 订单列表 |
| GET | `/api/v1/orders/:id` | 订单详情 |
| POST | `/api/v1/payment/unified-order` | 调起支付 |
| POST | `/api/v1/payment/refund` | 申请退款 |
| GET | `/api/v1/courts/nearby` | 附近场地 |
| GET | `/api/v1/courts/:id` | 场地详情 |
| GET | `/api/v1/courts/:id/schedule` | 排期 |
| GET | `/api/v1/lfg/list` | 凑人列表 |
| POST | `/api/v1/lfg` | 发布凑人 |
| POST | `/api/v1/lfg/:id/join` | 报名 |
| GET | `/api/v1/teams` | 球队列表 |
| POST | `/api/v1/teams` | 创建球队 |
| GET | `/api/v1/teams/:id` | 球队详情 |
| POST | `/api/v1/teams/:id/checkin` | 考勤打卡 |

### 管理后台（需 adminAuth）
| Method | URL | 说明 |
|--------|-----|------|
| GET | `/api/admin/profile` | 当前管理员 |
| POST | `/api/admin/logout` | 登出 |
| GET | `/api/admin/courts` | 场地列表 |
| POST | `/api/admin/courts` | 创建场地 |
| POST | `/api/admin/courts/:id/audit` | 审核场地 |
| GET | `/api/admin/dashboard/overview` | 总览 |
| GET | `/api/admin/dashboard/revenue` | 收入趋势 |
| GET | `/api/admin/dashboard/courts` | 场地 Top 10 |

---

## 🔐 微信支付集成

### 配置文件
```env
WX_APPID=wx1234567890abcdef
WX_MCHID=1900000109
WX_PAY_KEY=your_32_chars_api_key_for_md5_sign
WX_NOTIFY_URL=https://api.footballdazi.com/api/payment/notify
WX_CERT_PATH=./certs/apiclient_cert.pem
WX_KEY_PATH=./certs/apiclient_key.pem
```

### 证书
把微信支付商户平台的 `apiclient_cert.pem` 和 `apiclient_key.pem` 放到 `certs/` 目录。

### 测试
- 沙箱环境用 `https://api.mch.weixin.qq.com/sandboxnew/`
- 切换到正式 API 即可

### 支付流程
```
1. 小程序 wx.login → 后端 code2Session → 返回 token + openid
2. 小程序选择场地+时段 → POST /api/v1/orders → 返回 orderId
3. 小程序 POST /api/v1/payment/unified-order → 返回 payParams
4. 小程序 wx.requestPayment(payParams)
5. 用户支付成功 → 微信回调 /api/payment/notify
6. 后端验签+更新订单+通知场地方
7. 场地方 T+1 自动结算到平台账户
8. 场地方申请提现 → 后端审核 → 微信打款到对公账户
```

---

## 🧪 测试用例

```bash
# 1. 管理员登录
curl -X POST http://localhost:3000/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

# 2. 查看场地列表
curl http://localhost:3000/api/v1/courts/nearby

# 3. 创建订单
curl -X POST http://localhost:3000/api/v1/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"courtId":1,"scheduleId":1,"contactName":"老王","contactPhone":"13800138000"}'
```

---

## 📊 部署

```bash
# 1. 腾讯云轻量应用服务器（2C4G）
# 2. 安装 Node.js 18+ 和 MySQL 8.0
# 3. 上传代码 + .env
# 4. npm install --production
# 5. pm2 start src/app.js --name football-dazi
# 6. nginx 反向代理 + SSL
```

---

## 📝 下一步

- [ ] 接入 Swagger 自动生成 API 文档
- [ ] 实现场地方账户体系 + 提现
- [ ] 实现数据看板 ECharts 数据
- [ ] 实现定时任务（T+1 结算、对账）
- [ ] 单元测试 + 接口测试
- [ ] Docker 化部署

---

**作者**：懂王
**最后更新**：2026-07-23