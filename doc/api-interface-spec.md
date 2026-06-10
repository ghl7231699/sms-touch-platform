# 短信触达平台 V1.0 API 接口文档

> 适用场景：短信触达平台前后端联调、测试验收、业务系统事件接入、短信发送链路验证。
>
> 本文档依据 `doc/短信触达平台 V1.0 产品需求文档.md`、`doc/backend-mvp-design.md` 和当前后端路由实现整理。接口状态分为：
>
> - `已实现`：当前代码已提供接口。
> - `规划中`：PRD 要求具备，但当前版本尚未实现。
>
> 当前已实现接口默认用于测试环境，短信 Provider 默认为 `mock`，不会真实触达手机号；切换到阿里云测试通道后仍必须通过白名单校验。

## 1. 环境配置

### 1.1 Base URL

本地开发环境：

```text
http://127.0.0.1:3100
```

接口统一前缀：

```text
/api
```

### 1.2 当前服务信息

| 配置项 | 当前值 | 中文说明 |
| --- | --- | --- |
| 运行端口 | `3100` | 后端 API 服务端口 |
| 默认 Provider | `mock` | 默认不真实发送短信 |
| 真实测试 Provider | `aliyun_dypns` | 阿里云号码认证服务测试通道 |
| 数据库 | PostgreSQL | 本地 Docker 容器数据库 |
| ORM | Prisma | 数据库 schema 与访问层 |
| 前端地址 | `http://127.0.0.1:5173` | Vite 开发环境地址 |

### 1.3 通用请求头

当前已实现接口暂未接入登录鉴权。后续接入账号体系后，登录后接口统一使用 Bearer Token：

```http
Authorization: Bearer {accessToken}
```

JSON 请求统一使用：

```http
Content-Type: application/json
```

### 1.4 HTTP 方法约定

平台接口统一只使用 `GET` 和 `POST`：

| 方法 | 使用场景 |
| --- | --- |
| `GET` | 查询列表、查询详情、健康检查、短链跳转 |
| `POST` | 新增、修改、启用、停用、审核、重试、取消、导入、导出、发送、回调等动作 |

不使用 `PATCH`、`PUT`、`DELETE`。删除、移除、停用等动作统一设计为 `POST /{resource}/{id}/remove`、`POST /{resource}/{id}/status` 或其他明确动作接口。

### 1.5 通用分页参数

列表接口使用 Query 参数分页。

| 参数 | 类型 | 必填 | 默认值 | 中文说明 |
| --- | --- | --- | --- | --- |
| `page` | number | 否 | `1` | 当前页码，从 1 开始 |
| `pageSize` | number | 否 | `20` | 每页数量，最大 100 |

分页响应结构：

```jsonc
{
  "items": [], // 当前页数据
  "total": 0, // 总条数
  "page": 1, // 当前页码
  "pageSize": 20 // 每页数量
}
```

### 1.6 通用状态枚举

短信发送状态：

| 状态 | 中文说明 |
| --- | --- |
| `success` | 发送成功或 Provider 接收成功 |
| `failed` | 发送失败 |
| `blocked` | 被安全策略拦截，例如不在白名单 |

任务状态：

| 状态 | 中文说明 |
| --- | --- |
| `pending` | 待发送 |
| `sending` | 发送中 |
| `success` | 发送成功 |
| `failed` | 发送失败，可按重试策略再次执行 |
| `blocked` | 被白名单等安全规则拦截 |
| `skipped` | 条件不满足，跳过发送 |
| `cancelled` | 人工取消，规划中 |

模板和规则状态：

| 状态 | 中文说明 |
| --- | --- |
| `enabled` | 启用 |
| `disabled` | 停用 |

业务事件类型：

| 事件类型 | 中文说明 |
| --- | --- |
| `user_register` | 用户注册 |
| `membership_expired` | 会员过期 |
| `campaign_start` | 活动开始 |
| `order_completed` | 订单完成 |

## 2. 健康检查

### 2.1 查询服务健康状态

接口状态：`已实现`

#### 接口信息

```http
GET /health
```

完整地址：

```text
GET http://127.0.0.1:3100/health
```

#### 请求参数

无 Query 参数，无 Body 参数。

#### 请求示例

```bash
curl -sS http://127.0.0.1:3100/health
```

#### 返回参数

| 字段 | 类型 | 中文说明 |
| --- | --- | --- |
| `status` | string | 服务状态，正常为 `ok` |
| `provider` | string | 当前短信 Provider |
| `whitelistCount` | number | 当前白名单手机号数量 |
| `taskWorker.enabled` | boolean | 内置任务 worker 是否启用 |
| `taskWorker.allowRealSend` | boolean | worker 是否允许真实 Provider 发送 |
| `taskWorker.intervalMs` | number | worker 扫描间隔，单位毫秒 |
| `taskWorker.running` | boolean | worker 当前是否正在执行 |
| `taskWorker.lastRunAt` | string/null | 最近一次执行时间 |
| `taskWorker.lastProcessed` | number | 最近一次处理任务数 |

#### 返回示例

```jsonc
{
  "status": "ok",
  "provider": "mock",
  "whitelistCount": 4,
  "taskWorker": {
    "enabled": false,
    "allowRealSend": false,
    "intervalMs": 60000,
    "running": false,
    "lastRunAt": null,
    "lastProcessed": 0
  }
}
```

## 3. 运营总览

### 3.1 查询运营总览

接口状态：`已实现`

#### 接口信息

```http
GET /api/dashboard
```

#### 请求参数

无 Query 参数，无 Body 参数。

#### 请求示例

```bash
curl -sS http://127.0.0.1:3100/api/dashboard
```

#### 返回参数

| 字段 | 类型 | 中文说明 |
| --- | --- | --- |
| `stats` | object | 总体统计指标 |
| `recentLogs` | array | 最近发送记录，最多 8 条 |
| `activeRules` | array | 启用规则，最多 6 条 |
| `templates` | array | 模板列表 |

#### 返回示例

```jsonc
{
  "stats": {
    "sendCount": 10,
    "successCount": 8,
    "failedCount": 1,
    "blockedCount": 1,
    "pendingTaskCount": 2,
    "clickCount": 3,
    "ctr": "37.5%"
  },
  "recentLogs": [],
  "activeRules": [],
  "templates": []
}
```

