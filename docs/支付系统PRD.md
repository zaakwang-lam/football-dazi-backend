# 「足球搭子」支付系统 PRD

> 微信支付集成 · 订单 + 退款 + 分账 + 对账
> 版本：v1.0 / 2026-07-23

---

## 一、支付场景全景

「足球搭子」涉及 3 类资金流：

| 场景 | 付款方 | 收款方 | 支付类型 |
|------|--------|--------|---------|
| **场地预订** | C 端球员 | 平台（中间账户） | JSAPI 支付 |
| **队费 AA** | C 端球员 | 队长（提现） | JSAPI 支付 + 提现 |
| **场地方提现** | 平台 | B 端场地方 | 企业付款到零钱/银行卡 |

---

## 二、账户体系设计

### 2.1 平台账户（中转）

```
                    ┌─────────────┐
                    │ 微信支付商户  │
                    │   (平台)     │
                    └─────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        ↓                 ↓                 ↓
   ┌────────┐       ┌────────┐       ┌────────┐
   │平台收入│       │待结算  │       │待提现  │
   │(佣金)  │       │(场地方)│       │(用户)  │
   └────────┘       └────────┘       └────────┘
```

### 2.2 场地方账户（虚拟账户）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT PK | 主键 |
| court_id | INT FK | 场地 ID |
| balance | DECIMAL(10,2) | 可提现余额 |
| frozen | DECIMAL(10,2) | 冻结金额（T+N 提现） |
| total_in | DECIMAL(10,2) | 累计收入 |
| total_out | DECIMAL(10,2) | 累计提现 |

### 2.3 用户钱包

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT PK | 主键 |
| user_id | INT FK | 用户 ID |
| balance | DECIMAL(10,2) | 余额 |
| frozen | DECIMAL(10,2) | 冻结 |

---

## 三、核心支付流程

### 3.1 场地预订（C 端球员 → 平台）

```
┌──────────┐         ┌──────────┐         ┌──────────┐         ┌──────────┐
│  小程序   │         │  后端    │         │ 微信支付  │         │ 场地方   │
└────┬─────┘         └────┬─────┘         └────┬─────┘         └────┬─────┘
     │  1.选场下单       │                   │                    │
     ├─────────────────→│                   │                    │
     │                  │ 2.创建订单(未支付) │                    │
     │                  │ (返回 prepay_id)   │                    │
     │ 3.返回支付参数    │                   │                    │
     │←─────────────────┤                   │                    │
     │                  │                   │                    │
     │ 4.wx.requestPayment                 │                    │
     ├─────────────────────────────────────→│                    │
     │                  │                   │ 5.回调支付结果      │
     │                  │←─────────────────┤                    │
     │                  │ 6.验签+更新订单    │                    │
     │                  │ (status=paid)      │                    │
     │                  │                   │                    │
     │                  │ 7.通知场地方                              │
     │                  ├─────────────────────────────────────────→│
     │                  │ 8.分配场地方账户(+90%)                  │
     │                  │   平台收入(+10%)                        │
     │ 9.返回支付成功    │                   │                    │
     │←──────────────────────────────────────┤                    │
     │ 10.跳转订单详情  │                   │                    │
     └──────────────────┴───────────────────┴────────────────────┘
```

**关键步骤详解：**

#### Step 1-3：创建订单 + 调起支付
```javascript
// 前端调用
POST /api/orders
{
  courtId: 1,
  scheduleId: 100,
  contactName: '王队长',
  contactPhone: '138****8888'
}

// 后端响应
{
  code: 0,
  data: {
    orderId: 'O1722345678',
    orderNo: 'O1722345678901',
    amount: 1200.00,
    payParams: {
      // wx.requestPayment 所需参数
      timeStamp: '1722345678',
      nonceStr: '5K8264ILTKCH...',
      package: 'prepay_id=wx201...',
      signType: 'MD5',
      paySign: 'C380BEC2BFD727A4B684513...'
    }
  }
}
```

