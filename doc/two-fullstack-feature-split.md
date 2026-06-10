# 双全栈功能拆分与协作边界

## 1. 文档目的

本文用于指导短信触达平台 V1.0 由两名全栈工程师并行开发时的功能拆分、代码边界和协作规则。

目标不是把人拆成“前端”和“后端”，而是让每个人负责一条完整业务链路，减少跨人等待和代码冲突。

核心原则：

1. 每个人都负责自己模块的前端页面、后端接口、数据模型、权限校验和测试。
2. 公共基础能力先定契约，再由主责人实现，另一人只接入使用。
3. 尽量避免两个人同时修改同一页面、同一接口、同一张表、同一个状态机。
4. 涉及真实发送、安全开关、权限、手机号明文、操作日志的改动必须先同步。

## 2. 总体拆分

| 角色 | 方向 | 一句话边界 |
| --- | --- | --- |
| 全栈 A | 触达主链路 | 负责“短信怎么被生成、怎么发出去、怎么看结果” |
| 全栈 B | 治理与安全链路 | 负责“谁能进来、谁能操作、哪些号码能发、出问题怎么追责” |

推荐排期方式：

1. 第一阶段共同定公共契约：接口返回、错误码、权限、操作日志、手机号处理、数据库 migration 规则。
2. 第二阶段各自开发主责模块，按照本文边界推进。
3. 第三阶段围绕发送前安全校验、权限校验、日志审计和验收用例联调。

## 3. 全栈 A：触达主链路

### 3.1 模块归属

全栈 A 主责以下模块：

| 一级模块 | 二级模块 | 说明 |
| --- | --- | --- |
| 运营总览 | 指标概览、最近发送、待处理任务 | 展示触达运行情况 |
| 短信模板 | 模板列表、详情、新建、编辑、变量预览、测试发送 | 提供可发送短信内容 |
| 规则中心 | 规则列表、详情、新建、编辑、测试、影响范围、草稿、发布、回滚 | 决定什么事件触发什么短信 |
| 手动发送 | 单手机号发送 | 支持运营手动触达 |
| 事件触发 | 事件流水、模拟触发 | 支持联调业务事件 |
| 任务队列 | 任务列表、任务详情、重试、取消、执行到期任务 | 管理待发送和失败任务 |
| 发送记录 | 发送日志、详情、测试环境标记送达 | 查询每次发送尝试 |
| 回执与短链 | 服务商回执、短链跳转、点击日志 | 沉淀送达和点击结果 |
| 统计分析 | 趋势、维度、漏斗 | 做基础效果复盘 |

### 3.2 前端页面边界

全栈 A 负责开发和维护：

| 页面 | 路径建议 | 说明 |
| --- | --- | --- |
| 运营总览 | `/dashboard` | 发送量、成功量、失败量、待发送、点击量、CTR、拦截量 |
| 模板列表 | `/templates` | 查询、新建、复制、启停、测试发送入口 |
| 模板详情 | `/templates/:id` | 基础信息、变量配置、预览、关联规则、发送效果 |
| 规则列表 | `/rules` | 查询、创建、复制、启停、草稿状态 |
| 规则详情 | `/rules/:id` | 条件、模板、版本、测试结果、影响范围 |
| 规则编辑 | `/rules/:id/edit` | 编辑单事件、单条件、单动作规则 |
| 规则测试 | `/rules/:id/test` 或弹窗 | 输入模拟 payload，展示命中结果和短信预览 |
| 手动发送 | `/manual-send` | 选择模板、输入手机号和变量，提交发送 |
| 事件流水 | `/events` | 查询事件、查看匹配规则和生成任务 |
| 模拟事件 | `/events/simulate` 或弹窗 | 构造测试事件，不依赖真实业务系统 |
| 任务列表 | `/tasks` | 查询任务状态、重试、取消、批量操作入口 |
| 任务详情 | `/tasks/:id` | 展示事件、规则、模板、安全校验、发送日志、回执、短链 |
| 发送记录列表 | `/send-logs` | 查询发送明细、Provider 返回和回执 |
| 发送记录详情 | `/send-logs/:id` | 展示请求、响应、回执、短链和点击 |
| 统计分析 | `/stats` | 趋势、维度、漏斗 |