## 4. 短信模板

### 4.1 查询模板列表

接口状态：`已实现`

#### 接口信息

```http
GET /api/templates
```

兼容路径：

```http
GET /api/sms/templates
```

#### 请求参数

当前实现无 Query 参数。PRD 后续建议支持 `keyword`、`scene`、`status`、`auditStatus`、`createdAtStart`、`createdAtEnd`。

#### 请求示例

```bash
curl -sS http://127.0.0.1:3100/api/templates
```

#### 返回参数

| 字段 | 类型 | 中文说明 |
| --- | --- | --- |
| `items` | array | 模板列表 |
| `items[].id` | string | 模板 ID |
| `items[].name` | string | 模板名称 |
| `items[].scene` | string | 业务场景 |
| `items[].providerTemplateId` | string | 服务商模板 Code |
| `items[].content` | string | 模板内容 |
| `items[].variables` | array | 模板变量 |
| `items[].status` | string | 模板状态：`enabled`、`disabled` |
| `items[].createdAt` | string | 创建时间 |
| `items[].updatedAt` | string | 更新时间 |

#### 返回示例

```jsonc
{
  "items": [
    {
      "id": "tpl_xxx",
      "name": "注册验证码",
      "scene": "register_conversion",
      "providerTemplateId": "100001",
      "content": "您的测试验证码为${code}，${min}分钟内有效。",
      "variables": ["code", "min"],
      "status": "enabled",
      "createdAt": "2026-06-08T10:00:00.000Z",
      "updatedAt": "2026-06-08T10:00:00.000Z"
    }
  ]
}
```

### 4.2 创建模板

接口状态：`已实现`

#### 接口信息

```http
POST /api/templates
```

兼容路径：

```http
POST /api/sms/templates
```

#### 请求头

| Header | 必填 | 示例 | 中文说明 |
| --- | --- | --- | --- |
| `Content-Type` | 是 | `application/json` | 请求体格式 |

#### 请求参数

| 字段 | 类型 | 必填 | 中文说明 |
| --- | --- | --- | --- |
| `name` | string | 是 | 模板名称 |
| `scene` | string | 是 | 业务场景 |
| `providerTemplateId` | string | 否 | 服务商模板 Code；不传则使用环境变量默认模板 |
| `content` | string | 否 | 模板内容 |
| `variables` | array | 否 | 模板变量，例如 `["code", "min"]` |
| `status` | string | 否 | 模板状态，默认 `enabled` |

#### 请求示例

```bash
curl -sS http://127.0.0.1:3100/api/templates \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "会员召回验证码",
    "scene": "membership_recall",
    "providerTemplateId": "100001",
    "content": "您的验证码为${code}，${min}分钟内有效。",
    "variables": ["code", "min"],
    "status": "enabled"
  }'
```

#### 成功返回参数

| 字段 | 类型 | 中文说明 |
| --- | --- | --- |
| `success` | boolean | 是否成功 |
| `item` | object | 创建后的模板对象 |

#### 成功返回示例

```jsonc
{
  "success": true,
  "item": {
    "id": "tpl_xxx",
    "name": "会员召回验证码",
    "scene": "membership_recall",
    "providerTemplateId": "100001",
    "content": "您的验证码为${code}，${min}分钟内有效。",
    "variables": ["code", "min"],
    "status": "enabled"
  }
}
```

#### 错误码

| 错误码 | HTTP 状态码 | 中文说明 |
| --- | --- | --- |
| `TEMPLATE_NAME_REQUIRED` | 400 | 模板名称为空 |
| `TEMPLATE_SCENE_REQUIRED` | 400 | 业务场景为空 |

### 4.3 更新模板状态

接口状态：`已实现`

#### 接口信息

```http
POST /api/templates/{templateId}/status
```

兼容路径：

```http
POST /api/sms/templates/{templateId}/status
```

#### 请求参数

路径参数：

| 参数 | 类型 | 必填 | 中文说明 |
| --- | --- | --- | --- |
| `templateId` | string | 是 | 模板 ID |

Body 参数：

| 字段 | 类型 | 必填 | 中文说明 |
| --- | --- | --- | --- |
| `status` | string | 是 | `enabled` 或 `disabled` |

#### 请求示例

```bash
curl -sS -X POST http://127.0.0.1:3100/api/templates/tpl_xxx/status \
  -H 'Content-Type: application/json' \
  -d '{"status":"disabled"}'
```

#### 返回示例

```jsonc
{
  "success": true,
  "item": {
    "id": "tpl_xxx",
    "status": "disabled"
  }
}
```

#### 错误码

| 错误码 | HTTP 状态码 | 中文说明 |
| --- | --- | --- |
| `TEMPLATE_NOT_FOUND` | 404 | 模板不存在 |

## 5. 规则中心

### 5.1 查询规则列表

接口状态：`已实现`

#### 接口信息

```http
GET /api/rules
```

兼容路径：

```http
GET /api/sms/rules
```

#### 请求参数

当前实现无 Query 参数。PRD 后续建议支持 `keyword`、`scene`、`eventType`、`status`、`createdAtStart`、`createdAtEnd`。

#### 请求示例

```bash
curl -sS http://127.0.0.1:3100/api/rules
```

#### 返回参数

| 字段 | 类型 | 中文说明 |
| --- | --- | --- |
| `items` | array | 规则列表 |
| `items[].id` | string | 规则 ID |
| `items[].name` | string | 规则名称 |
| `items[].code` | string | 规则编码 |
| `items[].scene` | string | 业务场景 |
| `items[].eventType` | string | 触发事件类型 |
| `items[].delayValue` | number | 延迟数值 |
| `items[].delayUnit` | string | 延迟单位 |
| `items[].conditionType` | string | 条件类型 |
| `items[].conditionConfig` | object | 条件配置 |
| `items[].templateId` | string | 关联模板 ID |
| `items[].status` | string | 规则状态 |
| `items[].createdAt` | string | 创建时间 |
| `items[].updatedAt` | string | 更新时间 |

### 5.2 创建规则

接口状态：`已实现`

#### 接口信息

```http
POST /api/rules
```

兼容路径：

```http
POST /api/sms/rules
```

#### 请求参数

