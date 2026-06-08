# 短信触达平台

短信触达平台是面向运营人员的自动化触达工作台，覆盖模板管理、规则配置、手动发送、事件触发、短链点击、回执更新、发送记录和效果统计。当前版本默认使用 `mock` 通道，便于安全验证完整业务闭环；需要真实短信到达时，可显式切换到阿里云号码认证 SDK 通道。

文档已集中到 [doc/](doc/)。

## 快速启动

```bash
npm install
cp .env.example .env
npm run db:up
npm run db:migrate
npm run db:seed
npm run build
npm run dev
```

打开：

```text
http://localhost:3100
```

默认 `SMS_PROVIDER=mock`，不会真实发送短信。只有在 `.env` 中显式设置 `SMS_PROVIDER=aliyun_dypns` 并填写 AccessKey 后，才会调用阿里云 SDK。

完整环境变量、首次启动、日常启动、worker 启动和验证命令见：

[环境配置与启动说明](doc/environment-and-startup.md)

后台任务 worker 默认关闭，避免真实短信模式下误发。需要自动扫描到期任务时显式开启：

```text
SMS_TASK_WORKER_ENABLED=true
SMS_TASK_WORKER_INTERVAL_MS=30000
SMS_TASK_WORKER_BATCH_SIZE=20
```

当 `SMS_PROVIDER` 不是 `mock` 时，还必须设置 `SMS_TASK_WORKER_ALLOW_REAL_SEND=true`，worker 才会启动。

## 数据库

当前项目使用本地 Docker 容器中的 PostgreSQL 作为数据库，Prisma 负责 schema、migration 和访问层。

```text
Database: sms_touch
User: sms_touch
Password: sms_touch_dev
Port: 5432
DATABASE_URL=postgresql://sms_touch:sms_touch_dev@127.0.0.1:5432/sms_touch?schema=public
```

相关文件：

```text
docker-compose.yml        PostgreSQL 容器
prisma/schema.prisma      数据库模型
prisma/migrations/        迁移文件
prisma/seed.js            初始模板和规则数据
```

## API

```text
GET  /health
GET  /api/dashboard
GET  /api/templates
POST /api/templates
PATCH /api/templates/:id/status
GET  /api/rules
POST /api/rules
PATCH /api/rules/:id/status
POST /api/manual-send
POST /api/events
GET  /api/events
GET  /api/tasks
POST /api/tasks/run-due
GET  /api/send-logs
GET  /api/stats
GET  /api/stats/overview
GET  /s/:shortCode
POST /api/sms/provider/callback
POST /api/provider-callback/:provider
GET  /api/receipts
GET  /api/click-logs
```

## 安全边界

- 默认 mock，不真实发送。
- 真实发送只允许白名单手机号。
- AccessKey 只从本地 `.env` 读取，不写入文档和响应。
- 发送日志展示脱敏手机号。

## 项目结构

```text
doc/      项目文档和原始 PDF
prisma/   Prisma 数据模型、迁移和种子数据
server/   后端 API、业务服务和短信 Provider
web/      React + TypeScript 运营后台
data/     历史 JSON 数据目录，当前 PostgreSQL 版本不再作为主存储
```
