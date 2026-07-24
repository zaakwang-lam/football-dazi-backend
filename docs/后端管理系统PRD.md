# 「足球搭子」后端管理系统 PRD

> Web Admin · 场地方 + 平台运营方使用
> 版本：v1.0 / 2026-07-23

---

## 一、产品定位

「足球搭子」后端管理系统是 B 端运营平台，包含两个独立的 Web 应用：

### 1.1 场地方后台（`/admin/court`）
- **使用者**：广州足球场地运营方（社会球场、校园场地、商业球场）
- **核心价值**：自助管理场地、排期、订单、财务、营销
- **设计原则**：操作极简（场地方人员技术水平参差不齐）

### 1.2 平台运营后台（`/admin/ops`）
- **使用者**：「足球搭子」平台运营团队
- **核心价值**：管理全平台用户、场地、订单、数据看板、风险监控
- **设计原则**：数据驱动 + 权限分级

---

## 二、技术架构

### 2.1 技术栈

| 层 | 技术 | 理由 |
|----|------|------|
| 后端框架 | Node.js + Express | 异步 IO 性能好，小程序前后端语言统一 |
| 数据库 | MySQL 8.0 | 成熟稳定，事务支持完善 |
| ORM | Sequelize | 支持事务、迁移、关联 |
| 鉴权 | JWT + Refresh Token | 无状态、可扩展 |
| 缓存 | Redis | 热点数据缓存、分布式 session |
| 文件存储 | 腾讯云 COS | 微信生态兼容 |
| 日志 | Winston + ELK | 生产环境必备 |
| 部署 | Docker + Nginx + PM2 | 标准化部署 |

### 2.2 Web Admin 前端

| 层 | 技术 |
|----|------|
| 框架 | Vue 3 + Vite |
| UI 库 | Element Plus |
| 路由 | Vue Router 4 |
| 状态管理 | Pinia |
| HTTP | Axios |
| 图表 | ECharts（数据看板） |

### 2.3 系统模块划分

```
backend/                    # 后端 API 服务
├── src/
│   ├── controllers/        # 控制器（请求处理）
│   ├── services/           # 业务逻辑
│   ├── models/             # Sequelize 模型
│   ├── routes/             # 路由
│   ├── middlewares/        # 中间件（鉴权/限流/日志）
│   ├── utils/              # 工具函数
│   ├── config/             # 配置
│   ├── jobs/               # 定时任务
│   └── pay/                # 微信支付
├── migrations/             # 数据库迁移
├── tests/                  # 测试
└── docs/                   # Swagger 文档

admin-web/                  # Web Admin 前端
├── src/
│   ├── views/              # 页面
│   ├── components/         # 组件
│   ├── api/                # API 封装
│   ├── router/             # 路由
│   ├── store/              # Pinia
│   └── utils/
└── public/
```

---

## 三、数据库设计（11 张核心表）

### 3.1 用户表 `users`

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT PK | 主键 |
| openid | VARCHAR(64) UNIQUE | 微信 openid |
| unionid | VARCHAR(64) | 微信 unionid |
| nickname | VARCHAR(64) | 昵称 |
| avatar_url | VARCHAR(255) | 头像 |
| phone | VARCHAR(20) | 手机号 |
| gender | TINYINT | 性别 |
| city | VARCHAR(32) | 城市 |
| level | VARCHAR(32) | 业余/校队/职业 |
| status | TINYINT | 1=正常 0=禁用 |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |

### 3.2 场地表 `courts`

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT PK | 主键 |
| name | VARCHAR(64) | 场地名 |
| owner_id | INT FK | 场地方管理员 ID |
| type | ENUM | 11人制/7人制/5人制 |
| address | VARCHAR(255) | 地址 |
| longitude | DECIMAL(10,6) | 经度 |
| latitude | DECIMAL(9,6) | 纬度 |
| phone | VARCHAR(20) | 联系电话 |
| price | DECIMAL(10,2) | 单场价格 |
| open_time | TIME | 营业开始 |
| close_time | TIME | 营业结束 |
| images | JSON | 图片 URL 数组 |
| tags | JSON | 标签数组 |
| description | TEXT | 描述 |
| status | TINYINT | 1=营业 0=休息 2=审核中 |
| rating | DECIMAL(2,1) | 评分 |
| created_at | DATETIME | |