| 字段 | 类型 | 必填 | 中文说明 |
| --- | --- | --- | --- |
| `name` | string | 是 | 规则名称 |
| `code` | string | 否 | 规则编码；不传则系统生成 |
| `scene` | string | 否 | 业务场景；不传则取模板场景 |
| `eventType` | string | 是 | 触发事件类型 |
| `delayValue` | number | 否 | 延迟数值，默认 0 |
| `delayUnit` | string | 否 | 延迟单位，默认 `hour` |
| `conditionType` | string | 否 | 条件类型，默认 `none` |
| `conditionConfig` | object | 否 | 条件配置 |
| `templateId` | string | 是 | 关联模板 ID |
| `status` | string | 否 | 规则状态，默认 `enabled` |

#### 请求示例

```bash
curl -sS http://127.0.0.1:3100/api/rules \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "注册后立即发送验证码",
    "eventType": "user_register",
    "delayValue": 0,
    "delayUnit": "minute",
    "conditionType": "none",
    "templateId": "tpl_xxx",
    "status": "enabled"
  }'
```

#### 返回示例

```jsonc
{
  "success": true,
  "item": {
    "id": "rule_xxx",
    "name": "注册后立即发送验证码",
    "code": "rule_1780912800000",
    "scene": "register_conversion",
    "eventType": "user_register",
    "delayValue": 0,
    "delayUnit": "minute",
    "conditionType": "none",
    "conditionConfig": {
      "type": "none"
    },
    "templateId": "tpl_xxx",
    "status": "enabled"
  }
}
```

#### 错误码

| 错误码 | HTTP 状态码 | 中文说明 |
| --- | --- | --- |
| `RULE_NAME_REQUIRED` | 400 | 规则名称为空 |
| `EVENT_TYPE_INVALID` | 400 | 事件类型非法 |
| `TEMPLATE_NOT_FOUND` | 404 | 关联模板不存在 |

### 5.3 更新规则状态

接口状态：`已实现`

#### 接口信息

```http
POST /api/rules/{ruleId}/status
```

兼容路径：

```http
POST /api/sms/rules/{ruleId}/status
```

#### 请求参数

路径参数：

| 参数 | 类型 | 必填 | 中文说明 |
| --- | --- | --- | --- |
| `ruleId` | string | 是 | 规则 ID |

Body 参数：

| 字段 | 类型 | 必填 | 中文说明 |
| --- | --- | --- | --- |
| `status` | string | 是 | `enabled` 或 `disabled` |

#### 请求示例

```bash
curl -sS -X POST http://127.0.0.1:3100/api/rules/rule_xxx/status \
  -H 'Content-Type: application/json' \
  -d '{"status":"disabled"}'
```

#### 错误码

| 错误码 | HTTP 状态码 | 中文说明 |
| --- | --- | --- |
| `RULE_NOT_FOUND` | 404 | 规则不存在 |

## 6. 手动发送

### 6.1 手动发送短信

接口状态：`已实现`

#### 接口信息

```http
POST /api/manual-send
```

兼容路径：

```http
POST /api/sms/manual-send
```

#### 请求参数

| 字段 | 类型 | 必填 | 中文说明 |
| --- | --- | --- | --- |
| `phone` | string | 是 | 手机号，当前仅支持单手机号 |
| `templateId` | string | 是 | 已启用模板 ID |
| `templateParam` | object | 否 | 模板变量，例如 `{ "code": "##code##", "min": "5" }` |
| `variables` | object | 否 | `templateParam` 的兼容字段 |

#### 请求示例

```bash
curl -sS http://127.0.0.1:3100/api/manual-send \
  -H 'Content-Type: application/json' \
  -d '{
    "phone": "18515385071",
    "templateId": "tpl_xxx",
    "templateParam": {
      "code": "##code##",
      "min": "5"
    }
  }'
```

#### 成功返回参数

| 字段 | 类型 | 中文说明 |
| --- | --- | --- |
| `success` | boolean | 是否发送成功 |
| `status` | string | 发送状态 |
| `provider` | string | 当前 Provider |
| `logId` | string | 发送日志 ID |
| `phoneMasked` | string | 脱敏手机号 |
| `templateId` | string | 模板 ID |
| `ruleId` | string/null | 关联规则 ID，手动发送为空 |
| `eventId` | string/null | 关联事件 ID，手动发送为空 |
| `code` | string | Provider 或本地返回码 |
| `message` | string | Provider 或本地返回信息 |
| `bizId` | string/null | 服务商业务 ID |
| `requestId` | string/null | 服务商请求 ID |
| `shortUrl` | string/null | 发送成功时生成的短链 |
| `receiptStatus` | string/null | 回执状态 |

#### 成功返回示例

```jsonc
{
  "success": true,
  "status": "success",
  "provider": "mock",
  "logId": "log_xxx",
  "phoneMasked": "185****5071",
  "templateId": "tpl_xxx",
  "code": "OK",
  "message": "OK",
  "shortUrl": "http://127.0.0.1:3100/s/abc123",
  "receiptStatus": "submitted"
}
```

#### 非白名单返回示例

```jsonc
{
  "success": false,
  "status": "blocked",
  "provider": "aliyun_dypns",
  "logId": "log_xxx",
  "phoneMasked": "199****0000",
  "code": "PHONE_NOT_IN_WHITELIST",
  "message": "Phone number is not allowed in test mode."
}
```

#### 错误码

| 错误码 | HTTP 状态码 | 中文说明 |
| --- | --- | --- |
| `TEMPLATE_NOT_FOUND` | 404 | 模板不存在 |
| `TEMPLATE_DISABLED` | 409 | 模板已停用 |
| `PHONE_REQUIRED` | 400 | 手机号为空 |
| `PHONE_INVALID` | 400 | 手机号格式非法 |
| `PHONE_NOT_IN_WHITELIST` | 403 | 手机号不在测试白名单 |
| `SMS_PROVIDER_INVALID` | 400/500 | Provider 配置非法 |
| `ALIYUN_CONFIG_MISSING` | 500 | 阿里云配置缺失 |
| `SMS_SEND_FAILED` | 502 | 短信发送失败 |

## 7. 测试验证码发送

### 7.1 发送测试验证码

接口状态：`已实现`

#### 接口信息

```http
POST /api/sms/send-test-code
```

#### 请求参数

