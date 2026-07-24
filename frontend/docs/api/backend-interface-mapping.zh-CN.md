# 后端接口映射台账

## 契约冻结基线

- 唯一 API 契约：`packages/types/openapi.json`
- SHA-256：`2DA722F905E7B7E9B2DE239E2939A36183669C00B0FD315F1BCD84613BCF4D5F`
- 生成日期：2026-07-19
- 统计：133 个操作，72 EXISTS、2 DRIFT、4 PARTIAL、46 MISSING、9 FUTURE-AUTH。

后续变更规则：先修改并评审 OpenAPI 契约，再同步生成 TypeScript 类型、接口清单和参考文档；后端不得私自增加前端调用接口或改变既有响应形状。

## 已复用后端的映射

| 契约功能域 | 契约前缀 | 新后端实现位置 | 当前状态 | 第 4 步重点 |
|---|---|---|---|---|
| 身份认证 | `/api/auth` | `backend/apps/api/src/modules/auth` | EXISTS | 登录/登出响应、Cookie 安全属性、错误格式 |
| 医生 Claims | `/api/doctor/claims` | `backend/apps/api/src/modules/claims` | EXISTS + DRIFT | `row_version`、字段确认、跨租户 404、PDF 语义 |
| 医生首页与保险公司 | `/api/doctor/home`、`/insurance-companies` | `backend/apps/api/src/modules/claims` | EXISTS | 列表/分页与 schema 对齐 |
| AI 辅助提取 | `/api/doctor/ai` | `backend/apps/api/src/modules/ai_extraction` | EXISTS | 503 降级和错误 envelope |
| 病历 PDF 提取 | `/api/doctor/extraction-tasks` | `backend/apps/api/src/modules/pdf_extraction` | EXISTS | 异步任务、进度、文件 URL |
| 诊所管理 | `/api/admin/clinics` | `backend/apps/api/src/modules/clinics` | EXISTS | 公司模板路径统一为 `insurance-companies` |
| 医生管理 | `/api/admin/doctors` | `backend/apps/api/src/modules/doctors` | EXISTS | 账号-诊所多对多为 P0 MISSING |
| 保险公司 | `/api/admin/insurance-companies` | `backend/apps/api/src/modules/insurance_companies` | EXISTS | schema、状态和文件上传 |
| 模板与字段 | `/api/admin/templates` | `backend/apps/api/src/modules/templates` | EXISTS | 字段删除 204、mapping 强类型响应 |
| 标准字段与规则 | `/api/admin/standard-fields` 等 | `backend/apps/api/src/modules/standard_fields` | EXISTS | schema 与状态枚举 |
| 使用统计 | `/api/admin/stats` | `backend/apps/api/src/modules/stats` | EXISTS | 与 analytics MISSING 区分 |

## 待实现功能域

| 优先级 | 契约状态 | 功能域 | 建议新模块 |
|---|---|---|---|
| P0 | DRIFT / PARTIAL | Claim 并发锁、管理端 Claims、审计日志 | `claims`、`admin_claims`、`audit` |
| P0 | MISSING | 医生-诊所多对多、账号管理 | `doctors`、`clinics` |
| P1 | MISSING | handoff、通知、文档收件箱、打印捕获 | `handoffs`、`notifications`、`documents` |
| P1 | MISSING | 后台分析、运营队列 | `analytics`、`onboarding` |
| P2 | MISSING | 工单、标签、模拟登录 | `tickets`、`tags`、`impersonation` |
| P2 | FUTURE-AUTH | MFA、恢复、诊所选择、会话刷新 | `auth` 扩展 |

## 每次接口改动的固定验证

```powershell
cd C:\Develop\baoxian-new\frontend
pnpm -F @acuity/types generate
pnpm -F @acuity/api-client verify
pnpm -F @acuity/api-client gen:endpoint-checklist
pnpm run gen:api-docs
```

接口实现完成后，再在真实后端模式下验证医生端和管理端页面，并补充后端的正常、401、404、409、422 和业务错误测试。