全栈 A 不直接负责登录页、用户管理、白名单、黑名单、退订、发送控制、操作日志、事件来源管理页面。需要跳转或展示相关结果时，通过全栈 B 提供的接口和组件使用。

### 3.2.1 任务中心交互要求

任务中心由全栈 A 负责实现，不作为全栈 B 的后续任务。该页面需要让用户第一眼看到“哪里有任务、每条任务是什么状态、不同状态能做什么”。

页面操作：

| 操作 | 说明 | 全栈归属 |
| --- | --- | --- |
| 执行到期任务 | 扫描并执行 `pending` 且已到计划时间的任务 | A |
| 批量取消 | 对当前筛选结果中的 `pending` 任务生成批量取消动作 | A 发起，B 记录批次和审计 |
| 批量重试 | 对当前筛选结果中的 `failed` 任务生成批量重试动作 | A 发起，B 记录批次和审计 |
| 单条取消 | `pending` 任务行展示取消按钮 | A |
| 单条重试 | `failed` 且未超过最大重试次数的任务行展示重试按钮 | A |
| 查看原因 | `blocked/skipped/failed` 任务展示可读原因和详情入口 | A |

状态与按钮：

| 状态 | 行级按钮 |
| --- | --- |
| `pending` | 取消、详情 |
| `sending` | 详情 |
| `success` | 详情、发送记录 |
| `failed` | 重试、详情 |
| `blocked` | 查看原因、详情 |
| `skipped` | 查看原因、详情 |
| `cancelled` | 详情 |

B 的边界是提供权限、批量任务记录、操作日志、白名单/黑名单/退订/频控等治理结果；A 负责任务列表、任务详情、状态解释、单条操作和执行链路。

### 3.3 后端接口边界

全栈 A 主责以下接口：

| 接口 | 方法 | 说明 |
| --- | --- | --- |
| `/api/dashboard` | GET | 查询运营总览 |
| `/api/templates` | GET/POST | 查询和创建模板 |
| `/api/templates/{id}` | GET/PATCH | 查询和编辑模板 |
| `/api/templates/{id}/copy` | POST | 复制模板 |
| `/api/templates/{id}/preview` | POST | 模板变量预览 |
| `/api/templates/{id}/test-send` | POST | 模板测试发送 |
| `/api/templates/{id}/status` | PATCH | 启停模板 |
| `/api/rules` | GET/POST | 查询和创建规则 |
| `/api/rules/{id}` | GET/PATCH | 查询和编辑规则 |
| `/api/rules/{id}/copy` | POST | 复制规则 |
| `/api/rules/{id}/test` | POST | 规则测试 |
| `/api/rules/{id}/impact` | GET | 影响范围预估 |
| `/api/rules/{id}/drafts` | POST | 保存规则草稿 |
| `/api/rules/{id}/publish` | POST | 发布规则 |
| `/api/rules/{id}/rollback` | POST | 回滚版本 |
| `/api/rules/{id}/versions` | GET | 查询版本 |
| `/api/rules/{id}/status` | PATCH | 启停规则 |
| `/api/manual-send` | POST | 手动发送 |
| `/api/events` | GET/POST | 查询事件流水、接收测试事件 |
| `/api/tasks` | GET | 查询任务 |
| `/api/tasks/{id}` | GET | 查询任务详情 |
| `/api/tasks/{id}/retry` | POST | 重试失败任务 |
| `/api/tasks/{id}/cancel` | POST | 取消待发送任务 |
| `/api/tasks/batch-retry` | POST | 批量重试 |
| `/api/tasks/batch-cancel` | POST | 批量取消 |
| `/api/tasks/run-due` | POST | 执行到期任务 |
| `/api/send-logs` | GET | 查询发送记录 |
| `/api/send-logs/{id}` | GET | 查询发送记录详情 |
| `/api/send-logs/{id}/mark-delivered` | POST | 测试环境标记送达 |
| `/api/sms/provider/callback` | POST | 接收服务商回执 |
| `/api/receipts` | GET | 查询回执 |
| `/api/click-logs` | GET | 查询点击日志 |
| `/api/stats/overview` | GET | 统计概览 |
| `/api/stats/trends` | GET | 趋势分析 |
| `/api/stats/dimensions` | GET | 维度分析 |
| `/api/stats/funnel` | GET | 漏斗分析 |
| `/s/{shortCode}` | GET | 短链跳转 |