| 字段 | 类型 | 必填 | 中文说明 |
| --- | --- | --- | --- |
| `phone` | string | 是 | 测试手机号 |
| `templateCode` | string | 否 | 服务商模板 Code，例如 `100001` |
| `templateParam` | object | 否 | 模板参数 |
| `variables` | object | 否 | `templateParam` 的兼容字段 |

#### 请求示例

```bash
curl -sS http://127.0.0.1:3100/api/sms/send-test-code \
  -H 'Content-Type: application/json' \
  -d '{
    "phone": "18515385071",
    "templateCode": "100001",
    "templateParam": {
      "code": "##code##",
      "min": "5"
    }
  }'
```

#### 返回示例

```jsonc
{
  "success": true,
  "status": "success",
  "provider": "mock",
  "logId": "log_xxx",
  "phoneMasked": "185****5071",
  "code": "OK",
  "message": "OK"
}
```

## 8. 事件触发

### 8.1 上报业务事件

接口状态：`已实现`

#### 接口信息

```http
POST /api/events
```

兼容路径：

```http
POST /api/sms/events
```

#### 请求参数

| 字段 | 类型 | 必填 | 中文说明 |
| --- | --- | --- | --- |
| `eventId` | string | 建议必填 | 业务事件唯一标识；不传则系统生成 |
| `eventType` | string | 是 | 事件类型 |
| `occurredAt` | string | 否 | 事件发生时间；不传则使用当前时间 |
| `userId` | string | 否 | 业务用户 ID |
| `phone` | string | 是 | 触达手机号；也可放在 `payload.phone` |
| `payload` | object | 否 | 业务扩展字段 |
| `templateParam` | object | 否 | 模板变量 |
| `variables` | object | 否 | `templateParam` 的兼容字段 |

#### 请求示例

```bash
curl -sS http://127.0.0.1:3100/api/events \
  -H 'Content-Type: application/json' \
  -d '{
    "eventId": "user_register_10086_20260608103000",
    "eventType": "user_register",
    "occurredAt": "2026-06-08T10:30:00+08:00",
    "userId": "10086",
    "phone": "18515385071",
    "payload": {
      "source": "operator-console"
    },
    "templateParam": {
      "code": "##code##",
      "min": "5"
    }
  }'
```

#### 成功返回参数

| 字段 | 类型 | 中文说明 |
| --- | --- | --- |
| `success` | boolean | 是否成功 |
| `event` | object | 保存后的事件 |
| `matchedRuleCount` | number | 命中的启用规则数量 |
| `queuedTaskCount` | number | 生成的任务数量 |
| `queuedTasks` | array | 生成的任务列表，手机号和模板参数已脱敏 |
| `processedTasks` | object | 本次同步执行到期任务的结果 |

#### 成功返回示例

```jsonc
{
  "success": true,
  "event": {
    "id": "evt_internal_xxx",
    "eventId": "user_register_10086_20260608103000",
    "eventType": "user_register",
    "userId": "10086",
    "phone": "18515385071",
    "payload": {
      "source": "operator-console"
    },
    "occurredAt": "2026-06-08T10:30:00+08:00"
  },
  "matchedRuleCount": 1,
  "queuedTaskCount": 1,
  "queuedTasks": [],
  "processedTasks": {
    "success": true,
    "processed": 1,
    "results": []
  }
}
```

#### 错误码

| 错误码 | HTTP 状态码 | 中文说明 |
| --- | --- | --- |
| `EVENT_TYPE_INVALID` | 400 | 事件类型非法 |
| `EVENT_DUPLICATED` | 409 | 事件 ID 已存在，幂等拦截 |

### 8.2 查询事件流水

接口状态：`已实现`

#### 接口信息

```http
GET /api/events
```

兼容路径：

```http
GET /api/sms/events
```

#### Query 参数

| 参数 | 类型 | 必填 | 中文说明 |
| --- | --- | --- | --- |
| `eventType` | string | 否 | 按事件类型筛选 |
| `page` | number | 否 | 当前页码 |
| `pageSize` | number | 否 | 每页数量 |

#### 请求示例

```bash
curl -sS 'http://127.0.0.1:3100/api/events?eventType=user_register&page=1&pageSize=20'
```

## 9. 任务队列

### 9.1 查询任务列表

接口状态：`已实现`

#### 接口信息

```http
GET /api/tasks
```

兼容路径：

```http
GET /api/sms/tasks
```

#### Query 参数

| 参数 | 类型 | 必填 | 中文说明 |
| --- | --- | --- | --- |
| `status` | string | 否 | 按任务状态筛选 |
| `triggerType` | string | 否 | `manual` 或 `auto` |
| `eventType` | string | 否 | 按事件类型筛选 |
| `page` | number | 否 | 当前页码 |
| `pageSize` | number | 否 | 每页数量 |

#### 请求示例

```bash
curl -sS 'http://127.0.0.1:3100/api/tasks?status=pending&page=1&pageSize=20'
```

#### 返回参数

| 字段 | 类型 | 中文说明 |
| --- | --- | --- |
| `items` | array | 任务列表，原始手机号和模板敏感参数不返回 |
| `items[].id` | string | 任务 ID |
| `items[].taskType` | string | 任务类型：`manual`、`auto` |
| `items[].status` | string | 任务状态 |
| `items[].triggerType` | string | 触发方式 |
| `items[].scene` | string | 业务场景 |
| `items[].phoneMasked` | string | 脱敏手机号 |
| `items[].templateId` | string | 模板 ID |
| `items[].templateName` | string | 模板名称 |
| `items[].templateCode` | string | 模板 Code |
| `items[].ruleId` | string/null | 规则 ID |
| `items[].eventId` | string/null | 事件 ID |
| `items[].scheduledAt` | string | 计划发送时间 |
| `items[].sentAt` | string/null | 实际发送时间 |
| `items[].attemptCount` | number | 已尝试次数 |
| `items[].maxAttempts` | number | 最大尝试次数 |
| `items[].conditionResult` | string/null | 条件校验结果 |
| `items[].lastErrorCode` | string/null | 最近错误码 |
| `items[].lastErrorMessage` | string/null | 最近错误信息 |
| `total` | number | 总条数 |
| `page` | number | 当前页码 |
| `pageSize` | number | 每页数量 |

### 9.2 执行到期任务

