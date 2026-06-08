# 后端 MVP 设计

本文档定义短信触达平台测试版后端的第一阶段实现范围。目标是先跑通“请求进入 -> 白名单校验 -> 发送任务 -> mock/阿里云 SDK Provider -> 发送日志 -> 基础统计”的最小闭环。

## 目标

- 提供一个可运行的后端服务。
- 默认使用 `mock` 短信通道，不真实发送短信。
- 支持显式切换到 `aliyun_dypns`，通过阿里云 SDK 调用号码认证服务 `SendSmsVerifyCode`。
- 所有真实发送必须经过测试手机号白名单校验。
- 保存发送记录，支持查询和基础统计。

## 非目标

第一阶段不做以下内容：

- 正式营销短信发送。
- 正式短信服务 `dysmsapi SendSms`。
- 分布式队列和多实例任务抢占。
- 用户分群、AB 实验、营销旅程、转化归因。

这些能力保留在完整 V1 或后续阶段中实现。

## 技术栈建议

| 类型 | 建议 |
| --- | --- |
| 运行时 | Node.js |
| 语言 | TypeScript |
| Web 框架 | Node.js HTTP 服务或 Express/Fastify |
| 前端 | React + TypeScript + Vite |
| 数据库 | Docker PostgreSQL |
| ORM/查询 | Prisma |
| 配置 | `.env` + `.env.example` |
| 阿里云 SDK | `@alicloud/dypnsapi20170525@2.0.0` |

第一阶段实际采用 Node.js HTTP 服务 + React + TypeScript + Vite + Docker PostgreSQL + Prisma，既能快速验证平台闭环，也避免继续依赖临时 JSON 存储。

## 目录结构

```text
apps/
  api/
    src/
      app.js
      config/
        env.js
      modules/
        sms/
          sms.service.js
          sms.repository.js
          sms.types.js
          providers/
            mock-sms-provider.js
            aliyun-dypns-provider.js
      utils/
        mask-phone.js
        ids.js
    package.json
  web/
    src/
      main.tsx
      styles.css
    vite.config.ts
    package.json
prisma/
  schema.prisma
  migrations/
  seed.js
docker-compose.yml
.env.example
package.json
```

Prisma schema 和 migration 是当前项目的主数据库结构来源。

## 环境变量

默认 `.env.example`：

```text
NODE_ENV=development
PORT=3100
HOST=127.0.0.1
DATABASE_URL=postgresql://sms_touch:sms_touch_dev@127.0.0.1:5432/sms_touch?schema=public

SMS_PROVIDER=mock
SMS_TEST_PHONE_WHITELIST=18709795241,15117970665,18633007288,18515385071

ALIYUN_DYPNS_ENDPOINT=dypnsapi.aliyuncs.com
ALIYUN_DYPNS_REGION=cn-hangzhou
ALIYUN_SMS_SIGN_NAME=速通互联验证码
ALIYUN_SMS_TEMPLATE_CODE=100001
ALIYUN_SMS_TEMPLATE_PARAM={"code":"##code##","min":"5"}
ALIYUN_SMS_CODE_TYPE=1
ALIYUN_SMS_CODE_LENGTH=6
ALIYUN_SMS_VALID_TIME=300

ALIBABA_CLOUD_ACCESS_KEY_ID=
ALIBABA_CLOUD_ACCESS_KEY_SECRET=
```

说明：

- `SMS_PROVIDER=mock` 为默认值。
- 只有设置 `SMS_PROVIDER=aliyun_dypns` 才允许真实调用阿里云。
- AccessKey 只允许放在本地 `.env` 或部署环境变量中，不能写入代码和文档。

## Provider 抽象

统一接口：

```ts
export interface SmsProvider {
  name: string;
  sendVerifyCode(input: SendVerifyCodeInput): Promise<SendVerifyCodeResult>;
}

export interface SendVerifyCodeInput {
  phone: string;
  templateCode: string;
  templateParam: Record<string, string>;
  codeLength?: number;
  validTime?: number;
}

export interface SendVerifyCodeResult {
  success: boolean;
  provider: string;
  code: string;
  message: string;
  bizId?: string;
  requestId?: string;
  raw?: unknown;
}
```

Provider 实现：