#### Step 4：微信支付（JSAPI）
```javascript
wx.requestPayment({
  timeStamp: payParams.timeStamp,
  nonceStr: payParams.nonceStr,
  package: payParams.package,
  signType: payParams.signType,
  paySign: payParams.paySign,
  success: () => { /* 跳转订单详情 */ },
  fail: () => { /* 提示支付失败 */ }
});
```

#### Step 5-6：支付回调
```javascript
// 微信回调地址（公网可访问）
POST /api/payment/notify

// 验签逻辑
1. 接收微信 POST 的 XML 数据
2. 解析为对象
3. 按字典序拼接参数 + key
4. MD5 加密后对比 sign
5. 验签通过 → 更新订单 → 返回 SUCCESS
```

### 3.2 退款流程

```
┌──────────┐         ┌──────────┐         ┌──────────┐
│  用户   │         │  后端    │         │ 微信支付  │
└────┬─────┘         └────┬─────┘         └────┬─────┘
     │  1.申请退款        │                   │
     ├─────────────────→│                   │
     │                  │ 2.校验(24h内/未使用)│
     │                  │ 3.调用退款API       │
     │                  ├──────────────────→│
     │                  │ 4.返回退款结果      │
     │                  │←──────────────────┤
     │                  │ 5.更新订单状态      │
     │ 6.退款成功通知    │   (refunded)       │
     │←─────────────────┤                   │
     │                  │ 7.回调场地方账户    │
     │                  │ 8.通知场地方        │
     └──────────────────┴───────────────────┘
```

**退款规则：**
| 场景 | 退款比例 | 时限 |
|------|---------|------|
| 提前 24h 取消 | 100% | 24h 前 |
| 提前 12h 取消 | 80% | 12h 前 |
| 12h 内取消 | 50% | 12h 内 |
| 场地方责任 | 100% + 平台补偿券 | 任意 |
| 天气原因 | 100% | 12h 前 |

### 3.3 场地方提现流程

```
场地方发起提现 → 后端校验余额 → 调企业付款API → 微信打款到对公账户 → 通知场地方
```

**提现规则：**
- 最低提现金额：¥100
- 单日上限：¥50,000
- 手续费：1%（平台承担）
- 到账时间：T+1 工作日

---

## 四、API 接口详细设计

### 4.1 统一下单

```
POST /api/v1/payment/unified-order
Content-Type: application/json
Authorization: Bearer {jwt}

Request:
{
  "orderId": "O1722345678",  // 业务订单 ID
  "openid": "o6zAJs3uAO71M87C_azh9Crlh-Lg",
  "amount": 1200.00,
  "description": "天河体育中心 11人场 今晚20:00"
}

Response (成功):
{
  "code": 0,
  "data": {
    "prepayId": "wx201...",
    "payParams": {
      "timeStamp": "1722345678",
      "nonceStr": "5K8264ILTK...",
      "package": "prepay_id=wx201...",
      "signType": "MD5",
      "paySign": "C380BEC2BFD..."
    }
  }
}
```

### 4.2 支付回调

```
POST /api/payment/notify
Content-Type: application/xml

微信回调 XML:
<xml>
  <appid><![CDATA[wx1234567890]]></appid>
  <mch_id><![CDATA[1900000109]]></mch_id>
  <out_trade_no><![CDATA[O1722345678901]]></out_trade_no>
  <transaction_id><![CDATA[420000123420230101]]></transaction_id>
  <total_fee><![CDATA[120000]]></total_fee>  // 单位：分
  <result_code><![CDATA[SUCCESS]]></result_code>
  <sign><![CDATA[ABC123...]]></sign>
</xml>

后端响应 (成功):
<xml>
  <return_code><![CDATA[SUCCESS]]></return_code>
  <return_msg><![CDATA[OK]]></return_msg>
</xml>
```

### 4.3 申请退款