接口注意事项：

1. 所有写接口必须调用权限校验中间件。
2. 手动发送、测试发送、任务执行前必须调用全栈 B 提供的发送前安全校验服务。
3. 新建、编辑、启停、发送、重试、取消、标记送达等操作必须调用操作日志 helper。
4. 不在 A 侧自行实现白名单、黑名单、退订、频控逻辑，只调用统一安全校验服务。

### 3.4 数据表边界

全栈 A 主责以下表：

| 表 | 说明 |
| --- | --- |
| `sms_template` | 短信模板 |
| `sms_rule` | 自动触达规则 |
| `sms_rule_version` | 规则版本 |
| `sms_event` | 业务事件 |
| `sms_task` | 发送任务 |
| `sms_send_log` | 发送请求和 Provider 响应日志 |
| `sms_receipt` | 回执记录 |
| `sms_short_link` | 短链配置 |
| `sms_click_log` | 点击日志 |

A 修改这些表结构前，需要检查是否影响 B 的统计、导出、操作日志、安全校验和权限判断。

## 4. 全栈 B：治理与安全链路

### 4.1 模块归属

全栈 B 主责以下模块：

| 一级模块 | 二级模块 | 说明 |
| --- | --- | --- |
| 登录与账号 | 登录、退出、忘记密码、重置密码、设置密码、注册申请 | 管理后台入口 |
| 用户与角色 | 用户管理、注册申请审核、内置角色说明、角色权限配置 | 管理后台用户和内置角色 |
| 权限控制 | 菜单、路由、按钮、接口鉴权 | 控制谁能看、谁能操作 |
| 白名单管理 | 查询、添加、启停、导出 | 控制真实发送范围 |
| 黑名单与退订 | 黑名单、退订记录 | 触达拦截 |
| 发送频控 | 日频控、周频控、场景冷却、安静时段 | 防骚扰 |
| 发送控制 | Provider、worker、短链、验证码、频控、事件来源 | 管理短信发送的通道、开关和安全保护 |
| 事件来源 | appId、secret、启停、重置密钥 | 管理业务系统接入 |
| 事件接入日志 | 查询、详情 | 排查上报问题 |
| 操作日志 | 查询、详情、导出 | 审计关键操作 |
| 数据导出 | 导出任务、下载 | 列表和统计导出 |
| 批量操作 | 批量任务、明细 | 批量取消、批量重试、导入结果 |
| 轻量审批 | 审批单、处理记录 | 高风险操作单级审批 |

### 4.2 前端页面边界

全栈 B 负责开发和维护：