### 3.3 场地排期表 `court_schedules`

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT PK | 主键 |
| court_id | INT FK | 场地 ID |
| date | DATE | 日期 |
| time_slot | VARCHAR(16) | 时段 08:00-10:00 |
| status | ENUM | free/booked/closed |
| price | DECIMAL(10,2) | 实际价格（可折扣） |
| order_id | INT FK | 关联订单（已订时） |

### 3.4 订单表 `orders`

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT PK | 主键 |
| order_no | VARCHAR(32) UNIQUE | 订单号 |
| user_id | INT FK | 用户 ID |
| court_id | INT FK | 场地 ID |
| schedule_id | INT FK | 排期 ID |
| amount | DECIMAL(10,2) | 订单金额 |
| pay_amount | DECIMAL(10,2) | 实付金额 |
| status | ENUM | pending/paid/refunded/canceled/completed |
| pay_method | VARCHAR(16) | wxpay |
| transaction_id | VARCHAR(64) | 微信交易号 |
| pay_time | DATETIME | 支付时间 |
| refund_time | DATETIME | 退款时间 |
| contact_name | VARCHAR(32) | 联系人 |
| contact_phone | VARCHAR(20) | 联系手机 |
| remark | VARCHAR(255) | 备注 |
| created_at | DATETIME | |

### 3.5 凑人表 `lfg_posts`

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT PK | 主键 |
| user_id | INT FK | 发布人 |
| team_id | INT FK NULL | 球队 ID（可选） |
| type | ENUM | sub/war/join |
| title | VARCHAR(64) | 标题 |
| location | VARCHAR(128) | 地点 |
| play_time | DATETIME | 比赛时间 |
| need_count | INT | 缺人数 |
| level | VARCHAR(32) | 水平 |
| contact | VARCHAR(64) | 联系方式 |
| description | TEXT | 详细说明 |
| status | ENUM | open/closed/full |
| joined_count | INT | 已报名人数 |
| created_at | DATETIME | |

### 3.6 凑人报名表 `lfg_joins`

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT PK | 主键 |
| lfg_id | INT FK | 凑人 ID |
| user_id | INT FK | 报名用户 |
| status | ENUM | pending/confirmed/rejected |
| created_at | DATETIME | |

### 3.7 球队表 `teams`

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT PK | 主键 |
| name | VARCHAR(64) | 球队名 |
| captain_id | INT FK | 队长 ID |
| logo | VARCHAR(255) | logo |
| district | VARCHAR(32) | 区域 |
| motto | VARCHAR(128) | 口号 |
| description | TEXT | 介绍 |
| founded | DATE | 成立日期 |
| level | INT | 等级 1-5 |
| recruitment | BOOLEAN | 是否招募 |
| status | TINYINT | 1=正常 0=解散 |
| created_at | DATETIME | |

### 3.8 球队成员表 `team_members`

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT PK | 主键 |
| team_id | INT FK | 球队 ID |
| user_id | INT FK | 用户 ID |
| role | ENUM | captain/vice/player |
| position | VARCHAR(16) | 位置 |
| joined_at | DATETIME | 加入时间 |
| status | TINYINT | 1=在队 0=退出 |

### 3.9 考勤表 `checkins`

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT PK | 主键 |
| team_id | INT FK | 球队 ID |
| user_id | INT FK | 用户 ID |
| schedule_id | INT FK | 排期 ID |
| check_in_time | DATETIME | 打卡时间 |
| longitude | DECIMAL(10,6) | GPS 经度 |
| latitude | DECIMAL(9,6) | GPS 纬度 |
| status | ENUM | normal/late/manual |

### 3.10 AA 收款表 `aa_payments`

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT PK | 主键 |
| team_id | INT FK | 球队 ID |
| initiator_id | INT FK | 发起人 |
| title | VARCHAR(64) | 收款标题 |
| total_amount | DECIMAL(10,2) | 总金额 |
| per_amount | DECIMAL(10,2) | 人均 |
| payer_id | INT FK NULL | 实际付款人 |
| status | ENUM | pending/paid/closed |

