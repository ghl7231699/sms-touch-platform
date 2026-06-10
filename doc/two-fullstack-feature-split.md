# 双全栈功能拆分与协作边界

## 1. 文档目的

本文基于当前代码实现重新梳理短信触达平台 V1.0 的双全栈分工，用于避免两名全栈工程师并行开发时反复修改同一模块、同一接口、同一张表，造成返工和合并冲突。

本文不再只按 PRD 规划拆分，而是结合当前项目已有代码：

1. 前端现有路由与页面。
2. 后端现有 API 和 service。
3. Prisma 当前数据模型。
4. 已有权限、治理、审计、批量、审批能力。
5. UI/UX 重构计划中“Marketing Automation Platform”的新方向。

核心原则：

1. 每个人都负责一条完整业务链路，不按纯前端/纯后端拆。
2. 全栈 A 负责触达增长链路：短信怎么被配置、触发、发送、追踪和分析。
3. 全栈 B 负责治理安全链路：谁能操作、哪些号码能发、系统是否安全、问题如何审计。
4. 公共能力必须先定契约，再各自接入。
5. 涉及权限、发送前安全校验、状态枚举、手机号处理、操作日志、批量任务、审批的改动必须提前同步。

## 2. 当前项目已有功能盘点

### 2.1 前端已有页面

当前前端页面主要由 `apps/web/src/constants/menus.tsx` 注册。

| 当前分组 | 页面 | 当前路径 |
| --- | --- | --- |
| 运营总览 | 增长总览 | `/overview/dashboard` |
| 触达运营 | 模板中心 | `/touch/templates` |
| 触达运营 | 规则中心 | `/touch/rules` |
| 触达运营 | 手动发送 | `/touch/manual-send` |
| 触达运营 | 任务中心 | `/touch/tasks` |
| 触达运营 | 事件触发 | `/touch/events` |
| 数据分析 | 发送记录 | `/data/send-logs` |
| 账号权限 | 用户管理、注册申请、角色权限 | `/account/users` |
| 安全治理 | 白名单 | `/security/whitelist` |
| 安全治理 | 黑名单 | `/security/blacklist` |
| 安全治理 | 退订记录 | `/security/unsubscribes` |
| 安全治理 | 发送控制 | `/security/settings` |
| 接入管理 | 事件来源 | `/integration/event-sources` |
| 接入管理 | 接入日志 | `/integration/event-source-logs` |
| 审计与流程 | 操作日志 | `/audit/operation-logs` |
| 审计与流程 | 导出任务 | `/audit/export-tasks` |
| 审计与流程 | 批量操作 | `/audit/batch-jobs` |
| 审计与流程 | 审批记录 | `/audit/approvals` |
| 登录 | 登录、注册申请、忘记密码 | `/login` 内部状态 |
| 登录 | 设置密码 | `/set-password` |

### 2.2 后端已有能力

| 能力域 | 当前实现 |
| --- | --- |
| 短信主链路 | 模板、规则、事件、任务、手动发送、发送记录、回执、短链、统计 |
| Provider | mock provider、阿里云测试 provider、provider callback |
| Worker | 内置任务 worker、到期任务扫描和执行 |
| 账号权限 | 登录、退出、注册申请、忘记密码、重置密码、设置密码、用户管理、角色权限 |
| 安全治理 | 白名单、黑名单、退订、频控、发送前安全校验、发送控制 |
| 接入管理 | 事件来源、secret、事件鉴权、接入日志 |
| 审计流程 | 操作日志、导出任务、批量任务、审批单 |
| 权限体系 | 固定角色、权限点、前端菜单/按钮权限、后端接口鉴权 |

### 2.3 当前数据模型

| 领域 | 表 |
| --- | --- |
| 触达主链路 | `sms_template`、`sms_rule`、`sms_event`、`sms_task`、`sms_send_log`、`sms_receipt`、`sms_short_link`、`sms_click_log` |
| 账号权限 | `admin_user`、`admin_role`、`admin_user_role`、`auth_session`、`auth_verification_code`、`auth_register_request`、`auth_password_setup_token` |
| 审计 | `admin_operation_log` |
| 安全治理 | `sms_whitelist`、`sms_blacklist`、`sms_unsubscribe`、`sms_frequency_policy`、`system_setting` |
| 接入管理 | `event_source`、`event_source_log` |
| 流程工具 | `export_task`、`batch_job`、`batch_job_item`、`approval_order`、`approval_record` |

