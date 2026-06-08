# 实现覆盖说明

本文档记录当前代码相对 V1 文档的实现覆盖情况。

## 已实现

| 文档能力 | 当前实现 |
| --- | --- |
| 短信模板管理 | React 后台支持模板列表、创建、启停；API 支持 `/api/templates` 和 `/api/sms/templates` |
| 手动发送 | 支持选择模板和手机号发送；默认 `mock`，真实发送需切换 `aliyun_dypns` |
| 自动规则触发 | 支持四类事件接收、规则匹配、生成计划任务和到期执行 |
| 四类事件 | `user_register`、`membership_expired`、`campaign_start`、`order_completed` |
| 任务调度 | 已实现 `sms_task` 任务表、pending/sending/success/failed/blocked 状态、到期扫描执行、最大重试次数和可选后台 worker |
| 发送记录 | 记录手动/自动、模板、规则、事件、服务商返回、手机号脱敏 |
| 短链追踪 | 发送成功生成短链；`GET /s/{shortCode}` 记录点击并跳转 |
| 回执状态管理 | `POST /api/sms/provider/callback` 写入回执并更新发送状态 |
| 效果统计 | 展示发送量、成功量、失败量、拦截量、点击量、CTR |
| 幂等 | 事件 `eventId` 去重；回执按 `bizId + receiptStatus` 去重 |
| 数据库 | 使用 Docker PostgreSQL + Prisma，已包含 schema、migration、seed |
| 安全边界 | 默认 mock、白名单限制、AccessKey 不入库不入文档、手机号脱敏 |

## 已实现但为测试版形态

| 能力 | 测试版处理方式 |
| --- | --- |
| 短信服务商 | 使用阿里云号码认证 `dypnsapi SendSmsVerifyCode`，非正式营销短信 |
| 短信内容 | 使用验证码模板验证链路，不发送真实营销文案 |
| 任务调度 | 内置 worker 默认关闭，需通过 `SMS_TASK_WORKER_ENABLED=true` 显式开启 |
| 短链目标 | 使用默认测试目标地址，可通过环境变量配置 |

## 后续待生产化

- 接入 Redis/消息队列等独立 worker，支撑多实例部署和更强并发。
- 增加权限控制、操作审计和登录。
- 支持批量导入手机号。
- 接入正式营销短信签名和模板。
- 完善真实服务商回执字段映射。