接口状态：`已实现`

#### 接口信息

```http
POST /api/tasks/run-due
```

兼容路径：

```http
POST /api/sms/tasks/run-due
```

#### 请求参数

| 字段 | 类型 | 必填 | 默认值 | 中文说明 |
| --- | --- | --- | --- | --- |
| `limit` | number | 否 | `20` | 本次最多处理任务数，最大 100 |

#### 请求示例

```bash
curl -sS http://127.0.0.1:3100/api/tasks/run-due \
  -H 'Content-Type: application/json' \
  -d '{"limit":20}'
```

#### 返回参数

| 字段 | 类型 | 中文说明 |
| --- | --- | --- |
| `success` | boolean | 是否执行成功 |
| `processed` | number | 本次处理任务数量 |
| `results` | array | 每个任务的执行结果 |

#### 返回示例

```jsonc
{
  "success": true,
  "processed": 1,
  "results": [
    {
      "success": true,
      "task": {
        "id": "task_xxx",
        "status": "success",
        "phoneMasked": "185****5071",
        "logId": "log_xxx"
      },
      "result": {
        "success": true,
        "status": "success",
        "provider": "mock",
        "logId": "log_xxx"
      }
    }
  ]
}
```

## 10. 发送记录

### 10.1 查询发送日志

接口状态：`已实现`

#### 接口信息

```http
GET /api/send-logs
```

兼容路径：

```http
GET /api/sms/send-logs
```

#### Query 参数

| 参数 | 类型 | 必填 | 中文说明 |
| --- | --- | --- | --- |
| `phone` | string | 否 | 原始手机号精确查询 |
| `status` | string | 否 | `success`、`failed`、`blocked` |
| `provider` | string | 否 | `mock`、`aliyun_dypns` |
| `triggerType` | string | 否 | `manual`、`auto` |
| `page` | number | 否 | 当前页码 |
| `pageSize` | number | 否 | 每页数量 |

#### 请求示例

```bash
curl -sS 'http://127.0.0.1:3100/api/send-logs?status=success&page=1&pageSize=20'
```

#### 返回参数

| 字段 | 类型 | 中文说明 |
| --- | --- | --- |
| `items` | array | 发送日志列表，原始手机号、模板敏感参数和原始响应不返回 |
| `items[].id` | string | 日志 ID |
| `items[].provider` | string | Provider |
| `items[].triggerType` | string | 触发方式 |
| `items[].scene` | string | 业务场景 |
| `items[].phoneMasked` | string | 脱敏手机号 |
| `items[].templateId` | string/null | 模板 ID |
| `items[].templateName` | string/null | 模板名称 |
| `items[].templateCode` | string | 模板 Code |
| `items[].ruleId` | string/null | 规则 ID |
| `items[].eventId` | string/null | 事件 ID |
| `items[].status` | string | 发送状态 |
| `items[].receiptStatus` | string/null | 回执状态 |
| `items[].code` | string/null | 返回码 |
| `items[].message` | string/null | 返回信息 |
| `items[].bizId` | string/null | 服务商业务 ID |
| `items[].requestId` | string/null | 服务商请求 ID |
| `items[].shortUrl` | string/null | 短链 |
| `items[].clickCount` | number | 点击次数 |
| `items[].lastClickedAt` | string/null | 最近点击时间 |
| `items[].createdAt` | string | 创建时间 |
| `total` | number | 总条数 |
| `page` | number | 当前页码 |
| `pageSize` | number | 每页数量 |

#### 返回示例

```jsonc
{
  "items": [
    {
      "id": "log_xxx",
      "provider": "mock",
      "triggerType": "manual",
      "scene": "membership_recall",
      "phoneMasked": "185****5071",
      "templateCode": "100001",
      "status": "success",
      "receiptStatus": "submitted",
      "code": "OK",
      "message": "OK",
      "shortUrl": "http://127.0.0.1:3100/s/abc123",
      "clickCount": 0,
      "createdAt": "2026-06-08T10:00:00.000Z"
    }
  ],
  "total": 1,
  "page": 1,
  "pageSize": 20
}
```

## 11. 回执与短链点击

### 11.1 接收服务商回调

接口状态：`已实现`

#### 接口信息

```http
POST /api/sms/provider/callback
```

兼容路径：

```http
POST /api/provider/callback
POST /api/provider-callback/{provider}
```

#### 请求参数

| 字段 | 类型 | 必填 | 中文说明 |
| --- | --- | --- | --- |
| `bizId` | string | 否 | 服务商业务 ID，兼容 `BizId` |
| `requestId` | string | 否 | 服务商请求 ID，兼容 `RequestId` |
| `receiptStatus` | string | 否 | 回执状态，兼容 `status`、`receipt_status` |
| 其他字段 | any | 否 | 服务商原始回调内容，会进入 `raw` |

`bizId` 和 `requestId` 至少传一个。

#### 请求示例

```bash
curl -sS http://127.0.0.1:3100/api/sms/provider/callback \
  -H 'Content-Type: application/json' \
  -d '{
    "bizId": "biz_xxx",
    "requestId": "req_xxx",
    "receiptStatus": "delivered"
  }'
```

#### 返回示例

```jsonc
{
  "success": true,
  "item": {
    "id": "receipt_xxx",
    "logId": "log_xxx",
    "bizId": "biz_xxx",
    "requestId": "req_xxx",
    "receiptStatus": "delivered",
    "raw": {
      "bizId": "biz_xxx",
      "receiptStatus": "delivered"
    },
    "createdAt": "2026-06-08T10:00:00.000Z"
  },
  "log": {
    "id": "log_xxx",
    "status": "success",
    "receiptStatus": "delivered"
  }
}
```

#### 错误码

| 错误码 | HTTP 状态码 | 中文说明 |
| --- | --- | --- |
| `RECEIPT_ID_REQUIRED` | 400 | `bizId` 和 `requestId` 均为空 |

### 11.2 查询回执列表

接口状态：`已实现`

#### 接口信息

```http
GET /api/receipts
```

#### Query 参数

| 参数 | 类型 | 必填 | 中文说明 |
| --- | --- | --- | --- |
| `receiptStatus` | string | 否 | 按回执状态筛选 |
| `page` | number | 否 | 当前页码 |
| `pageSize` | number | 否 | 每页数量 |