## 3. 总体拆分

| 角色 | 方向 | 一句话边界 |
| --- | --- | --- |
| 全栈 A | 触达增长链路 | 负责“短信怎么被配置、触发、发送、追踪和分析” |
| 全栈 B | 治理安全链路 | 负责“谁能操作、哪些号码能发、系统是否安全、问题如何审计” |

### 3.1 A/B 最终边界

全栈 A 的边界：

> 触达运营 + 数据分析。负责模板、规则、手动发送、事件、任务、发送记录、回执、短链、统计，以及这些页面的 UI/UX 重构。

全栈 B 的边界：

> 账号权限 + 安全治理 + 接入管理 + 审计流程。负责登录、用户、权限、白名单、黑名单、退订、发送控制、事件来源、操作日志、导出、批量操作、审批，以及这些页面的 UI/UX 重构。

两人交汇点：

> 权限校验、发送前安全校验、操作日志、手机号处理、状态枚举、批量任务、审批、菜单结构、接口错误码。

## 4. 全栈 A 功能清单

### 4.1 A 主责模块

| 模块 | 当前前端页面 | 当前后端能力 | 主责说明 |
| --- | --- | --- | --- |
| 运营总览 | `/overview/dashboard` | `/api/dashboard`、`/api/stats/overview` | 展示发送、成功、失败、拦截、点击、CTR、规则和任务概览 |
| 模板中心 | `/touch/templates` | `/api/templates`、`/api/templates/{id}/status` | 模板列表、创建、启停 |
| 规则中心 | `/touch/rules` | `/api/rules`、`/api/rules/{id}/status` | 规则列表、创建、启停、高风险启停接入审批 |
| 手动发送 | `/touch/manual-send` | `/api/manual-send` | 选择模板和手机号发起手动发送 |
| 事件触发 | `/touch/events` | `/api/events` | 事件流水、模拟事件、事件触发规则匹配 |
| 任务中心 | `/touch/tasks` | `/api/tasks`、`/api/tasks/run-due` | 任务列表、执行到期任务、批量取消、批量重试 |
| 发送记录 | `/data/send-logs` | `/api/send-logs` | 查询发送日志、状态、Provider 返回、短链数据 |
| 回执 | 无独立主页面 | `/api/sms/provider/callback`、`/api/receipts` | Provider 回执写入和发送状态更新 |
| 短链 | 无独立主页面 | `/s/{shortCode}`、`/api/click-logs` | 短链跳转、点击记录、点击统计 |
| 统计分析 | 当前在总览和发送记录中体现 | `/api/stats/overview`、后续 stats 子接口 | 发送、成功、失败、点击、CTR、场景表现 |

### 4.2 A 主责前端文件

| 文件 | 说明 |
| --- | --- |
| `apps/web/src/pages/dashboard/Dashboard.tsx` | 运营总览 |
| `apps/web/src/pages/templates/Templates.tsx` | 模板中心 |
| `apps/web/src/pages/rules/Rules.tsx` | 规则中心 |
| `apps/web/src/pages/manual-send/ManualSend.tsx` | 手动发送 |
| `apps/web/src/pages/events/Events.tsx` | 事件触发 |
| `apps/web/src/pages/tasks/Tasks.tsx` | 任务中心 |
| `apps/web/src/pages/logs/Logs.tsx` | 发送记录 |

A 可以修改上述页面的布局、组件、交互和视觉。涉及权限按钮、菜单 key、全局 AppShell 时必须同步 B。

### 4.3 A 主责后端文件

| 文件 | 说明 |
| --- | --- |
| `apps/api/src/modules/sms/sms.service.js` | 短信主链路 service |
| `apps/api/src/modules/sms/sms.repository.js` | 短信主链路 repository |
| `apps/api/src/modules/sms/sms.worker.js` | 任务 worker |
| `apps/api/src/modules/sms/sms.condition-evaluator.js` | 规则条件判断 |
| `apps/api/src/modules/sms/providers/mock-sms-provider.js` | mock provider |
| `apps/api/src/modules/sms/providers/aliyun-dypns-provider.js` | 阿里云测试 provider |
| `apps/api/src/modules/sms/providers/index.js` | provider 入口 |
| `apps/api/src/modules/sms/sms.types.js` | 短信主链路类型常量 |