| 页面 | 路径建议 | 说明 |
| --- | --- | --- |
| 登录页 | `/login` | 账号密码登录 |
| 注册申请页 | `/register/apply` | 用户提交账号申请和密码 |
| 忘记密码页 | `/forgot-password` | 验证码校验并重置密码 |
| 设置密码页 | `/set-password` | 管理员创建账号或重置密码后设置密码 |
| 用户列表 | `/users` | 查询、新建、编辑、启停、解锁、重置密码，并内联查看角色详情 |
| 用户详情 | `/users/:id` | 用户信息、角色、权限说明、状态、登录记录 |
| 注册申请审核 | `/users/register-requests` | 审核通过、驳回、分配角色 |
| 内置角色详情 | 用户管理内联弹窗或用户详情内联区域 | 展示管理员、运营、只读内置权限说明，不单独设置菜单 |
| 白名单管理 | `/settings/whitelist` | 查询、添加、启停、导出 |
| 黑名单管理 | `/blacklist` | 查询、添加、移除、导入 |
| 退订管理 | `/unsubscribes` | 查询、新增、导入、详情 |
| 发送控制 | `/settings` | Provider、worker、短链、验证码、频控 |
| 事件来源管理 | `/settings/event-sources` | appId、secret、启停、重置密钥 |
| 事件接入日志 | `/settings/event-source-logs` | 查询和详情 |
| 操作日志 | `/operation-logs` | 查询、详情、导出 |
| 导出任务 | `/export-tasks` | 查询、下载 |
| 批量操作 | `/batch-jobs` | 批次列表和明细 |
| 审批记录 | `/approvals` | 审批列表、详情、通过、驳回、撤回 |
| 无权限页 | `/403` | 路由无权限提示 |

B 不直接负责模板、规则、任务、发送记录、统计的业务页面实现。但 B 需要提供权限组件、安全校验结果展示规范、操作日志接口，供 A 使用。

### 4.3 后端接口边界

全栈 B 主责以下接口：

| 接口 | 方法 | 说明 |
| --- | --- | --- |
| `/api/auth/register-request` | POST | 提交注册申请 |
| `/api/auth/register-requests` | GET | 查询注册申请 |
| `/api/auth/register-requests/{id}` | GET | 注册申请详情 |
| `/api/auth/register-requests/{id}/approve` | POST | 审核通过并分配角色 |
| `/api/auth/register-requests/{id}/reject` | POST | 驳回申请 |
| `/api/auth/set-password` | POST | 设置密码 |
| `/api/auth/login` | POST | 登录 |
| `/api/auth/logout` | POST | 退出 |
| `/api/auth/forgot-password/send-code` | POST | 发送验证码 |
| `/api/auth/forgot-password/verify-code` | POST | 校验验证码 |
| `/api/auth/reset-password` | POST | 重置密码 |
| `/api/auth/change-password` | POST | 登录后改密 |
| `/api/auth/me` | GET | 当前用户和权限 |
| `/api/users` | GET/POST | 用户列表和创建账号 |
| `/api/users/{id}` | GET | 用户详情 |
| `/api/users/{id}/update` | POST | 编辑用户信息和角色 |
| `/api/users/{id}/status` | POST | 启用、禁用、锁定、解锁 |
| `/api/users/{id}/reset-password` | POST | 管理员重置密码 |
| `/api/roles` | GET | 内置角色列表 |
| `/api/roles/{id}` | GET | 角色详情 |
| `/api/whitelist` | GET/POST | 查询和添加白名单 |
| `/api/whitelist/{id}` | GET | 白名单详情 |
| `/api/whitelist/{id}/update` | POST | 编辑白名单备注 |
| `/api/whitelist/{id}/status` | POST | 启停白名单 |
| `/api/whitelist/export` | POST | 导出白名单 |
| `/api/blacklist` | GET/POST | 查询和添加黑名单 |
| `/api/blacklist/{id}` | GET | 黑名单详情 |
| `/api/blacklist/import` | POST | 批量导入黑名单 |
| `/api/blacklist/{id}/remove` | POST | 移除黑名单 |
| `/api/unsubscribes` | GET/POST | 查询和新增退订 |
| `/api/unsubscribes/{id}` | GET | 退订详情 |
| `/api/unsubscribes/import` | POST | 批量导入退订 |
| `/api/settings` | GET | 查询系统配置 |
| `/api/settings/update` | POST | 修改系统配置 |
| `/api/event-sources` | GET/POST | 查询和创建事件来源 |
| `/api/event-sources/{id}` | GET | 事件来源详情 |
| `/api/event-sources/{id}/update` | POST | 编辑事件来源 |
| `/api/event-sources/{id}/status` | POST | 启停事件来源 |
| `/api/event-sources/{id}/reset-secret` | POST | 重置密钥 |
| `/api/event-source-logs` | GET | 查询事件接入日志 |
| `/api/event-source-logs/{id}` | GET | 事件接入日志详情 |
| `/api/operation-logs` | GET | 查询操作日志 |
| `/api/operation-logs/{id}` | GET | 操作日志详情 |
| `/api/export-tasks` | GET/POST | 查询和创建导出任务 |
| `/api/export-tasks/{id}` | GET | 导出任务详情 |
| `/api/export-tasks/{id}/download` | GET | 下载导出文件 |
| `/api/batch-jobs` | GET | 查询批量任务 |
| `/api/batch-jobs/{id}` | GET | 批量任务详情 |
| `/api/approvals` | GET/POST | 查询和创建审批单 |
| `/api/approvals/{id}` | GET | 审批详情 |
| `/api/approvals/{id}/approve` | POST | 通过审批 |
| `/api/approvals/{id}/reject` | POST | 驳回审批 |
| `/api/approvals/{id}/withdraw` | POST | 撤回审批 |