```
POST /api/v1/payment/refund
Content-Type: application/json
Authorization: Bearer {jwt}

Request:
{
  "orderId": "O1722345678",
  "reason": "用户主动取消",
  "amount": 1200.00  // 可选，部分退款
}

Response:
{
  "code": 0,
  "data": {
    "refundId": "R1722345678",
    "refundNo": "R1722345678901",
    "status": "processing",
    "amount": 1200.00,
    "estimatedArrival": "1-3个工作日"
  }
}
```

### 4.4 查询退款

```
GET /api/v1/payment/refund/:refundId
Response:
{
  "code": 0,
  "data": {
    "refundId": "R1722345678",
    "status": "success",  // success/failed/processing
    "amount": 1200.00,
    "refundTime": "2026-07-23T16:30:00Z",
    "transactionId": "42000..."
  }
}
```

### 4.5 场地方提现

```
POST /api/v1/payment/withdraw
Authorization: Bearer {jwt}

Request:
{
  "amount": 5000.00,
  "bankAccount": "6225****1234",  // 对公账户
  "bankName": "招商银行",
  "accountName": "广州XX体育科技有限公司"
}

Response:
{
  "code": 0,
  "data": {
    "withdrawId": "W1722345678",
    "status": "processing",
    "estimatedArrival": "T+1 工作日"
  }
}
```

### 4.6 对账报表（每日 03:00 自动跑）

```
GET /api/v1/payment/reconciliation?date=2026-07-23
Response:
{
  "code": 0,
  "data": {
    "date": "2026-07-23",
    "totalOrders": 156,
    "totalAmount": 78500.00,
    "refundCount": 5,
    "refundAmount": 1200.00,
    "platformIncome": 7850.00,
    "courtIncome": 70650.00,
    "discrepancies": [],  // 异常订单
    "wechatTransactions": [
      { "orderNo": "O1722345678901", "amount": 1200.00, "transactionId": "42000..." }
    ]
  }
}
```

---

## 五、安全设计

### 5.1 签名算法（MD5）

```javascript
const crypto = require('crypto');

function sign(params, key) {
  // 1. 过滤空值
  const filtered = Object.entries(params)
    .filter(([k, v]) => v !== '' && v !== null && v !== undefined && k !== 'sign')
    .sort(([a], [b]) => a.localeCompare(b));
  
  // 2. 拼接 URL 编码的 key=value&key=value
  const stringA = filtered
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  
  // 3. 拼接 API key
  const stringSignTemp = `${stringA}&key=${key}`;
  
  // 4. MD5 加密并转大写
  return crypto.createHash('md5')
    .update(stringSignTemp, 'utf8')
    .digest('hex')
    .toUpperCase();
}
```

### 5.2 验签逻辑

```javascript
function verifySign(xmlData, apiKey) {
  const params = parseXml(xmlData);
  const receivedSign = params.sign;
  const calculatedSign = sign(params, apiKey);
  return receivedSign === calculatedSign;
}
```

### 5.3 幂等性

- **订单号唯一**：使用 `out_trade_no` + 业务订单号双重校验
- **回调去重**：用 `transaction_id` 作为唯一键，已处理过的直接返回 SUCCESS
- **退款去重**：用 `out_refund_no` 作为唯一键

### 5.4 风控

| 规则 | 阈值 | 动作 |
|------|------|------|
| 单用户日下单 | ≤ 5 笔 | 超限拒绝 |
| 单用户日退款 | ≤ 3 笔 | 超限人工审核 |
| 单场地日订单 | ≤ 100 笔 | 触发风控 |
| IP 异常 | 5 分钟内 ≥ 50 请求 | 封禁 IP 1 小时 |

---

## 六、数据表设计

### 6.1 支付订单表 `payment_orders`

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT PK | |
| order_no | VARCHAR(32) UNIQUE | 平台订单号 |
| transaction_id | VARCHAR(64) UNIQUE | 微信交易号 |
| user_id | INT FK | 付款用户 |
| court_id | INT FK | 场地 |
| business_type | ENUM | court_book/aa_payment |
| amount | DECIMAL(10,2) | 金额 |
| status | ENUM | pending/paid/refunded/canceled |
| pay_method | VARCHAR(16) | wxpay |
| pay_time | DATETIME | 支付时间 |
| prepay_id | VARCHAR(64) | 预支付 ID |
| created_at | DATETIME | |