### 3.11 管理员表 `admins`

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT PK | 主键 |
| username | VARCHAR(32) UNIQUE | 用户名 |
| password_hash | VARCHAR(255) | 密码哈希 |
| role | ENUM | super_admin/court_admin/finance/ops |
| court_id | INT FK NULL | 关联场地（场地方管理员） |
| real_name | VARCHAR(32) | 真实姓名 |
| phone | VARCHAR(20) | 手机 |
| status | TINYINT | 1=正常 0=禁用 |
| last_login_at | DATETIME | 最后登录 |

---

## 四、API 接口设计

### 4.1 鉴权接口

| Method | URL | 鉴权 | 说明 |
|--------|-----|------|------|
| POST | `/api/admin/login` | ❌ | 管理员登录 |
| POST | `/api/admin/refresh` | ❌ | 刷新 token |
| POST | `/api/admin/logout` | ✅ | 登出 |
| GET | `/api/admin/profile` | ✅ | 当前用户信息 |

### 4.2 用户管理（运营后台）

| Method | URL | 说明 |
|--------|-----|------|
| GET | `/api/admin/users` | 用户列表（分页/筛选） |
| GET | `/api/admin/users/:id` | 用户详情 |
| PUT | `/api/admin/users/:id/status` | 启用/禁用 |
| GET | `/api/admin/users/:id/orders` | 用户订单 |

### 4.3 场地管理（双后台）

| Method | URL | 说明 |
|--------|-----|------|
| GET | `/api/admin/courts` | 场地列表 |
| POST | `/api/admin/courts` | 创建场地 |
| GET | `/api/admin/courts/:id` | 场地详情 |
| PUT | `/api/admin/courts/:id` | 编辑场地 |
| DELETE | `/api/admin/courts/:id` | 删除场地 |
| POST | `/api/admin/courts/:id/audit` | 审核场地（运营） |
| GET | `/api/admin/courts/:id/schedules` | 排期列表 |
| POST | `/api/admin/courts/:id/schedules` | 批量设置排期 |
| PUT | `/api/admin/courts/:id/schedules/:sid` | 修改排期 |

### 4.4 订单管理

| Method | URL | 说明 |
|--------|-----|------|
| GET | `/api/admin/orders` | 订单列表 |
| GET | `/api/admin/orders/:id` | 订单详情 |
| POST | `/api/admin/orders/:id/confirm` | 确认订单（场地方） |
| POST | `/api/admin/orders/:id/reject` | 拒绝订单 |
| POST | `/api/admin/orders/:id/refund` | 退款 |
| GET | `/api/admin/orders/stats` | 订单统计 |

### 4.5 财务管理

| Method | URL | 说明 |
|--------|-----|------|
| GET | `/api/admin/finance/summary` | 财务总览 |
| GET | `/api/admin/finance/transactions` | 交易流水 |
| POST | `/api/admin/finance/withdraw` | 提现申请 |
| GET | `/api/admin/finance/withdraws` | 提现记录 |
| POST | `/api/admin/finance/withdraws/:id/approve` | 审批提现（运营） |
| GET | `/api/admin/finance/reconciliation` | 对账报表 |

### 4.6 营销管理

| Method | URL | 说明 |
|--------|-----|------|
| GET | `/api/admin/coupons` | 优惠券列表 |
| POST | `/api/admin/coupons` | 创建优惠券 |
| PUT | `/api/admin/coupons/:id` | 编辑 |
| DELETE | `/api/admin/coupons/:id` | 删除 |
| GET | `/api/admin/campaigns` | 活动列表 |
| POST | `/api/admin/campaigns` | 创建活动 |

### 4.7 凑人/球队管理（运营）

| Method | URL | 说明 |
|--------|-----|------|
| GET | `/api/admin/lfg/posts` | 凑人列表 |
| DELETE | `/api/admin/lfg/posts/:id` | 删除违规凑人 |
| GET | `/api/admin/teams` | 球队列表 |
| PUT | `/api/admin/teams/:id/status` | 启用/禁用 |