### 4.4 数据表边界

全栈 B 主责以下表：

| 表 | 说明 |
| --- | --- |
| `admin_user` | 后台用户 |
| `admin_role` | 内置角色 |
| `admin_user_role` | 用户角色关系 |
| `auth_verification_code` | 验证码 |
| `auth_register_request` | 注册申请 |
| `auth_password_setup_token` | 设置密码 token |
| `auth_session` | 登录会话 |
| `admin_operation_log` | 操作日志 |
| `sms_whitelist` | 白名单 |
| `sms_blacklist` | 黑名单 |
| `sms_unsubscribe` | 退订记录 |
| `sms_frequency_policy` | 频控策略 |
| `system_setting` | 系统配置 |
| `event_source` | 事件来源 |
| `event_source_log` | 事件接入日志 |
| `export_task` | 导出任务 |
| `batch_job` | 批量操作任务 |
| `batch_job_item` | 批量操作明细 |
| `approval_order` | 审批单 |
| `approval_record` | 审批处理记录 |

B 修改这些表结构前，需要检查是否影响 A 的发送前校验、任务执行、统计、导出和事件接入。

## 5. 公共契约

以下能力属于公共能力，必须先约定再开发。主责人负责实现，另一人只通过约定接口或 helper 使用。

| 公共能力 | 主责 | 使用方 | 约定内容 |
| --- | --- | --- | --- |
| 接口返回结构 | 共同 | A/B | 成功响应、错误响应、分页结构、错误码 |
| 权限中间件 | B | A/B | 后端接口角色校验、前端菜单/按钮权限 |
| `/api/auth/me` | B | A | 当前用户、角色、菜单权限、操作权限 |
| 手机号处理 | B | A/B | 脱敏展示、加密/hash 存储、查询方式 |
| 操作日志 helper | B | A/B | 操作人、模块、对象、动作、前后差异、IP |
| 发送前安全校验 | B | A | 白名单、黑名单、退订、频控、安静时段、worker、Provider |
| mock Provider | A | A/B | 测试发送、发送记录、回执模拟 |
| 状态枚举 | 共同 | A/B | task、sendLog、template、rule、approval、account 状态 |
| 数据库 migration 规范 | 共同 | A/B | 命名、生成顺序、回滚策略、seed |
| 错误码 | 共同 | A/B | `PHONE_NOT_IN_WHITELIST`、`PERMISSION_DENIED` 等统一命名 |

### 5.1 发送前安全校验契约

A 在以下场景必须调用 B 提供的发送前安全校验：

1. 模板测试发送。
2. 手动发送。
3. 自动任务执行。
4. 失败任务重试。
5. 批量任务执行。

建议返回结构：

```json
{
  "passed": true,
  "finalAction": "send",
  "checks": {
    "provider": "passed",
    "worker": "passed",
    "whitelist": "passed",
    "blacklist": "passed",
    "unsubscribe": "passed",
    "frequency": "passed",
    "quietHours": "passed"
  },
  "blockedReason": null,
  "nextPlanTime": null
}
```