### 4.4 A 主责数据表

| 表 | 说明 |
| --- | --- |
| `sms_template` | 模板 |
| `sms_rule` | 规则 |
| `sms_event` | 事件 |
| `sms_task` | 任务 |
| `sms_send_log` | 发送记录 |
| `sms_receipt` | 回执 |
| `sms_short_link` | 短链 |
| `sms_click_log` | 点击日志 |

### 4.5 A 当前已有接口清单

| 接口 | 说明 |
| --- | --- |
| `GET /api/dashboard` | 运营总览 |
| `GET /api/stats/overview` | 统计概览 |
| `GET /api/templates` | 模板列表 |
| `POST /api/templates` | 创建模板 |
| `POST /api/templates/{id}/status` | 启停模板 |
| `GET /api/rules` | 规则列表 |
| `POST /api/rules` | 创建规则 |
| `POST /api/rules/{id}/status` | 启停规则 |
| `POST /api/manual-send` | 手动发送 |
| `GET /api/events` | 事件流水 |
| `POST /api/events` | 接收/模拟事件 |
| `GET /api/tasks` | 任务列表 |
| `POST /api/tasks/run-due` | 执行到期任务 |
| `GET /api/send-logs` | 发送记录 |
| `POST /api/sms/provider/callback` | Provider 回执 |
| `GET /api/receipts` | 回执列表 |
| `GET /api/click-logs` | 点击日志 |
| `GET /s/{shortCode}` | 短链跳转 |

### 4.6 A 不应主改的内容

A 不应主改以下区域：

1. 登录、注册申请、忘记密码、设置密码。
2. 用户管理、角色权限、权限点定义。
3. 白名单、黑名单、退订管理页面和接口。
4. 发送控制配置页面和接口。
5. 事件来源管理和接入日志。
6. 操作日志、导出任务、批量操作列表、审批记录页面。
7. `governance.service.js` 中账号、权限、安全治理、审计流程的主逻辑。

如果 A 需要这些能力，应该调用 B 提供的接口或 helper，而不是在 A 侧重复实现。

## 5. 全栈 B 功能清单

### 5.1 B 主责模块

| 模块 | 当前前端页面 | 当前后端能力 | 主责说明 |
| --- | --- | --- | --- |
| 登录账号 | `/login`、`/set-password` | `/api/auth/*` | 登录、注册申请、忘记密码、重置密码、设置密码、退出 |
| 用户管理 | `/account/users` | `/api/users` | 用户列表、创建、编辑、启停、删除、重置密码、详情 |
| 注册申请 | `/account/users` 内部 tab | `/api/auth/register-requests` | 注册申请列表、审核通过、驳回 |
| 角色权限 | `/account/users` 内部角色区 | `/api/roles` | 内置角色、权限点展示与配置 |
| 白名单 | `/security/whitelist` | `/api/whitelist` | 白名单查询、添加、编辑、启停、导出 |
| 黑名单 | `/security/blacklist` | `/api/blacklist` | 黑名单查询、添加、导入、移除 |
| 退订记录 | `/security/unsubscribes` | `/api/unsubscribes` | 退订查询、添加、导入、状态 |
| 发送控制 | `/security/settings` | `/api/settings`、`/api/settings/update` | Provider、worker、短链、验证码、安全配置、频控 |
| 事件来源 | `/integration/event-sources` | `/api/event-sources` | appId、secret、启停、重置密钥 |
| 接入日志 | `/integration/event-source-logs` | `/api/event-source-logs` | 事件接入日志查询、详情 |
| 操作日志 | `/audit/operation-logs` | `/api/operation-logs` | 操作日志查询、详情 |
| 导出任务 | `/audit/export-tasks` | `/api/export-tasks` | 导出任务创建、详情、下载 |
| 批量操作 | `/audit/batch-jobs` | `/api/batch-jobs` | 批量任务和明细 |
| 审批记录 | `/audit/approvals` | `/api/approvals` | 审批列表、详情、通过、驳回、撤回 |
| 权限鉴权 | 全局 | `permissionFor`、`requireActor` | 前端菜单/按钮权限、后端接口鉴权 |
| 发送前安全校验 | 被 A 调用 | `/api/safety/send-check`、`checkSendSafety` | 白名单、黑名单、退订、频控、安静时段、Provider/worker 校验 |