#### 请求示例

```bash
curl -sS 'http://127.0.0.1:3100/api/receipts?receiptStatus=delivered&page=1&pageSize=20'
```

### 11.3 短链跳转并记录点击

接口状态：`已实现`

#### 接口信息

```http
GET /s/{shortCode}
```

#### 请求参数

路径参数：

| 参数 | 类型 | 必填 | 中文说明 |
| --- | --- | --- | --- |
| `shortCode` | string | 是 | 短链编码 |

#### 请求示例

```bash
curl -i http://127.0.0.1:3100/s/abc123
```

#### 成功响应

成功时返回 `302`，`Location` 为配置的落地页地址，并记录点击日志。

#### 错误码

| 错误码 | HTTP 状态码 | 中文说明 |
| --- | --- | --- |
| `SHORT_LINK_NOT_FOUND` | 404 | 短链不存在 |

### 11.4 查询点击日志

接口状态：`已实现`

#### 接口信息

```http
GET /api/click-logs
```

#### Query 参数

| 参数 | 类型 | 必填 | 中文说明 |
| --- | --- | --- | --- |
| `shortCode` | string | 否 | 按短链编码筛选 |
| `page` | number | 否 | 当前页码 |
| `pageSize` | number | 否 | 每页数量 |

#### 请求示例

```bash
curl -sS 'http://127.0.0.1:3100/api/click-logs?shortCode=abc123&page=1&pageSize=20'
```

## 12. 统计分析

### 12.1 查询统计概览

接口状态：`已实现`

#### 接口信息

```http
GET /api/stats/overview
```

兼容路径：

```http
GET /api/stats
GET /api/sms/stats/overview
GET /api/sms/stats
```

#### 请求参数

当前实现无 Query 参数。PRD 后续建议支持 `dateStart`、`dateEnd`、`scene`、`templateId`、`ruleId`、`provider`。

#### 请求示例

```bash
curl -sS http://127.0.0.1:3100/api/stats/overview
```

#### 返回参数

| 字段 | 类型 | 中文说明 |
| --- | --- | --- |
| `sendCount` | number | 发送量，不含 blocked |
| `successCount` | number | 成功量 |
| `failedCount` | number | 失败量 |
| `blockedCount` | number | 拦截量 |
| `templateCount` | number | 模板总数 |
| `enabledTemplateCount` | number | 启用模板数 |
| `ruleCount` | number | 规则总数 |
| `enabledRuleCount` | number | 启用规则数 |
| `eventCount` | number | 事件数 |
| `taskCount` | number | 任务总数 |
| `pendingTaskCount` | number | 待发送任务数 |
| `dueTaskCount` | number | 已到期待处理任务数 |
| `clickCount` | number | 点击次数 |
| `clickUserCount` | number | 点击用户数或去重点击标识数 |
| `receiptCount` | number | 回执数量 |
| `ctr` | string | 点击率 |
| `providers` | object | 按 Provider 聚合 |
| `scenes` | object | 按业务场景聚合 |

#### 返回示例

```jsonc
{
  "sendCount": 10,
  "successCount": 8,
  "failedCount": 1,
  "blockedCount": 1,
  "templateCount": 3,
  "enabledTemplateCount": 2,
  "ruleCount": 4,
  "enabledRuleCount": 3,
  "eventCount": 6,
  "taskCount": 5,
  "pendingTaskCount": 1,
  "dueTaskCount": 0,
  "clickCount": 2,
  "clickUserCount": 2,
  "receiptCount": 1,
  "ctr": "25.0%",
  "providers": {
    "mock": 10
  },
  "scenes": {
    "membership_recall": 4
  }
}
```

## 13. 登录与账号接口

接口状态：`规划中`

PRD 要求 V1.0 具备完整登录与账号闭环。当前后端尚未实现，建议接口如下。

### 13.1 登录

```http
POST /api/auth/login
```

请求参数：

| 字段 | 类型 | 必填 | 中文说明 |
| --- | --- | --- | --- |
| `account` | string | 是 | 登录账号、邮箱或手机号 |
| `password` | string | 是 | 登录密码 |
| `captchaId` | string | 否 | 图形验证码 ID，触发风控时必填 |
| `captchaCode` | string | 否 | 图形验证码 |
| `rememberAccount` | boolean | 否 | 是否记住账号 |

返回参数：

| 字段 | 类型 | 中文说明 |
| --- | --- | --- |
| `accessToken` | string | 登录令牌 |
| `expiresIn` | number | 过期秒数 |
| `user` | object | 当前用户信息 |
| `permissions` | array | 当前用户权限码 |
| `forceResetPassword` | boolean | 是否强制重置密码 |

### 13.2 查询当前用户

```http
GET /api/auth/me
```

返回当前用户、角色、菜单权限和按钮权限。

### 13.3 退出登录

```http
POST /api/auth/logout
```

清除当前会话，前端同步清除本地 token。

### 13.4 注册申请

```http
POST /api/auth/register-request
GET /api/auth/register-requests
GET /api/auth/register-requests/{applicationId}
POST /api/auth/register-requests/{applicationId}/approve
POST /api/auth/register-requests/{applicationId}/reject
```

用于用户提交注册申请、管理员审核通过或驳回。

### 13.5 忘记密码和重置密码

```http
POST /api/auth/forgot-password/send-code
POST /api/auth/forgot-password/verify-code
POST /api/auth/reset-password
POST /api/auth/change-password
```

用于验证码发送、验证码校验、自助重置密码和登录后修改密码。

## 14. 用户与角色接口

接口状态：`规划中`

### 14.1 用户管理

```http
GET /api/users
POST /api/users
GET /api/users/{userId}
POST /api/users/{userId}/update
POST /api/users/{userId}/status
POST /api/users/{userId}/reset-password
```

建议查询参数：

| 参数 | 类型 | 中文说明 |
| --- | --- | --- |
| `keyword` | string | 按姓名、账号、邮箱、手机号模糊查询 |
| `role` | string | 按角色筛选 |
| `status` | string | 按账号状态筛选 |
| `createdAtStart` | string | 创建开始时间 |
| `createdAtEnd` | string | 创建结束时间 |
| `page` | number | 页码 |
| `pageSize` | number | 每页数量 |

### 14.2 角色管理