当 `passed=false` 时，A 不允许调用短信服务商，并按返回结果将任务标记为 `blocked` 或 `skipped`。

### 5.2 操作日志契约

A/B 在以下操作必须写操作日志：

1. 模板新建、编辑、启用、停用、测试发送。
2. 规则新建、编辑、复制、测试、发布、回滚、启用、停用。
3. 手动发送、任务重试、任务取消、批量操作。
4. Provider、worker、白名单、黑名单、退订、频控、事件来源配置变更。
5. 创建账号、审核注册申请、禁用账号、重置密码、修改角色。
6. 导出任务创建、下载、过期访问。

建议日志字段：

| 字段 | 说明 |
| --- | --- |
| `operatorId` | 操作人 |
| `module` | 模块 |
| `action` | 操作类型 |
| `targetType` | 操作对象类型 |
| `targetId` | 操作对象 ID |
| `before` | 操作前快照 |
| `after` | 操作后快照 |
| `result` | 成功或失败 |
| `ip` | 请求 IP |
| `userAgent` | 浏览器或调用方 |

### 5.3 权限契约

V1.0 只支持内置角色，不提供独立角色菜单；非管理员角色的权限树配置内联在用户管理中完成。

内置角色：

1. 管理员。
2. 运营。
3. 只读。

规则：

1. 前端根据 `/api/auth/me` 渲染菜单和按钮。
2. 后端接口必须独立校验角色权限。
3. 无权限页面返回无权限页，不加载业务数据。
4. 无权限接口返回 403。
5. 管理员修改用户角色后，下次接口鉴权立即生效。

## 6. 禁止跨边界直接修改的区域

为减少冲突，以下规则需要严格遵守。

| 区域 | 规则 |
| --- | --- |
| A 主责页面 | B 不直接改模板、规则、任务、发送记录、统计页面，除非只接入权限组件且提前同步 |
| B 主责页面 | A 不直接改登录、用户、权限、白名单、黑名单、发送控制、日志页面 |
| A 主责接口 | B 不直接改模板、规则、任务、发送记录、统计接口业务逻辑 |
| B 主责接口 | A 不直接改鉴权、用户、白名单、黑名单、频控、配置、日志接口业务逻辑 |
| 共享 helper | 改动前必须同步，尤其是权限、手机号、安全校验、操作日志 |
| 状态枚举 | 改动前必须同步并更新 PRD、接口文档、测试用例 |
| 数据表字段 | 修改非自己主责表前必须同步主责人 |
| migration | 每次只解决当前模块需求，不把无关表结构一起改掉 |

允许跨边界的情况：

1. 修复阻塞主链路的 bug，但需要在提交信息里说明影响范围。
2. 接入已约定的公共 helper 或组件。
3. 调整类型定义以适配已确认的接口契约。
4. 补测试用例覆盖对方提供的公共契约。

## 7. 分支和提交建议

建议拆分为小分支，避免一个大分支堆太久。

| 分支 | 主责 | 内容 |
| --- | --- | --- |
| `feature/v1-auth-governance` | B | 登录、用户、角色、权限、白名单、黑名单、配置 |
| `feature/v1-touch-core` | A | 模板、规则、事件、任务、发送记录、统计 |
| `feature/v1-integration` | A/B | 发送前安全校验、操作日志、联调修复 |

提交建议：

1. 每个 commit 只覆盖一个模块或一个明确闭环。
2. commit message 使用 `feat:`、`fix:`、`docs:`、`test:`、`refactor:` 前缀。
3. 涉及公共契约变更时，commit message 标明 `contract`。
4. 不在同一个 commit 里同时改 A 主责模块和 B 主责模块，除非是联调分支。

## 8. 开发顺序

### 8.1 第 0 阶段：共同准备