### 4.8 数据看板（运营）

| Method | URL | 说明 |
|--------|-----|------|
| GET | `/api/admin/dashboard/overview` | 总览数据 |
| GET | `/api/admin/dashboard/revenue` | 收入趋势 |
| GET | `/api/admin/dashboard/users` | 用户增长 |
| GET | `/api/admin/dashboard/courts` | 场地运营 |

### 4.9 管理员管理（仅 super_admin）

| Method | URL | 说明 |
|--------|-----|------|
| GET | `/api/admin/admins` | 管理员列表 |
| POST | `/api/admin/admins` | 创建管理员 |
| PUT | `/api/admin/admins/:id` | 编辑 |
| DELETE | `/api/admin/admins/:id` | 删除 |

---

## 五、Web Admin 页面设计

### 5.1 场地方后台（`/admin/court`）

#### 页面清单
| 路由 | 页面 | 功能 |
|------|------|------|
| `/login` | 登录页 | 账号密码登录 |
| `/dashboard` | 工作台 | 今日订单、收入、消息 |
| `/courts` | 场地管理 | 我的场地列表 |
| `/courts/:id` | 场地详情 | 编辑信息、看评价 |
| `/courts/:id/schedule` | 排期管理 | 7×24 排期网格 |
| `/orders` | 订单管理 | 订单列表/详情/确认 |
| `/finance` | 财务管理 | 收入/提现 |
| `/marketing` | 营销工具 | 优惠券/折扣场次 |
| `/customers` | 客户管理 | 客户标签/复购提醒 |
| `/settings` | 设置 | 密码/资料 |

#### 核心页面 Wireframe

**工作台：**
```
┌─────────────────────────────────┐
│ 📊 今日数据                      │
├─────────────────────────────────┤
│ ┌──────┐ ┌──────┐ ┌──────┐ ┌────┐ │
│ │订单数 │ │收入   │ │新客户 │ │评分│ │
│ │ 12   │ │ ¥3200 │ │ 5    │ │4.8 │ │
│ └──────┘ └──────┘ └──────┘ └────┘ │
├─────────────────────────────────┤
│ 待处理订单 (3)                   │
│ ┌────────────────────────────────┐│
│ │ #O1001 天河老王  19:00  ¥1200  ││
│ │ [确认] [拒绝]                  ││
│ └────────────────────────────────┘│
├─────────────────────────────────┤
│ 最近评价                         │
│ ⭐⭐⭐⭐⭐ "场地很好..." - 王队长  │
└─────────────────────────────────┘
```

**排期管理：**
```
┌────────────────────────────────────────┐
│ 排期管理 - 天河体育中心                  │
├────────────────────────────────────────┤
│ [< 7/23 周三 >] [批量设置] [导出]        │
│       08 10 12 14 16 18 20 22          │
│ 场地1  ✓  ✓  ✓  ✓  ✗  ✗  ✗  ✓          │
│ 场地2  ✓  ✓  ✓  ✗  ✗  ✗  ✓  ✓          │
│       [折扣] [关闭] [开放]               │
├────────────────────────────────────────┤
│ ✓ 空闲  ✗ 已订  ¥ 折扣场                │
└────────────────────────────────────────┘
```

### 5.2 平台运营后台（`/admin/ops`）

#### 页面清单
| 路由 | 页面 | 功能 |
|------|------|------|
| `/login` | 登录 | 同上 |
| `/dashboard` | 数据看板 | ECharts 图表 |
| `/users` | 用户管理 | 列表/详情/禁用 |
| `/courts` | 场地审核 | 审核新场地 |
| `/orders` | 全平台订单 | 监控/介入 |
| `/finance` | 财务管理 | 平台收入/提现审批 |
| `/lfg` | 凑人管理 | 内容审核 |
| `/teams` | 球队管理 | 球队列表 |
| `/coupons` | 优惠券管理 | 全平台券 |
| `/admins` | 管理员 | 仅 super_admin |
| `/settings` | 设置 | 密码/系统配置 |