| Provider | 用途 | 是否真实发送 |
| --- | --- | --- |
| `MockSmsProvider` | 默认开发和测试 | 否 |
| `AliyunDypnsVerifyProvider` | 少量真实到达验证 | 是 |
| `AliyunSmsProvider` | 未来正式短信通道预留 | 是 |

## 阿里云 SDK 调用

第一阶段使用阿里云号码认证服务 SDK：

```text
@alicloud/dypnsapi20170525@2.0.0
```

调用接口：

```text
SendSmsVerifyCode
```

请求参数映射：

| 本地配置 | 阿里云参数 |
| --- | --- |
| `phone` | `PhoneNumber` |
| `ALIYUN_SMS_SIGN_NAME` | `SignName` |
| `ALIYUN_SMS_TEMPLATE_CODE` | `TemplateCode` |
| `ALIYUN_SMS_TEMPLATE_PARAM` | `TemplateParam` |
| `ALIYUN_SMS_CODE_TYPE` | `CodeType` |
| `ALIYUN_SMS_CODE_LENGTH` | `CodeLength` |
| `ALIYUN_SMS_VALID_TIME` | `ValidTime` |

使用 `{"code":"##code##","min":"5"}` 时，验证码由阿里云生成；本地不记录明文验证码。

## 数据模型

第一阶段使用 Docker PostgreSQL 保存平台数据，Prisma 负责建表、迁移和访问层。当前数据库包含模板、规则、事件、任务、短链、点击日志、回执和发送日志。

启动数据库：

```bash
npm run db:up
npm run db:migrate
npm run db:seed
```

核心文件：

```text
docker-compose.yml
prisma/schema.prisma
prisma/migrations/
prisma/seed.js
apps/api/src/modules/sms/sms.repository.js
```

### sms_task

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 主键，UUID |
| `taskType` | string | `manual` 或 `auto` |
| `status` | string | `pending`、`sending`、`success`、`failed`、`blocked` |
| `triggerType` | string | 手动或自动触发 |
| `phone` | string | 原始手机号 |
| `phoneMasked` | string | 脱敏手机号 |
| `templateId` | string | 关联短信模板 |
| `ruleId` | string? | 自动任务关联规则 |
| `eventId` | string? | 自动任务关联业务事件 |
| `scheduledAt` | datetime | 计划发送时间 |
| `sentAt` | datetime? | 实际发送时间 |
| `attemptCount` | number | 已尝试次数 |
| `maxAttempts` | number | 最大尝试次数 |
| `lastErrorCode` | string? | 最近失败错误码 |
| `lastErrorMessage` | string? | 最近失败错误信息 |
| `logId` | string? | 发送后关联发送日志 |

任务执行规则：

- 业务事件命中规则后先生成 `pending` 任务。
- 到期任务由 `POST /api/tasks/run-due` 扫描执行。
- 也可通过 `SMS_TASK_WORKER_ENABLED=true` 开启内置后台 worker 周期扫描。
- 执行前任务进入 `sending`，发送完成后更新为 `success`、`failed` 或 `blocked`。
- `failed` 任务在未达到 `maxAttempts` 前可继续被到期扫描重试。
- 非 `mock` 短信通道下，worker 还需要 `SMS_TASK_WORKER_ALLOW_REAL_SEND=true` 才会启动，避免真实短信误发。

### sms_send_log

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 主键，UUID |
| `provider` | string | `mock` 或 `aliyun_dypns` |
| `phone` | string | 原始手机号，可按需要加密存储 |
| `phoneMasked` | string | 脱敏手机号 |
| `templateCode` | string | 模板 Code |
| `templateParam` | json | 模板参数，避免记录敏感验证码明文 |
| `status` | string | `success`、`failed`、`blocked` |
| `code` | string | 服务商返回 Code 或本地错误码 |
| `message` | string | 服务商返回 Message 或本地错误信息 |
| `bizId` | string? | 阿里云 BizId |
| `requestId` | string? | 阿里云 RequestId |
| `rawResponse` | json? | 服务商原始返回 |
| `createdAt` | datetime | 创建时间 |

状态说明：

| 状态 | 含义 |
| --- | --- |
| `success` | mock 成功或阿里云返回 `Code=OK` 且 `Success=true` |
| `failed` | 调用阿里云失败或返回非成功 |
| `blocked` | 手机号不在白名单，未调用 Provider |

## API 设计