| 任务 | 主责 | 输出 |
| --- | --- | --- |
| 接口返回结构 | 共同 | response schema |
| 错误码 | 共同 | error code list |
| 数据库 migration 规范 | 共同 | migration 命名和执行规则 |
| 状态枚举 | 共同 | enum 文件或常量 |
| 菜单结构 | B 主导 | menu config |
| Provider mock 方案 | A 主导 | mock send provider |

### 8.2 第 1 阶段：基础骨架

| 全栈 A | 全栈 B |
| --- | --- |
| 模板 CRUD | 登录/退出 |
| 规则 CRUD | 用户管理 |
| 事件流水 | 内置角色权限 |
| 任务模型 | 发送控制基础 |
| mock Provider | 白名单基础 |

### 8.3 第 2 阶段：主链路跑通

| 全栈 A | 全栈 B |
| --- | --- |
| 事件触发生成任务 | 发送前安全校验 |
| 手动发送 | 黑名单、退订、频控 |
| 执行到期任务 | worker、Provider 开关 |
| 发送记录 | 操作日志 helper |
| 回执和短链 | 事件来源鉴权 |

### 8.4 第 3 阶段：排查和验收

| 全栈 A | 全栈 B |
| --- | --- |
| 任务详情完整链路 | 操作日志详情 |
| 发送记录详情 | 事件接入日志详情 |
| 统计分析 | 权限回归 |
| 批量任务接入 | 导出、审批、批量操作 |
| 回执标记送达 | 安全验收 |

## 9. 联调检查清单

每次联调至少检查：

1. 登录后菜单是否按角色展示。
2. 无权限接口是否返回 403。
3. 模板测试发送是否经过白名单校验。
4. 手动发送是否经过白名单、黑名单、退订、频控、安静时段校验。
5. 自动任务执行是否经过同一套安全校验。
6. 非白名单真实发送是否不调用 Provider。
7. 黑名单和退订命中是否不调用 Provider。
8. 任务取消后 worker 是否不再执行。
9. Provider 回执是否能更新发送记录。
10. 短链点击是否能写入点击日志。
11. 关键写操作是否写入操作日志。
12. 事件来源停用或签名失败是否写入事件接入日志。

## 10. 修改前同步规则

以下改动必须先同步，否则容易造成返工：

1. 新增或修改任务状态、发送状态、规则状态、模板状态。
2. 修改发送前安全校验逻辑。
3. 修改手机号存储、脱敏、查询规则。
4. 修改 `/api/auth/me` 返回结构。
5. 修改权限矩阵或菜单结构。
6. 修改 Provider、worker、白名单、黑名单、退订、频控配置。
7. 修改 `sms_task`、`sms_send_log`、`admin_user`、`system_setting` 这类核心表。
8. 新增批量操作或导出逻辑。
9. 新增审批前置条件。
10. 调整 PRD 中 P0/P1/P2 范围。

## 11. 验收责任

| 验收项 | 主责 | 协作 |
| --- | --- | --- |
| 模板、规则、事件、任务、发送记录闭环 | A | B 提供安全校验和权限 |
| 登录、用户、角色、权限闭环 | B | A 接入权限 |
| 白名单、黑名单、退订、频控拦截 | B | A 在发送前调用 |
| mock Provider 到发送记录 | A | B 校验配置 |
| 操作日志覆盖 | B | A 调用 helper |
| 事件接入鉴权和日志 | B | A 使用接收后的事件 |
| 统计分析 | A | B 提供权限和导出约束 |
| 数据导出、批量操作、审批 | B | A 提供任务和发送记录数据源 |

## 12. 最终边界总结

全栈 A 的边界：

> 负责触达主链路。模板、规则、事件、任务、发送、回执、短链、统计都归 A。

全栈 B 的边界：

> 负责治理和安全链路。登录、用户、权限、白名单、黑名单、退订、频控、发送控制、日志、导出、审批都归 B。

两人交汇点：

> 发送前安全校验、权限校验、操作日志、手机号处理、状态枚举、接口错误码。

交汇点要先定契约，再写代码。只要这个规则守住，后期冲突会少很多。