### 5.2 B 主责前端文件

| 文件 | 说明 |
| --- | --- |
| `apps/web/src/pages/Login/index.tsx` | 登录、注册申请、忘记密码 |
| `apps/web/src/pages/Login/SetPasswordPage.tsx` | 设置密码 |
| `apps/web/src/pages/governance/UsersPage.tsx` | 用户管理、注册申请、角色权限 |
| `apps/web/src/pages/governance/PhoneListPage.tsx` | 白名单、黑名单、退订 |
| `apps/web/src/pages/governance/SettingsPage.tsx` | 发送控制 |
| `apps/web/src/pages/governance/EventSourcesPage.tsx` | 事件来源 |
| `apps/web/src/pages/governance/AuditPage.tsx` | 操作日志、接入日志 |
| `apps/web/src/pages/governance/ExportTasksPage.tsx` | 导出任务 |
| `apps/web/src/pages/governance/BatchJobsPage.tsx` | 批量操作 |
| `apps/web/src/pages/governance/ApprovalsPage.tsx` | 审批记录 |
| `apps/web/src/pages/governance/ForbiddenPage.tsx` | 无权限页 |
| `apps/web/src/lib/auth.ts` | 登录态存取 |
| `apps/web/src/lib/menu-permissions.ts` | 菜单和按钮权限 |
| `apps/web/src/components/AuthTree.tsx` | 权限树展示/配置 |

### 5.3 B 主责后端文件

| 文件 | 说明 |
| --- | --- |
| `apps/api/src/modules/governance/governance.service.js` | 账号权限、安全治理、接入、审计、导出、批量、审批 |

### 5.4 B 主责数据表

| 表 | 说明 |
| --- | --- |
| `admin_user` | 后台用户 |
| `admin_role` | 内置角色与权限 |
| `admin_user_role` | 用户角色关系 |
| `auth_session` | 登录会话 |
| `auth_verification_code` | 验证码 |
| `auth_register_request` | 注册申请 |
| `auth_password_setup_token` | 设置密码 token |
| `admin_operation_log` | 操作日志 |
| `sms_whitelist` | 白名单 |
| `sms_blacklist` | 黑名单 |
| `sms_unsubscribe` | 退订 |
| `sms_frequency_policy` | 频控 |
| `system_setting` | 系统配置 |
| `event_source` | 事件来源 |
| `event_source_log` | 事件接入日志 |
| `export_task` | 导出任务 |
| `batch_job` | 批量任务 |
| `batch_job_item` | 批量任务明细 |
| `approval_order` | 审批单 |
| `approval_record` | 审批处理记录 |

### 5.5 B 当前已有接口清单