```http
GET /api/roles
GET /api/roles/{roleCode}
```

V1.0 仅支持内置角色：`admin`、`operator`、`viewer`，不提供新增、编辑、删除角色接口。

## 15. 黑名单、退订与频控接口

接口状态：`规划中`

### 15.1 黑名单

```http
GET /api/blacklist
POST /api/blacklist
POST /api/blacklist/import
GET /api/blacklist/{blacklistId}
POST /api/blacklist/{blacklistId}/update
POST /api/blacklist/{blacklistId}/status
POST /api/blacklist/{blacklistId}/remove
```

核心规则：

- 黑名单生效后，手动发送和自动任务都必须拦截。
- 添加、编辑、移除、导入黑名单必须写入操作日志。
- 列表展示手机号必须脱敏。

`POST /api/blacklist/{blacklistId}/update` 请求体：

| 字段 | 类型 | 必填 | 中文说明 |
| --- | --- | --- | --- |
| `scene` | string | 否 | 适用场景，空值表示全局 |
| `reason` | string | 否 | 拉黑原因 |
| `source` | string | 否 | 来源，例如 `manual`、`complaint`、`import` |

### 15.2 退订

```http
GET /api/unsubscribes
POST /api/unsubscribes
POST /api/unsubscribes/import
GET /api/unsubscribes/{unsubscribeId}
POST /api/unsubscribes/{unsubscribeId}/update
POST /api/unsubscribes/{unsubscribeId}/status
```

核心规则：

- 全局退订用户不再接收任何营销短信。
- 指定场景退订用户不再接收对应场景短信。
- 退订记录不可物理删除。

`POST /api/unsubscribes/{unsubscribeId}/update` 请求体：

| 字段 | 类型 | 必填 | 中文说明 |
| --- | --- | --- | --- |
| `scene` | string | 否 | 退订场景，空值表示全局退订 |
| `source` | string | 否 | 退订来源，例如 `manual`、`provider`、`import` |
| `remark` | string | 否 | 备注 |

### 15.3 频控配置

```http
GET /api/frequency-policies
POST /api/frequency-policies/{policyId}/update
```

建议支持日频控、周频控、同场景冷却、同规则冷却、安静时段。

## 16. 发送控制接口

接口状态：`规划中`

### 16.1 发送配置

```http
GET /api/settings
POST /api/settings/update
POST /api/settings/provider/test
GET /api/worker/status
POST /api/worker/run-once
```

建议配置字段：

| 字段 | 中文说明 |
| --- | --- |
| `provider` | 当前 Provider |
| `workerEnabled` | worker 是否开启 |
| `workerIntervalMs` | worker 扫描间隔 |
| `workerAllowRealSend` | worker 是否允许真实发送 |
| `shortLinkBaseUrl` | 短链域名 |
| `shortLinkDefaultTarget` | 短链默认落地页 |

### 16.1.1 Provider 配置自检

```http
POST /api/settings/provider/test
```

用于在发送控制页验证当前短信 Provider 配置是否满足运行条件。该接口默认不发送短信，只做配置和 SDK 可用性自检，避免误耗测试手机号。

请求体：

| 字段 | 类型 | 必填 | 中文说明 |
| --- | --- | --- | --- |
| `provider` | string | 否 | 待测试 Provider，默认使用当前配置 |
| `checkSdk` | boolean | 否 | 是否额外尝试初始化 SDK 客户端 |

响应核心字段：

| 字段 | 中文说明 |
| --- | --- |
| `success` | 自检是否通过 |
| `provider` | 实际测试的 Provider |
| `mode` | `dry_run`，表示未发送短信 |
| `checks` | 配置项、SDK 初始化等检查结果 |

### 16.1.2 Worker 运行态

```http
GET /api/worker/status
POST /api/worker/run-once
```

`GET /api/worker/status` 用于查看当前进程内置 worker 的运行态，包括是否启用、是否正在执行、扫描间隔、批次大小、最近执行时间、最近处理数量和最近错误。

`POST /api/worker/run-once` 用于从发送控制台手动触发一次到期任务扫描。该接口只提供控制面入口，不改变任务筛选、发送和状态流转规则；具体任务执行逻辑仍由触达主链路负责。

### 16.2 白名单管理

```http
GET /api/whitelist
POST /api/whitelist
POST /api/whitelist/{whitelistId}/update
POST /api/whitelist/{whitelistId}/status
POST /api/whitelist/export
```

核心规则：

- 真实 Provider 下所有发送前必须校验白名单。
- 同一手机号只允许一条有效白名单记录。
- 新增、启用、停用、导出白名单必须写入操作日志。

### 16.3 事件来源管理

```http
GET /api/event-sources
POST /api/event-sources
GET /api/event-sources/{sourceId}
POST /api/event-sources/{sourceId}/update
POST /api/event-sources/{sourceId}/status
POST /api/event-sources/{sourceId}/reset-secret
GET /api/event-sources/{sourceId}/logs
GET /api/event-sources/{sourceId}/stats
GET /api/event-source-logs
GET /api/event-source-logs/{logId}
```

核心规则：

- 来源系统停用后，事件上报必须拒绝。
- `secret` 创建或重置后只展示一次。
- 事件接入成功、失败、重复和签名失败都必须记录接入日志。

`GET /api/event-sources/{sourceId}/logs` 建议查询参数：

| 参数 | 中文说明 |
| --- | --- |
| `status` | 接入状态 |
| `eventType` | 事件类型 |
| `eventId` | 事件 ID |
| `dateFrom` | 开始时间 |
| `dateTo` | 结束时间 |
| `page` | 页码 |
| `pageSize` | 每页数量 |

`GET /api/event-sources/{sourceId}/stats` 返回该来源的接入总量、成功数、失败数、最近 24 小时接入量、失败率和最近一条接入日志。

## 17. 审批、操作日志与导出接口

接口状态：`规划中`

### 17.1 操作日志

```http
GET /api/operation-logs
GET /api/operation-logs/{logId}
```

建议查询参数：

| 参数 | 中文说明 |
| --- | --- |
| `operatorKeyword` | 操作人姓名或账号 |
| `module` | 操作模块 |
| `action` | 操作类型 |
| `targetKeyword` | 操作对象 ID 或名称 |
| `result` | 操作结果 |
| `operatedAtStart` | 操作开始时间 |
| `operatedAtEnd` | 操作结束时间 |

