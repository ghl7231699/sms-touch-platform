# 环境配置与启动说明

本文档说明本地开发、数据库、短信通道、任务 worker 和验证命令。

## 运行要求

| 依赖 | 要求 | 说明 |
| --- | --- | --- |
| Node.js | 20 或以上 | 项目使用原生 Node HTTP 服务、React、Vite、Prisma |
| npm | 随 Node 安装 | 安装依赖和运行脚本 |
| Docker Desktop | 已启动 | 本地 PostgreSQL 容器依赖 Docker |
| PostgreSQL | Docker 容器提供 | 通过 `docker-compose.yml` 启动 |

## 首次启动

```bash
npm install
cp .env.example .env
npm run db:up
npm run db:migrate
npm run db:seed
npm run build
npm run dev
```

启动后打开：

```text
http://127.0.0.1:3100
```

默认 `SMS_PROVIDER=mock`，不会真实发送短信。

## 日常启动

如果已经完成过首次初始化，日常只需要：

```bash
npm run db:up
npm run dev
```

需要后台自动扫描到期任务时：

```bash
npm run dev:worker
```

`dev:worker` 会启用内置任务 worker，但仍然使用 `.env` 中的短信通道配置。

## 环境变量

### 基础服务

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `NODE_ENV` | `development` | 运行环境 |
| `PORT` | `3100` | 后端服务端口 |
| `HOST` | `127.0.0.1` | 后端监听地址 |
| `SHORT_LINK_BASE_URL` | `http://127.0.0.1:3100` | 短链生成使用的基础地址 |
| `SHORT_LINK_DEFAULT_TARGET` | `https://example.com/sms-touch-platform` | 短链点击后的默认跳转地址 |

### 数据库

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `DATABASE_URL` | `postgresql://sms_touch:sms_touch_dev@127.0.0.1:5432/sms_touch?schema=public` | Prisma 连接 PostgreSQL 的地址 |

数据库容器配置在 `docker-compose.yml`：

```text
Database: sms_touch
User: sms_touch
Password: sms_touch_dev
Port: 5432
```

### 短信通道

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `SMS_PROVIDER` | `mock` | `mock` 不真实发送；`aliyun_dypns` 调用阿里云号码认证服务 |
| `SMS_TEST_PHONE_WHITELIST` | 测试手机号列表 | 真实发送只允许白名单手机号 |

当前白名单：

```text
18709795241,15117970665,18633007288,18515385071
```

### 阿里云号码认证

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `ALIYUN_DYPNS_ENDPOINT` | `dypnsapi.aliyuncs.com` | 阿里云号码认证 Endpoint |
| `ALIYUN_DYPNS_REGION` | `cn-hangzhou` | 区域 |
| `ALIYUN_SMS_SIGN_NAME` | `速通互联验证码` | 已通过的短信签名 |
| `ALIYUN_SMS_TEMPLATE_CODE` | `100001` | 默认模板 Code |
| `ALIYUN_SMS_TEMPLATE_PARAM` | `{"code":"##code##","min":"5"}` | 模板变量 |
| `ALIYUN_SMS_CODE_TYPE` | `1` | 号码认证验证码类型 |
| `ALIYUN_SMS_CODE_LENGTH` | `6` | 验证码长度 |
| `ALIYUN_SMS_VALID_TIME` | `300` | 验证码有效期，单位秒 |
| `ALIBABA_CLOUD_ACCESS_KEY_ID` | 空 | 本地填写，不提交仓库 |
| `ALIBABA_CLOUD_ACCESS_KEY_SECRET` | 空 | 本地填写，不提交仓库 |

需要真实验证短信到达时，修改 `.env`：

```text
SMS_PROVIDER=aliyun_dypns
ALIBABA_CLOUD_ACCESS_KEY_ID=你的 AccessKey ID
ALIBABA_CLOUD_ACCESS_KEY_SECRET=你的 AccessKey Secret
```

真实发送仍会经过 `SMS_TEST_PHONE_WHITELIST` 校验。

## 任务 worker

内置 worker 默认关闭，避免误发。需要自动扫描到期任务时：

```text
SMS_TASK_WORKER_ENABLED=true
SMS_TASK_WORKER_INTERVAL_MS=30000
SMS_TASK_WORKER_BATCH_SIZE=20
SMS_TASK_WORKER_ALLOW_REAL_SEND=false
```

说明：

- `SMS_TASK_WORKER_ENABLED=true` 后，服务启动时会周期扫描到期任务。
- `SMS_TASK_WORKER_INTERVAL_MS` 控制扫描间隔。
- `SMS_TASK_WORKER_BATCH_SIZE` 控制每批处理数量。
- 当 `SMS_PROVIDER` 不是 `mock` 时，必须设置 `SMS_TASK_WORKER_ALLOW_REAL_SEND=true`，worker 才会启动。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 启动后端和已构建前端，worker 默认关闭 |
| `npm run dev:worker` | 启动后端并开启内置任务 worker |
| `npm run build` | 构建 React 前端 |
| `npm run typecheck` | 前端 TypeScript 类型检查 |
| `npm run test:mock` | 使用 mock 通道验证手动发送 |
| `npm run db:up` | 启动 PostgreSQL 容器 |
| `npm run db:migrate` | 执行 Prisma 开发迁移 |
| `npm run db:deploy` | 部署环境执行 Prisma migration |
| `npm run db:seed` | 写入初始模板和规则 |
| `npm run db:studio` | 打开 Prisma Studio |

## 验证命令

健康检查：

```bash
curl -sS http://127.0.0.1:3100/health
```

模板列表：

```bash
curl -sS http://127.0.0.1:3100/api/templates
```

mock 手动发送：

```bash
curl -sS -X POST http://127.0.0.1:3100/api/manual-send \
  -H 'Content-Type: application/json' \
  -d '{"phone":"18515385071","templateId":"tpl_register","variables":{"code":"123456","min":"5"}}'
```

执行到期任务：

```bash
curl -sS -X POST http://127.0.0.1:3100/api/tasks/run-due \
  -H 'Content-Type: application/json' \
  -d '{"limit":20}'
```

查看统计：

```bash
curl -sS http://127.0.0.1:3100/api/stats
```

## 安全注意

- `.env` 不提交仓库。
- AccessKey 只放本地 `.env` 或部署环境变量。
- 默认使用 `mock` 通道开发。
- 真实短信只允许发送到白名单手机号。
- 开启 worker 前确认当前 `SMS_PROVIDER`，避免真实短信误发。