### POST /api/sms/send-test-code

发送测试验证码。默认使用当前 `SMS_PROVIDER`。

请求：

```json
{
  "phone": "18515385071",
  "templateCode": "100001"
}
```

响应成功：

```json
{
  "success": true,
  "status": "success",
  "provider": "mock",
  "logId": "uuid",
  "phoneMasked": "185****5071",
  "code": "OK",
  "message": "OK"
}
```

非白名单响应：

```json
{
  "success": false,
  "status": "blocked",
  "code": "PHONE_NOT_IN_WHITELIST",
  "message": "Phone number is not allowed in test mode."
}
```

### GET /api/sms/send-logs

查询发送日志。

查询参数：

| 参数 | 说明 |
| --- | --- |
| `phone` | 可选，手机号精确查询 |
| `status` | 可选，`success`、`failed`、`blocked` |
| `provider` | 可选，`mock`、`aliyun_dypns` |
| `page` | 页码 |
| `pageSize` | 每页数量 |

响应：

```json
{
  "items": [
    {
      "id": "uuid",
      "provider": "mock",
      "phoneMasked": "185****5071",
      "templateCode": "100001",
      "status": "success",
      "code": "OK",
      "message": "OK",
      "createdAt": "2026-06-06T10:00:00.000Z"
    }
  ],
  "total": 1,
  "page": 1,
  "pageSize": 20
}
```

### GET /api/sms/stats/overview

返回测试发送统计。

响应：

```json
{
  "sendCount": 10,
  "successCount": 8,
  "failedCount": 1,
  "blockedCount": 1,
  "providers": {
    "mock": 9,
    "aliyun_dypns": 1
  }
}
```

### GET /health

健康检查。

响应：

```json
{
  "status": "ok"
}
```

## 发送流程

```mermaid
flowchart LR
  Request["发送请求"] --> Validate["参数校验"]
  Validate --> Whitelist["白名单校验"]
  Whitelist -->|不通过| Blocked["写 blocked 日志"]
  Whitelist -->|通过| Provider["选择 Provider"]
  Provider --> Mock["mock 返回成功"]
  Provider --> Aliyun["阿里云 SDK 调用"]
  Mock --> Log["写发送日志"]
  Aliyun --> Log
  Log --> Response["返回结果"]
```

## 防误发规则

- 默认 `SMS_PROVIDER=mock`。
- `SMS_PROVIDER=aliyun_dypns` 时仍必须校验白名单。
- `SMS_TEST_PHONE_WHITELIST` 为空时禁止真实发送。
- 单次请求只允许一个手机号。
- 第一阶段不支持批量发送。
- 日志中手机号必须脱敏展示。

## 错误码

| 错误码 | 场景 |
| --- | --- |
| `PHONE_REQUIRED` | 手机号为空 |
| `PHONE_INVALID` | 手机号格式非法 |
| `PHONE_NOT_IN_WHITELIST` | 手机号不在测试白名单 |
| `SMS_PROVIDER_INVALID` | 未知 Provider |
| `ALIYUN_CONFIG_MISSING` | 阿里云必要配置缺失 |
| `ALIYUN_SEND_FAILED` | 阿里云返回失败或 SDK 调用异常 |

## 验收标准

- 服务可启动，并通过 `/health`。
- `.env.example` 不包含真实 AccessKey。
- 默认 `mock` 模式可发送测试验证码并写入日志。
- 非白名单手机号不会调用 Provider，状态记录为 `blocked`。
- `GET /api/sms/send-logs` 可查询发送记录。
- `GET /api/sms/stats/overview` 可返回成功、失败、拦截统计。
- `GET /api/tasks` 可查询自动触达任务队列。
- `POST /api/tasks/run-due` 可执行到期任务，并将结果关联到发送日志。
- `/health` 可查看内置 worker 是否启用、最近执行时间和最近处理数量。
- 显式切换 `SMS_PROVIDER=aliyun_dypns` 后，可通过阿里云 SDK 对白名单手机号真实发送验证码。
- 日志中手机号脱敏，AccessKey 不出现在响应、日志和数据库中。

## 后续阶段

第二阶段可继续实现：

- Redis/消息队列等独立 worker。
- 批量导入手机号。
- 生产环境数据库备份、恢复和监控。
- 权限控制和操作审计。