#### 数据看板 Wireframe
```
┌─────────────────────────────────────┐
│ 足球搭子 · 数据看板    [7月] [导出]  │
├─────────────────────────────────────┤
│ 总览 (今日)                          │
│ ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐      │
│ │用户│ │订单│ │GMV │ │活跃│ │凑人│ │新增││
│ │1.2w│ │156│ │7.8w│ │432 │ │12 │ │35││
│ └──┘ └──┘ └──┘ └──┘ └──┘ └──┘      │
├─────────────────────────────────────┤
│ 收入趋势 (折线图)                    │
│ ┌───────────────────────────────────┐│
│ │     ╱╲    ╱╲                     ││
│ │    ╱  ╲  ╱  ╲___                 ││
│ │ ╱╲╱    ╲╱      ╲___              ││
│ └───────────────────────────────────┘│
├─────────────────────────────────────┤
│ 场地运营 Top 5 (柱状图)              │
│ 用户增长 (折线图)                    │
│ 凑人成功率 (环形图)                  │
└─────────────────────────────────────┘
```

---

## 六、核心业务流程

### 6.1 场地方入驻流程
```
申请入驻 → 提交资质 → 运营审核 → 创建账号 → 录入场地 → 平台审核 → 上线
```

### 6.2 订单处理流程
```
用户下单 → 微信支付 → 场地方确认 → 用户到场 → 打卡 → 完成
   ↓          ↓           ↓
 30min     实时通知    可拒单（5min内）
超时退款
```

### 6.3 财务结算流程
```
订单完成 → T+1 自动结算 → 平台抽佣 → 场地方余额 → 提现申请 → 财务审批 → 打款
```

---

## 七、安全设计

### 7.1 鉴权
- **JWT Token**：Access Token (2h) + Refresh Token (7d)
- **RBAC 权限**：super_admin / court_admin / finance / ops 四级
- **接口限流**：100 req/min per IP（防止爬虫）

### 7.2 数据安全
- **密码**：bcrypt 加密（cost=12）
- **敏感字段**：手机号 AES 加密存储
- **SQL 注入**：Sequelize 参数化查询
- **XSS**：前端输出转义
- **CSRF**：SameSite Cookie + Token

### 7.3 审计
- **操作日志**：所有写接口记录 `who/when/what`
- **登录日志**：记录 IP、UA、时间

---

## 八、部署架构

```
┌──────────────────────────────────────────┐
│  腾讯云轻量应用服务器 (2C4G)              │
│  ┌──────────────────────────────────┐   │
│  │ Nginx (反向代理 + 静态资源)        │   │
│  └──────────────────────────────────┘   │
│  ┌──────────────────────────────────┐   │
│  │ Node.js (PM2 集群模式)            │   │
│  │  - API 服务 (端口 3000)            │   │
│  │  - Web Admin (端口 8080)           │   │
│  └──────────────────────────────────┘   │
│  ┌──────────────────────────────────┐   │
│  │ MySQL 8.0 (Docker)                │   │
│  └──────────────────────────────────┘   │
│  ┌──────────────────────────────────┐   │
│  │ Redis (Docker)                    │   │
│  └──────────────────────────────────┘   │
└──────────────────────────────────────────┘
        ↓                              ↓
   微信小程序                          Web 浏览器
```

---

## 九、开发计划（3 周）

| 周 | 任务 | 交付 |
|----|------|------|
| W1 | 脚手架 + 用户/场地/订单模块 + 支付集成 | API 可用 + Swagger |
| W2 | 凑人/球队/财务模块 + 场地方 Web Admin | 场地方可登录使用 |
| W3 | 运营后台 + 数据看板 + 部署上线 | 全平台可运营 |

---

## 十、成本估算

| 项目 | 金额 | 说明 |
|------|------|------|
| 服务器（年） | 1,500 | 腾讯云 2C4G |
| 数据库 | 0 | MySQL 自带 |
| Redis | 0 | 自带 |
| 域名 | 80 | .com |
| SSL | 0 | Let's Encrypt |
| COS 存储 | 100 | 图片存储 |
| 合计首年 | **约 1,700 元** | |

---

**PRD 完结，下一步：懂王开始写代码**