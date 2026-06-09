# 文档地图

## 文档清单

| 文件 | 页数 | 定位 | 重点内容 |
| --- | ---: | --- | --- |
| `短信触达平台 V1 PRD.pdf` | 11 | 产品需求 | 背景目标、注册转化、会员召回、活动通知、售后回访、产品设计、验收标准 |
| `短信触达平台 V1 - 规则中心设计.pdf` | 6 | 规则配置说明 | 规则列表/详情/创建/编辑、规则字段、示例规则、执行流程、V1 限制 |
| `短信触达平台 V1 - 事件定义文档.pdf` | 4 | 业务事件契约 | 标准事件结构、用户注册、会员过期、活动开始、订单完成、事件来源 |
| `短信触达平台 V1 技术设计文档.pdf` | 17 | 技术方案 | 系统模块、核心流程、数据库表、API、规则执行、状态机、短链、统计、幂等、合规、排期 |
| `短信触达平台 V1.0 产品需求文档.md` | - | 产品需求 | 后台系统式结构化 PRD，包含背景、功能清单、权限、流程、页面需求、接口、异常和验收标准 |
| `frontend-commercial-ui-polish-plan.md` | - | 前端 UI 美化计划 | 从 demo 风格升级为商业化运营后台的视觉方向、组件清单、页面优先级、状态规范、验收标准和排期 |
| `two-fullstack-feature-split.md` | - | 双全栈协作拆分 | 两名全栈工程师的模块边界、接口边界、数据表边界、公共契约和冲突规避规则 |
| `api-interface-spec.md` | - | API 接口文档 | 按 PRD 和当前实现整理接口、请求参数、响应示例、错误码、已实现与规划差异 |
| `frontend-pages-and-write-api-count.md` | - | 页面与写接口统计 | 梳理当前前端页面、PRD 页面、弹窗详情、已实现和规划中的新增/修改接口数量 |
| `aliyun-sms-test-config.md` | - | 测试短信配置 | 阿里云测试通道、签名、模板、白名单、环境变量、发送前校验 |
| `backend-mvp-design.md` | - | 后端 MVP 设计 | 第一阶段后端范围、接口、数据模型、Provider、SDK 接入、验收标准 |
| `database-docker-prisma.md` | - | 数据库运行说明 | Docker PostgreSQL、Prisma migration、seed、验证命令 |
| `environment-and-startup.md` | - | 环境配置与启动说明 | Node、Docker、环境变量、首次启动、日常启动、worker、验证命令 |
| `capability-roadmap-and-integration.md` | - | 能力路线图 | 当前能力、核心缺口、后续步骤、线上系统事件联动示例 |
| `role-based-next-features.md` | - | 角色分工 | 产品、前端、后端后续功能、协作顺序和排期建议 |
| `implementation-coverage.md` | - | 实现覆盖说明 | 当前代码相对 V1 文档的覆盖情况、测试版处理方式和后续生产化事项 |

## 按角色阅读

| 角色 | 必读 | 关注点 |
| --- | --- | --- |
| 产品/运营 | PRD、规则中心设计、项目摘要、能力路线图、角色分工 | 业务场景、规则配置、指标口径、V1 不做内容、后续扩展 |
| 后端 | 技术设计、事件定义、规则中心设计、环境配置与启动说明、数据库运行说明、角色分工 | 事件接收、规则匹配、任务生成、短信服务商、回执、短链、幂等、数据库迁移 |
| 前端 | PRD、规则中心设计、接口文档、角色分工、前端 UI 美化计划 | 模板管理、规则管理、手动发送、发送记录、统计页、商业化后台体验 |
| 测试 | PRD、规则中心设计、事件定义、接口文档、技术设计验收标准 | 四类事件、规则触发、状态流转、短链点击、统计口径 |
| 运维/安全 | 技术设计、环境配置与启动说明 | 部署建议、日志、失败处理、手机号脱敏、批量发送限制、worker 开关 |
| 短信联调 | 阿里云短信测试配置、技术设计 | 测试签名、模板参数、白名单、OpenAPI 返回记录 |
| MVP 开发 | 环境配置与启动说明、后端 MVP 设计、数据库运行说明、阿里云短信测试配置、双全栈协作拆分 | mock 默认通道、SDK Provider、发送日志、基础统计、数据库启动、并行开发边界 |
| 线上联动 | 能力路线图、事件定义、技术设计 | 事件签名、业务系统对接、条件校验、任务调度 |

## 推荐阅读路径

### 产品和运营

1. `短信触达平台 V1 PRD.pdf`
2. `短信触达平台 V1 - 规则中心设计.pdf`
3. [项目摘要](project-summary.md) 中的 V1 范围、业务场景、验收标准

### 开发实现

1. [项目摘要](project-summary.md)
2. [环境配置与启动说明](environment-and-startup.md)
3. [能力梳理、核心路线图与线上事件联动](capability-roadmap-and-integration.md)
4. [产品、前端、后端后续功能分工](role-based-next-features.md)
5. [前端 UI 商业化美化计划](frontend-commercial-ui-polish-plan.md)
6. [双全栈功能拆分与协作边界](two-fullstack-feature-split.md)
7. [API 接口文档](api-interface-spec.md)
8. [前端页面与新增/修改接口梳理](frontend-pages-and-write-api-count.md)
9. [后端 MVP 设计](backend-mvp-design.md)
10. [数据库与本地 Docker 环境](database-docker-prisma.md)
11. [阿里云短信测试配置](aliyun-sms-test-config.md)
12. `短信触达平台 V1 技术设计文档.pdf`
13. `短信触达平台 V1 - 事件定义文档.pdf`
14. `短信触达平台 V1 - 规则中心设计.pdf`

### 测试验收

1. [项目摘要](project-summary.md) 中的验收标准
2. PRD 的业务验收标准
3. 技术设计的第 17 节验收标准
4. [API 接口文档](api-interface-spec.md)
5. 事件定义和规则中心设计中的 V1 支持范围

## 文档关系

```mermaid
flowchart LR
  PRD["PRD\n定义为什么做、做什么"] --> Rule["规则中心设计\n定义运营如何配置规则"]
  PRD --> Event["事件定义\n定义业务系统如何触发"]
  Rule --> Tech["技术设计\n定义如何实现"]
  Event --> Tech
  Tech --> Accept["验收\n接口、状态、统计、链路闭环"]
```

## 维护建议

- PDF 作为原始版本保留，不建议直接改名或移动。
- 新增需求、接口变更、字段变更优先同步到 Markdown 摘要，再回写正式设计文档。
- 如进入 V2，建议新增 `v2-scope.md`，单独沉淀用户分群、AB 实验、营销旅程、转化归因等能力。