| 接口 | 说明 |
| --- | --- |
| `POST /api/auth/login` | 登录 |
| `POST /api/auth/logout` | 退出 |
| `GET /api/auth/me` | 当前用户和权限 |
| `POST /api/auth/register-request` | 提交注册申请 |
| `GET /api/auth/register-requests` | 注册申请列表 |
| `POST /api/auth/register-requests/{id}/approve` | 审核通过 |
| `POST /api/auth/register-requests/{id}/reject` | 驳回申请 |
| `POST /api/auth/forgot-password/send-code` | 忘记密码发送验证码 |
| `POST /api/auth/forgot-password/verify-code` | 校验验证码 |
| `POST /api/auth/reset-password` | 重置密码 |
| `POST /api/auth/set-password` | 设置密码 |
| `POST /api/auth/change-password` | 登录后改密 |
| `GET /api/users` | 用户列表 |
| `POST /api/users` | 创建用户 |
| `GET /api/users/{id}` | 用户详情 |
| `POST /api/users/{id}/update` | 编辑用户 |
| `POST /api/users/{id}/status` | 启停用户 |
| `POST /api/users/{id}/reset-password` | 重置用户密码 |
| `POST /api/users/{id}/delete` | 删除用户 |
| `GET /api/roles` | 角色列表 |
| `GET /api/roles/{id}` | 角色详情 |
| `POST /api/roles/{id}/update` | 更新角色权限 |
| `GET /api/whitelist` | 白名单列表 |
| `POST /api/whitelist` | 添加白名单 |
| `POST /api/whitelist/{id}/update` | 编辑白名单 |
| `POST /api/whitelist/{id}/status` | 启停白名单 |
| `POST /api/whitelist/export` | 导出白名单 |
| `GET /api/blacklist` | 黑名单列表 |
| `POST /api/blacklist` | 添加黑名单 |
| `POST /api/blacklist/import` | 导入黑名单 |
| `POST /api/blacklist/{id}/remove` | 移除黑名单 |
| `GET /api/unsubscribes` | 退订列表 |
| `POST /api/unsubscribes` | 添加退订 |
| `POST /api/unsubscribes/import` | 导入退订 |
| `GET /api/settings` | 查询发送控制配置 |
| `POST /api/settings/update` | 更新发送控制配置 |
| `GET /api/event-sources` | 事件来源列表 |
| `POST /api/event-sources` | 创建事件来源 |
| `GET /api/event-sources/{id}` | 事件来源详情 |
| `POST /api/event-sources/{id}/update` | 编辑事件来源 |
| `POST /api/event-sources/{id}/status` | 启停事件来源 |
| `POST /api/event-sources/{id}/reset-secret` | 重置密钥 |
| `GET /api/event-source-logs` | 接入日志 |
| `GET /api/event-source-logs/{id}` | 接入日志详情 |
| `GET /api/operation-logs` | 操作日志 |
| `GET /api/operation-logs/{id}` | 操作日志详情 |
| `GET /api/export-tasks` | 导出任务 |
| `POST /api/export-tasks` | 创建导出任务 |
| `GET /api/export-tasks/{id}` | 导出任务详情 |
| `GET /api/export-tasks/{id}/download` | 下载导出文件 |
| `GET /api/batch-jobs` | 批量任务列表 |
| `GET /api/batch-jobs/{id}` | 批量任务详情 |
| `GET /api/approvals` | 审批列表 |
| `POST /api/approvals` | 创建审批 |
| `GET /api/approvals/{id}` | 审批详情 |
| `POST /api/approvals/{id}/approve` | 通过审批 |
| `POST /api/approvals/{id}/reject` | 驳回审批 |
| `POST /api/approvals/{id}/withdraw` | 撤回审批 |
| `POST /api/safety/send-check` | 发送前安全校验 |

### 5.6 B 不应主改的内容

B 不应主改以下区域：

1. 模板创建、模板启停业务规则。
2. 规则创建、规则匹配、任务生成逻辑。
3. 手动发送、任务执行、Provider 调用。
4. 回执处理、短链点击、发送记录统计口径。
5. `sms.service.js` 中短信主链路核心流程。
6. `sms.repository.js` 中短信主链路持久化逻辑。

如果 B 需要触达数据用于审计、导出、批量、审批，应通过明确接口或共享 repository 读取，不要直接改 A 的执行逻辑。

## 6. 共享区域和冲突高发点

### 6.1 共享文件

| 文件 | 建议主责 | 协作规则 |
| --- | --- | --- |
| `apps/web/src/constants/menus.tsx` | B 主责菜单和权限框架，A 主责触达菜单项 | 新增菜单、改权限 key、改路径必须同步 |
| `apps/web/src/App.tsx` | B 主责 AppShell/auth，A 可接入数据刷新 | 不随意改全局状态结构和 auth 流程 |
| `apps/web/src/types/index.ts` | 双方共享 | 新增/调整类型前确认接口来源 |
| `apps/web/src/components/*` | 按组件使用归属 | 通用组件不要各自复制一套 |
| `apps/web/src/lib/api.ts` | 双方共享 | 请求拦截、错误处理、403 逻辑必须同步 |
| `prisma/schema.prisma` | 按表归属 | 修改对方表前先同步 |
| `apps/api/src/app.js` | 双方共享 | 新增路由入口要避免重复路径 |

### 6.2 共享能力

| 能力 | 主责 | 使用方 | 规则 |
| --- | --- | --- | --- |
| 权限体系 | B | A/B | A 页面和按钮必须接入 B 权限点 |
| 发送前安全校验 | B | A | A 所有发送入口必须调用 |
| 操作日志 | B | A/B | A 的关键写操作需要写日志或调用日志 helper |
| 批量任务框架 | B | A/B | A 定义任务语义，B 记录批次和明细 |
| 审批流程 | B | A/B | A 发起高风险业务动作，B 管审批状态和处理 |
| 手机号脱敏 | B | A/B | 页面和导出统一使用脱敏规则 |
| 状态枚举 | 双方 | A/B | 不允许单方新增状态 |
| 错误码 | 双方 | A/B | 不允许同一错误含义多个 code |

