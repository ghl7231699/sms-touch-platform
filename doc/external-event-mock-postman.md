# 外部事件 Mock 请求 Postman 文档

本文档用于通过 Postman 模拟外部业务系统调用短信触达平台的事件接入接口，验证链路是否闭环：

```text
外部系统事件 -> 事件来源鉴权 -> 事件入库 -> 自动化规则命中 -> 生成短信任务 -> 到期执行 -> 发送记录
```

## 前置条件

1. 本地服务已启动：

```bash
./scripts/start-dev.sh --seed
```

2. 默认演示事件来源已存在：

```text
AppId: demo_shop_app
Secret: demo_secret
```

3. 默认测试手机号统一使用：

```text
18515385071
```

4. 默认短信模板变量：

```json
{
  "code": "246810",
  "min": "5"
}
```

## Postman 环境变量

建议在 Postman 创建一个环境，配置以下变量：

| 变量名 | 值 |
| --- | --- |
| `baseUrl` | `http://127.0.0.1:3100` |
| `eventAppId` | `demo_shop_app` |
| `eventSecret` | `demo_secret` |
| `testPhone` | `18515385071` |

## 通用请求配置

所有事件请求都使用同一个接口：

```http
POST {{baseUrl}}/api/events
```

Headers：

| Key | Value |
| --- | --- |
| `Content-Type` | `application/json` |
| `x-event-app-id` | `{{eventAppId}}` |
| `x-event-secret` | `{{eventSecret}}` |

说明：

- `eventId` 必须唯一。下面示例使用 Postman 内置变量 `{{$timestamp}}` 避免重复。
- 如果接口返回 `EVENT_DUPLICATED`，说明事件 ID 重复，换一个 `eventId` 即可。
- 当前默认规则存在延迟，例如注册 24 小时、会员过期 3 天、活动开始前 1 小时、订单完成 7 天回访。因此请求成功后一定能验证“事件接入和任务生成”，但不一定立即发送短信。
- 如果要立刻验证真实发送，需要把对应规则延迟改为 `0 minute`，或等任务到期后执行“任务中心 -> 执行到期任务”。

## 1. 用户注册事件

用于模拟用户注册后尚未购买会员，命中“注册转化提醒”类规则。

```json
{
  "eventId": "mock_user_register_{{$timestamp}}",
  "eventType": "user_register",
  "occurredAt": "2026-06-12T10:00:00+08:00",
  "userId": "mock_user_18515385071",
  "phone": "{{testPhone}}",
  "payload": {
    "sourceSystem": "postman",
    "registerChannel": "mock_external_event",
    "hasMembership": false,
    "membershipPurchased": false,
    "membershipStatus": "none"
  },
  "templateParam": {
    "code": "246810",
    "min": "5"
  }
}
```

预期结果：

- 事件触发页面出现 `user_register` 事件。
- 命中注册转化规则。
- 生成一条自动化短信任务。
- 任务条件应判断为未购买会员，可在任务详情中查看条件结果。

## 2. 会员过期事件

用于模拟用户会员已过期，命中“会员过期召回”类规则。

```json
{
  "eventId": "mock_membership_expired_{{$timestamp}}",
  "eventType": "membership_expired",
  "occurredAt": "2026-06-12T10:05:00+08:00",
  "userId": "mock_member_18515385071",
  "phone": "{{testPhone}}",
  "payload": {
    "sourceSystem": "postman",
    "membershipStatus": "expired",
    "expiredAt": "2026-06-09T10:05:00+08:00",
    "productId": "vip_monthly",
    "hasMembership": false
  },
  "templateParam": {
    "code": "246810",
    "min": "5"
  }
}
```

预期结果：

- 事件触发页面出现 `membership_expired` 事件。
- 命中会员召回规则。
- 生成会员召回短信任务。

## 3. 活动开始事件

用于模拟活动即将开始，命中“活动开始通知”类规则。