### 17.2 审批记录

```http
GET /api/approvals
POST /api/approvals
GET /api/approvals/{approvalId}
POST /api/approvals/{approvalId}/approve
POST /api/approvals/{approvalId}/reject
POST /api/approvals/{approvalId}/withdraw
```

用于高风险操作，例如真实 Provider 切换、真实 worker 开启、高风险规则启用等。

操作日志导出统一通过 `/api/export-tasks` 创建导出任务，导出对象传 `operation_logs`。

### 17.3 数据导出

```http
GET /api/export-tasks
POST /api/export-tasks
GET /api/export-tasks/{exportId}
GET /api/export-tasks/{exportId}/download
```

建议导出对象：

- 任务列表
- 发送记录
- 黑名单
- 退订记录
- 操作日志
- 审批记录

## 18. 错误响应规范

接口失败时统一返回：

```jsonc
{
  "success": false,
  "code": "PHONE_INVALID",
  "message": "Phone format is invalid."
}
```

### 18.1 当前已实现错误码

| 错误码 | HTTP 状态码 | 中文说明 |
| --- | --- | --- |
| `BAD_REQUEST` | 400 | 请求体 JSON 非法或请求参数非法 |
| `PHONE_REQUIRED` | 400 | 手机号为空 |
| `PHONE_INVALID` | 400 | 手机号格式非法 |
| `PHONE_NOT_IN_WHITELIST` | 403 | 手机号不在测试白名单 |
| `TEMPLATE_NAME_REQUIRED` | 400 | 模板名称为空 |
| `TEMPLATE_SCENE_REQUIRED` | 400 | 模板场景为空 |
| `TEMPLATE_NOT_FOUND` | 404 | 模板不存在 |
| `TEMPLATE_DISABLED` | 409 | 模板已停用 |
| `TEMPLATE_UNAVAILABLE` | 409 | 任务执行时模板不存在或已停用 |
| `RULE_NAME_REQUIRED` | 400 | 规则名称为空 |
| `RULE_NOT_FOUND` | 404 | 规则不存在 |
| `EVENT_TYPE_INVALID` | 400 | 事件类型非法 |
| `EVENT_DUPLICATED` | 409 | 事件已存在 |
| `TASK_NOT_FOUND` | 404 | 任务不存在 |
| `RECEIPT_ID_REQUIRED` | 400 | 回执缺少 `bizId` 或 `requestId` |
| `SHORT_LINK_NOT_FOUND` | 404 | 短链不存在 |
| `SMS_PROVIDER_INVALID` | 400/500 | Provider 配置非法 |
| `ALIYUN_CONFIG_MISSING` | 500 | 阿里云必要配置缺失 |
| `SMS_SEND_FAILED` | 502 | 短信服务商调用失败 |

### 18.2 后续鉴权错误码

| 错误码 | HTTP 状态码 | 中文说明 |
| --- | --- | --- |
| `UNAUTHORIZED` | 401 | 未登录或 token 失效 |
| `FORBIDDEN` | 403 | 无权限执行该操作 |
| `ACCOUNT_LOCKED` | 423 | 账号被锁定 |
| `ACCOUNT_DISABLED` | 403 | 账号被禁用 |
| `CAPTCHA_REQUIRED` | 428 | 需要验证码 |
| `CAPTCHA_INVALID` | 400 | 验证码错误 |
| `PASSWORD_WEAK` | 400 | 密码强度不足 |
| `VERIFY_CODE_EXPIRED` | 400 | 验证码过期 |

## 19. 当前实现与 PRD 差异

| 模块 | PRD 要求 | 当前状态 | 后续建议 |
| --- | --- | --- | --- |
| 登录与账号 | 登录、注册申请、忘记密码、会话安全 | 未实现 | 优先补齐，否则权限和审计无法落地 |
| 用户与角色 | 固定角色、用户管理、注册审核 | 未实现 | 与登录模块一起实现 |
| 模板库 | 查询、新建、启停、详情、编辑、测试发送 | 部分实现 | 补充编辑、详情、查询筛选、审核状态 |
| 规则中心 | 查询、新建、启停、编辑、复制、测试、发布 | 部分实现 | 补充编辑、详情、复制、规则测试和影响预估 |
| 手动发送 | 单手机号发送 | 已实现 | 后续补权限、二次确认和操作审计 |
| 事件触发 | 事件上报、事件流水 | 已实现 | 后续补来源系统鉴权、签名和接入日志 |
| 任务队列 | 查询、执行到期、重试、取消、详情 | 部分实现 | 补任务详情、单任务重试、取消、批量操作 |
| 发送记录 | 查询、标记送达、回执、短链 | 部分实现 | 补详情、测试标记送达、更多筛选条件 |
| 统计分析 | 概览、趋势、维度、漏斗 | 部分实现 | 补时间范围、趋势和维度聚合 |
| 黑名单退订 | 黑名单、退订、防骚扰 | 未实现 | 真实发送前必须补齐 |
| 发送控制 | Provider、白名单、worker、事件来源 | 部分实现 | 发送通道和安全控制已后台化，AccessKey 仍依赖环境变量 |
| 操作日志 | 关键操作审计 | 未实现 | 真实发送前必须补齐 |
| 审批记录 | 高风险操作审批 | 未实现 | 先做轻量单级审批 |
| 数据导出 | 列表导出 | 未实现 | 后续按任务、日志、黑名单、操作日志补齐 |

## 20. 联调建议

建议按以下顺序验证主链路：

1. `GET /health` 确认服务启动、Provider 和 worker 状态。
2. `GET /api/templates` 获取可用模板。
3. `POST /api/manual-send` 使用白名单手机号执行 mock 手动发送。
4. `GET /api/send-logs` 确认发送日志已生成。
5. `POST /api/rules` 创建自动触达规则。
6. `POST /api/events` 上报业务事件并生成任务。
7. `GET /api/tasks` 查看任务队列。
8. `POST /api/tasks/run-due` 执行到期任务。
9. `POST /api/sms/provider/callback` 模拟服务商回执。
10. 打开 `shortUrl` 或请求 `GET /s/{shortCode}` 验证点击记录。
11. `GET /api/stats/overview` 查看发送、回执、点击统计。