## 7. 特殊边界说明

### 7.1 批量取消和批量重试

批量取消/批量重试横跨 A 和 B。

| 事项 | 归属 |
| --- | --- |
| 哪些任务可取消/重试 | A |
| 任务状态如何变化 | A |
| 任务中心页面入口 | A |
| 批量任务记录 | B |
| 批量任务明细 | B |
| 操作日志 | B |
| 权限校验 | B |
| 失败明细格式 | A/B 共同确认 |

### 7.2 规则启停和审批

规则本身属于 A，审批流程属于 B。

| 事项 | 归属 |
| --- | --- |
| 规则状态和规则业务逻辑 | A |
| 启停按钮和规则卡片展示 | A |
| 高风险动作是否需要审批 | B 提供判断，A 调用 |
| 审批单创建和处理 | B |
| 审批通过后执行规则状态变更 | A/B 共同确认执行入口 |

### 7.3 手动发送和安全校验

手动发送属于 A，但发送前安全校验属于 B。

| 事项 | 归属 |
| --- | --- |
| 选择模板、填写手机号、发送预览 | A |
| 调用发送接口和展示发送结果 | A |
| 白名单、黑名单、退订、频控、安静时段校验 | B |
| Provider/worker 配置 | B |
| 安全校验结果在页面的展示规范 | A/B 共同确认 |

### 7.4 事件接收和事件来源

事件业务处理属于 A，事件来源鉴权属于 B。

| 事项 | 归属 |
| --- | --- |
| 事件入库、规则匹配、任务生成 | A |
| appId、secret、来源启停 | B |
| HMAC/secret 校验和接入日志 | B |
| 事件流水页面 | A |
| 接入日志页面 | B |

### 7.5 UI/UX 重构边界

当前 UI/UX 重构目标是 Marketing Automation Platform。

| 页面/区域 | UI 重构主责 |
| --- | --- |
| 总览 Hero KPI、运营状态、场景表现 | A |
| 模板中心卡片化 | A |
| 规则中心自动化规则卡片 | A |
| 手动发送预览体验 | A |
| 任务中心状态分组 | A |
| 发送记录可读性 | A |
| 登录、用户、权限页面视觉统一 | B |
| 黑白名单、退订、发送控制视觉统一 | B |
| 事件来源、接入日志 | B |
| 操作日志、导出、批量、审批 | B |
| AppShell、导航、权限菜单 | B 主责，A 协作 |
| 通用状态 Pill、卡片、数据组件 | A/B 共同沉淀，按页面复用 |

UI 重构限制：

1. 不修改业务逻辑。
2. 不修改 API。
3. 不修改数据库结构。
4. 不新增业务功能。
5. 仅做布局、组件、视觉、交互和信息层级优化。

## 8. 禁止跨边界直接修改的区域

| 区域 | 规则 |
| --- | --- |
| A 主责页面 | B 不直接改模板、规则、手动发送、事件、任务、发送记录、统计页面 |
| B 主责页面 | A 不直接改登录、用户、权限、白名单、黑名单、退订、设置、日志、导出、审批页面 |
| A 主责 service | B 不直接改短信发送、任务执行、规则匹配、Provider、回执、短链逻辑 |
| B 主责 service | A 不直接改账号、权限、安全治理、接入、审计、导出、审批逻辑 |
| Prisma 表结构 | 修改对方主责表前必须同步 |
| 状态枚举 | 改动前必须同步并更新类型和页面展示 |
| 菜单和权限 key | 改动前必须同步，否则容易导致页面消失或按钮误隐藏 |
| 批量和审批 | 必须共同确认请求参数、返回结构和状态流转 |

允许跨边界的情况：

1. 修复阻塞主链路的 bug，但提交信息必须说明影响范围。
2. 接入已约定的公共 helper 或组件。
3. 调整类型定义以适配已确认接口。
4. 补测试用例覆盖对方提供的公共契约。

## 9. 修改前必须同步的事项

以下改动必须先同步：