```json
{
  "eventId": "mock_campaign_start_{{$timestamp}}",
  "eventType": "campaign_start",
  "occurredAt": "2026-06-12T10:10:00+08:00",
  "userId": "mock_campaign_user_18515385071",
  "phone": "{{testPhone}}",
  "payload": {
    "sourceSystem": "postman",
    "campaignId": "mock_campaign_001",
    "campaignName": "Postman 外部事件测试活动",
    "campaignStartAt": "2026-06-12T11:10:00+08:00",
    "subscribed": true
  },
  "templateParam": {
    "code": "246810",
    "min": "5"
  }
}
```

预期结果：

- 事件触发页面出现 `campaign_start` 事件。
- 命中活动通知规则。
- 生成活动通知短信任务。

## 4. 订单完成事件

用于模拟订单完成后回访，命中“订单完成回访”类规则。

```json
{
  "eventId": "mock_order_completed_{{$timestamp}}",
  "eventType": "order_completed",
  "occurredAt": "2026-06-12T10:15:00+08:00",
  "userId": "mock_order_user_18515385071",
  "phone": "{{testPhone}}",
  "payload": {
    "sourceSystem": "postman",
    "orderId": "mock_order_001",
    "orderStatus": "completed",
    "paid": true,
    "amount": 19900
  },
  "templateParam": {
    "code": "246810",
    "min": "5"
  }
}
```

预期结果：

- 事件触发页面出现 `order_completed` 事件。
- 命中售后回访规则。
- 生成订单完成回访短信任务。

## 返回结果怎么看

请求成功时通常返回：

```json
{
  "success": true,
  "event": {},
  "matchedRuleCount": 1,
  "queuedTaskCount": 1,
  "queuedTasks": [],
  "processedTasks": {}
}
```

关键字段：

| 字段 | 说明 |
| --- | --- |
| `matchedRuleCount` | 命中的启用规则数量，正常应大于 `0` |
| `queuedTaskCount` | 创建的短信任务数量，正常应大于 `0` |
| `queuedTasks` | 新生成的任务，包含任务状态、计划发送时间等信息 |
| `processedTasks` | 本次同步执行到期任务的结果 |

## 验证闭环

### 1. 查看事件是否进入系统

```bash
curl -sS '{{baseUrl}}/api/events?page=1&pageSize=20'
```

Postman 中也可以创建 GET 请求：

```http
GET {{baseUrl}}/api/events?page=1&pageSize=20
```

### 2. 查看是否生成任务

```http
GET {{baseUrl}}/api/tasks?page=1&pageSize=20&phoneSuffix=5071
```

### 3. 执行到期任务

如果任务已经到期，可以调用：

```http
POST {{baseUrl}}/api/tasks/run-due
```

Body：

```json
{
  "limit": 20
}
```

### 4. 查看发送记录

```http
GET {{baseUrl}}/api/send-logs?page=1&pageSize=20&keyword=18515385071
```

如果手机号已脱敏，也可以按模板、requestId、bizId 或场景筛选。

## 常见问题

### 事件请求成功，但没有立刻收到短信

先看返回值里的 `queuedTaskCount` 是否大于 `0`。

如果已经生成任务但没有发送，大概率是规则配置了延迟，任务还没有到计划发送时间。默认 seed 规则如下：

| 事件类型 | 默认规则 | 默认延迟 |
| --- | --- | --- |
| `user_register` | 注册24小时未转化提醒 | 24 小时 |
| `membership_expired` | 会员过期3天召回 | 3 天 |
| `campaign_start` | 活动开始前1小时通知 | 1 小时 |
| `order_completed` | 订单完成7天回访 | 7 天 |

需要立刻验证发送时，可以临时在规则中心把目标规则延迟改成 `0 minute`，再重新发送 mock 事件。

### 返回 EVENT_SOURCE_INVALID

说明 `x-event-app-id` 不存在或事件来源已停用。检查事件来源页面是否存在：

```text
demo_shop_app
```

### 返回 EVENT_SOURCE_SECRET_INVALID

说明 `x-event-secret` 不正确。seed 默认密钥是：

```text
demo_secret
```

如果你在页面重置过密钥，需要使用最新密钥。

### 返回 EVENT_DUPLICATED

说明 `eventId` 已经用过。Postman 中确认 body 里使用了：

```text
{{$timestamp}}
```

或者手动换一个新的 `eventId`。
