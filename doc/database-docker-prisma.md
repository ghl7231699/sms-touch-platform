# 数据库与本地 Docker 环境

## 当前数据库

当前项目使用本地 Docker 容器中的 PostgreSQL。

```text
数据库名: sms_touch
用户名: sms_touch
密码: sms_touch_dev
端口: 5432
连接串: postgresql://sms_touch:sms_touch_dev@127.0.0.1:5432/sms_touch?schema=public
```

Prisma 是当前项目的数据库访问和迁移工具，核心文件如下：

```text
docker-compose.yml
prisma/schema.prisma
prisma/migrations/
prisma/seed.js
apps/api/src/modules/sms/sms.repository.js
```

## 启动数据库

```bash
npm run db:up
npm run db:migrate
npm run db:seed
```

说明：

- `db:up` 启动 PostgreSQL 容器。
- `db:migrate` 创建或更新数据库表。
- `db:seed` 写入初始短信模板和触达规则。

## 验证数据库

```bash
docker exec sms-touch-postgres pg_isready -U sms_touch -d sms_touch
curl -sS http://127.0.0.1:3100/api/templates
curl -sS http://127.0.0.1:3100/api/stats
```

## 业务验证

默认 `SMS_PROVIDER=mock`，以下验证不会真实发送短信。

```bash
curl -sS -X POST http://127.0.0.1:3100/api/manual-send \
  -H 'Content-Type: application/json' \
  -d '{"phone":"18515385071","templateId":"tpl_register","variables":{"code":"123456","min":"5"}}'
```

事件触发会先生成 `sms_task` 任务；调用 `/api/tasks/run-due` 会执行到期任务并关联发送日志。发送成功后会生成短链，访问短链会写入点击日志；调用 `/api/provider-callback/:provider` 会写入回执并更新发送日志。

## 后台任务 worker

内置 worker 默认关闭，避免真实短信模式下误发。需要自动扫描到期任务时，在 `.env` 中显式开启：

```text
SMS_TASK_WORKER_ENABLED=true
SMS_TASK_WORKER_INTERVAL_MS=30000
SMS_TASK_WORKER_BATCH_SIZE=20
```

如果 `SMS_PROVIDER` 不是 `mock`，还必须额外设置：

```text
SMS_TASK_WORKER_ALLOW_REAL_SEND=true
```

查看 worker 状态：

```bash
curl -sS http://127.0.0.1:3100/health
```

## 与旧 JSON 存储的关系

早期实现曾使用 `data/platform-store.json` 保存测试数据。当前版本已经切换到 PostgreSQL，`data/` 仅作为历史目录保留，不再作为主存储。