1. 新增或修改任务状态、发送状态、规则状态、模板状态、审批状态。
2. 修改 `/api/auth/me` 返回结构。
3. 修改权限点命名或菜单 key。
4. 修改发送前安全校验逻辑。
5. 修改手机号存储、脱敏、查询规则。
6. 修改 Provider、worker、白名单、黑名单、退订、频控配置。
7. 修改 `sms_task`、`sms_send_log`、`admin_user`、`system_setting` 等核心表。
8. 新增或调整批量操作。
9. 新增或调整审批前置条件。
10. 调整 UI/UX 重构中的一级导航或页面归属。
11. 调整 PRD 中 P0/P1/P2 范围。

## 10. 开发顺序建议

### 10.1 第一阶段：按当前功能稳定边界

| 全栈 A | 全栈 B |
| --- | --- |
| 梳理模板、规则、任务、发送记录现状 | 梳理账号、权限、安全治理、审计现状 |
| 补齐 A 页面 UI/UX 改造结构 | 补齐 B 页面 UI/UX 改造结构 |
| 确认任务状态和发送状态展示 | 确认权限点、菜单和按钮规则 |

### 10.2 第二阶段：核心 UI/UX 重构

| 全栈 A | 全栈 B |
| --- | --- |
| 总览 Hero KPI、场景表现 | AppShell、导航、权限菜单 |
| 规则中心卡片化 | 登录、用户、权限页面统一视觉 |
| 任务中心状态分组 | 安全治理页面统一视觉 |
| 发送记录可读性优化 | 日志、导出、审批页面统一视觉 |

### 10.3 第三阶段：联调和验收

| 全栈 A | 全栈 B |
| --- | --- |
| 验证发送链路不受 UI 重构影响 | 验证权限、审计、安全校验不受 UI 重构影响 |
| 验证任务、规则、发送记录状态 | 验证白名单、黑名单、退订、频控拦截 |
| 验证统计指标展示 | 验证操作日志、批量、审批记录 |

## 11. 联调检查清单

每次联调至少检查：

1. 登录后菜单是否按角色展示。
2. 无权限页面是否展示 403。
3. 无权限接口是否返回 403。
4. 模板创建、启停是否正常。
5. 规则创建、启停是否正常。
6. 手动发送是否经过安全校验。
7. 自动任务执行是否经过安全校验。
8. 非白名单真实发送是否不调用 Provider。
9. 黑名单、退订、频控命中是否不调用 Provider。
10. 事件来源停用或鉴权失败是否写入接入日志。
11. 批量取消/批量重试是否产生批量任务记录。
12. 高风险规则启停是否能创建审批。
13. 关键写操作是否写入操作日志。
14. 短链点击是否能写入点击日志。
15. Provider 回执是否能更新发送记录。

## 12. 提交和分支建议

建议分支：

| 分支 | 主责 | 内容 |
| --- | --- | --- |
| `feature/v1-touch-growth` | A | 触达增长链路和 A 侧 UI/UX 重构 |
| `feature/v1-governance-security` | B | 治理安全链路和 B 侧 UI/UX 重构 |
| `feature/v1-ui-integration` | A/B | 导航、通用组件、联调和视觉收口 |

提交建议：

1. 每个 commit 只覆盖一个模块或一个明确闭环。
2. commit message 使用 `feat:`、`fix:`、`docs:`、`test:`、`refactor:` 前缀。
3. 涉及公共契约变更时，commit message 标明 `contract`。
4. 不在同一个 commit 里同时大改 A 主责模块和 B 主责模块，除非是在联调分支。
5. UI/UX 重构 commit 不应夹带业务逻辑、API 或数据库结构变更。

## 13. 最终边界总结

全栈 A：

> 负责触达增长链路。模板、规则、手动发送、事件、任务、发送记录、回执、短链、统计都归 A。

全栈 B：

> 负责治理安全链路。登录、用户、权限、白名单、黑名单、退订、发送控制、事件来源、操作日志、导出、批量、审批都归 B。

共享但必须先定契约：

> 菜单权限、发送前安全校验、操作日志、手机号处理、状态枚举、批量任务、审批、错误码、通用 UI 组件。

最重要的协作规则：

> A 不绕过 B 的权限和安全校验，B 不改写 A 的触达执行链路。交汇点先定契约，再写代码。