### 6.2 退款表 `payment_refunds`

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT PK | |
| refund_no | VARCHAR(32) UNIQUE | 退款单号 |
| refund_id | VARCHAR(64) UNIQUE | 微信退款单号 |
| order_no | VARCHAR(32) | 原订单号 |
| amount | DECIMAL(10,2) | 退款金额 |
| reason | VARCHAR(255) | 退款原因 |
| status | ENUM | processing/success/failed |
| operator_id | INT FK | 操作人 |
| created_at | DATETIME | |
| completed_at | DATETIME | 完成时间 |

### 6.3 提现表 `payment_withdraws`

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT PK | |
| withdraw_no | VARCHAR(32) UNIQUE | 提现单号 |
| court_id | INT FK | 场地 |
| amount | DECIMAL(10,2) | 金额 |
| fee | DECIMAL(10,2) | 手续费 |
| bank_account | VARCHAR(32) | 银行卡号 |
| bank_name | VARCHAR(32) | 银行名 |
| account_name | VARCHAR(64) | 账户名 |
| status | ENUM | pending/processing/success/failed |
| approver_id | INT FK | 审批人 |
| created_at | DATETIME | |

### 6.4 资金流水表 `payment_ledger`

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT PK | |
| account_type | ENUM | platform/court/user |
| account_id | INT | 对应账户 ID |
| direction | ENUM | in/out |
| amount | DECIMAL(10,2) | 金额 |
| balance_after | DECIMAL(10,2) | 操作后余额 |
| business_type | VARCHAR(32) | 业务类型 |
| business_id | VARCHAR(32) | 业务 ID |
| remark | VARCHAR(255) | 备注 |
| created_at | DATETIME | |

---

## 七、定时任务

| 任务 | 时间 | 说明 |
|------|------|------|
| **支付订单超时关单** | 每 5 分钟 | 创建 30 分钟未支付 → 自动取消 |
| **场地方结算（T+1）** | 每日 02:00 | 已完成订单 → 场地方账户入账 |
| **每日对账** | 每日 03:00 | 平台数据 vs 微信账单 |
| **退款自动查询** | 每小时 | processing 状态 → 查询微信 |
| **提现自动重试** | 每日 09:00 | failed 状态自动重试 |

---

## 八、测试与沙箱

### 8.1 微信支付沙箱

- **测试商户号**：通过 `https://pay.weixin.qq.com/wiki/doc/api/jsapi.php` 申请
- **测试金额**：0.01、0.02 等小额
- **测试回调**：用 `ngrok` 或 `natapp` 暴露本地服务

### 8.2 测试用例

| 用例 | 输入 | 预期 |
|------|------|------|
| 正常下单 | amount=1200 | 200 + payParams |
| 余额不足 | amount=999999999 | 400 + error |
| 重复下单 | 同 orderNo 两次 | 幂等返回原订单 |
| 支付失败 | 余额不足 | 微信回调 FAIL |
| 退款-全额 | amount=1200 | refundId |
| 退款-部分 | amount=600 | 部分退款 |
| 提现 | amount=5000 | pending |

---

## 九、监控告警

| 指标 | 阈值 | 告警方式 |
|------|------|---------|
| 支付成功率 | < 95% | 微信群机器人 |
| 退款率 | > 10% | 邮件 |
| 对账差异 | > 0 | 短信 |
| 回调延迟 | > 5 秒 | 钉钉 |

---

## 十、上线清单

- [ ] 申请微信支付商户号
- [ ] 配置 API v2 密钥（32 位）
- [ ] 上传 API 证书（apiclient_cert.p12）
- [ ] 配置支付授权目录（小程序域名）
- [ ] 配置回调白名单
- [ ] 沙箱测试全通过
- [ ] 切换生产环境
- [ ] 第一笔真实交易验证

---

**PRD 完结**