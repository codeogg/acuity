# Acuity 后端迁移与改造执行计划

## 目标与边界

目标：复用 C:\Develop\baoxian 的 FastAPI 业务能力，在当前工作目录 C:\Develop\baoxian-new 下演化为新前端的真实后台；以 frontend/packages/types/openapi.json 为唯一接口标准。

最终目录：

    C:\Develop\baoxian-new\
    ├─ frontend\          # Next.js 前端、契约、Mock、测试
    └─ backend\           # FastAPI、PostgreSQL、Redis、Worker、对象存储

不要把 Python 后端放入 pnpm monorepo，也不再改造 baoxian/apps/web 旧前端。本次仅新增此文档。

## 阶段总览

| 阶段 | 交付物 | 通过条件 |
|---|---|---|
| 0 | 可复现基线 | 两端原始质量检查有记录 |
| 1 | 契约与差异台账 | OpenAPI 校验通过，接口责任明确 |
| 2 | 独立后端目录/仓库 | 后端脱离旧前端独立启动 |
| 3 | 真实请求通道 | app/admin 关闭 MSW 后访问后端 |
| 4 | 已有 72 接口对齐 | 核心流程真实运行 |
| 5 | P0 缺失能力 | 数据一致性、权限、审计具备 |
| 6 | P1/P2 功能补齐 | 按功能域移除 Mock 依赖 |
| 7 | 生产化交付 | 发布、回滚、E2E 验证完成 |

规则：一次只推进一个阶段；未通过验收不进入下一阶段。每次改动放入独立 Git 提交，并保留命令输出与失败日志。

---

## 第 0 步：建立基线

### 工作内容

1. 记录两仓库的分支、commit 和未提交修改。
2. 安装依赖，运行新前端的契约、类型、Lint 检查。
3. 启动旧后端，验证数据库迁移、种子数据和健康检查。
4. 以 Mock 模式记录登录、医生端、管理端关键流程结果。
5. 本步不改 API 契约、数据库和 Mock 设置。

### 执行命令

    cd C:\Develop\baoxian
    git status --short
    git rev-parse HEAD

    cd C:\Develop\baoxian-new\frontend
    git status --short
    git rev-parse HEAD
    pnpm install --frozen-lockfile
    pnpm -F @acuity/api-client verify
    pnpm typecheck
    pnpm lint

后端（需要 PostgreSQL、Redis 与 .env 已配置）：

    cd C:\Develop\baoxian\apps\api
    python -m venv .venv
    .\.venv\Scripts\Activate.ps1
    pip install -e ".[dev]"
    alembic upgrade head
    python -m src.seed
    uvicorn src.main:app --reload --port 8000

另开终端：

    Invoke-RestMethod http://localhost:8000/health

### 合格标准与排查

- pnpm -F @acuity/api-client verify、pnpm typecheck、pnpm lint 均通过；既存失败必须记录。
- 健康检查返回 status=ok。
- 已保存 commit、环境变量模板（不含密钥）、质量结果和 Mock 基线。
- pnpm 安装失败时确认 Node >=20、corepack enable、pnpm 版本；数据库失败时优先检查 DATABASE_URL、端口及 Alembic 首个报错；启动失败时先保存 traceback，禁止在本步改业务。

---

## 第 1 步：固化 API 契约与差异台账

### 工作内容

以 packages/types/openapi.json 为唯一 source of truth。任何后端接口、字段、状态码变更都必须先审查契约，再写实现。

使用 docs/api/implementation-notes.md 与 docs/api/endpoint-checklist.md 建立接口台账：操作名、契约路径、旧 router/schema/service、目标实现、测试、状态、风险。

当前总量：133 个操作 = 72 EXISTS、2 DRIFT、4 PARTIAL、46 MISSING、9 FUTURE-AUTH。第一轮只处理 72 个已有接口和核心 DRIFT。

跨域约束：

- 路径 /api/{auth,doctor,admin}，字段 snake_case；
- 分页 {items,total,page,page_size}；
- 业务错误 {error:{code,message}}，请求校验保留 FastAPI 422；
- 跨租户访问返回 404；
- Claim 写操作支持 row_version，旧版本返回 409；
- 成功响应为裸对象/数组，无 data 包装。

### 执行命令

    cd C:\Develop\baoxian-new\frontend
    pnpm -F @acuity/types generate
    pnpm -F @acuity/api-client verify
    pnpm -F @acuity/api-client gen:endpoint-checklist
    pnpm run gen:api-docs

### 合格标准与排查

- 四条命令均通过，生成文件变化可解释。
- 每个准备改造的接口都能追溯到旧后端实现或标记为新建。
- verify 失败时按 operationId 检查 OpenAPI、typed endpoint、MSW handler、registry 是否同步，不可绕过校验。

---

## 第 2 步：独立后端迁移

### 工作内容

在当前目录创建 C:\Develop\baoxian-new\backend（推荐保留 Git 历史），迁入：

    apps/api/
    db/
    deploy/
    scripts/
    docker-compose.yml
    docker-compose.prod.yml
    .env.example
    .env.production.example

不迁入 apps/web。保留 FastAPI、SQLAlchemy、Alembic、PostgreSQL、Redis、arq、对象存储和 OCR/AI 管线。修改 README、Compose 服务名和环境变量说明，使其不再引用旧前端；本阶段不重写接口。

### 调试命令

    cd C:\Develop\baoxian-new\backend
    Copy-Item .env.example .env
    docker compose up -d postgres redis
    cd .\apps\api
    .\.venv\Scripts\Activate.ps1
    alembic upgrade head
    python -m src.seed
    uvicorn src.main:app --reload --port 8000

必要时单独验证 worker：

    arq src.tasks.worker.WorkerSettings

### 合格标准与排查

- 后端不依赖 baoxian/apps/web 即能启动。
- 空数据库可运行 alembic upgrade head，种子数据可初始化。
- /health、/docs、登录接口正常。
- .env、凭据、数据库卷均未提交。
- Compose/worker 失效时，全局检索旧项目名称、服务名和过期相对路径。

---

## 第 3 步：接通真实后端

### 工作内容

浏览器始终请求同源 /api/*，Next.js 代理到 FastAPI。先接网络与认证，不要求所有页面立即可用；每个响应差异记录到第 4 步。

创建且不提交：

apps/app/.env.local：

    NEXT_PUBLIC_API_MOCKING=disabled
    API_PROXY_TARGET=http://localhost:8000

apps/admin/.env.local：

    NEXT_PUBLIC_API_MOCKING=disabled
    NEXT_PUBLIC_API_BASE=/api

管理端当前有开发期 Mock API route；真实后端稳定后，移除该兜底路由或明确 rewrite，不能让 Mock 与后端同时响应。

### 调试命令

    # 终端 1
    cd C:\Develop\baoxian-new\backend\apps\api
    uvicorn src.main:app --reload --port 8000

    # 终端 2
    cd C:\Develop\baoxian-new\frontend
    pnpm --filter @acuity/app dev

    # 终端 3
    pnpm --filter @acuity/admin dev

浏览器 Network 必须确认请求为 localhost:3000/api/* 或 localhost:3002/api/*、没有 MSW/service worker 拦截、后端日志实际收到请求、登录后存在同源 access_token Cookie 或 Bearer token。

### 合格标准与排查

- login、GET /api/auth/me、health 都由 FastAPI 返回。
- 无 CORS、Cookie 被拒绝、代理 404 或 Mixed Content。
- 仍是 Mock：重启 Next dev server；NEXT_PUBLIC 变量在启动时注入。
- 登录后 401：检查 Cookie domain/SameSite、access_token 名称及认证依赖。
- /api 404：确认 API_PROXY_TARGET、后端端口和 next.config.ts rewrite。

---

## 第 4 步：对齐已有 72 个接口

### 实施顺序

1. auth：login/logout/me/change-password 与 Cookie/错误格式。
2. doctor claims：列表、创建、详情、草稿、AI、字段、确认、PDF、打印。
3. admin core：clinic、doctor、company、template、standard field、transform rule。
4. 文件和异步任务：上传、解析、进度、PDF 预览/下载。

### 必须修复的差异

- Claim 增加 row_version；陈旧写返回标准 409。
- fields 更新保存 confirmed 字段确认状态。
- clinic template 路径使用 insurance-companies，旧路径仅作短期别名。
- 删除模板字段返回 204。
- mapping 保存返回 FieldMappingSaveResult。
- logout 返回 SuccessResponse。
- 所有跨租户详情、更新、文件访问均为 404。

### 单接口验证法

1. 从 OpenAPI 读取请求、响应、状态码。
2. 用 Swagger/HTTP 客户端验证：正常、401、404、422、409、业务错误。
3. 对照后端 /openapi.json 与前端契约，核对字段、可空性、枚举、分页、错误信封。
4. 禁用 Mock 后在实际页面完成流程。
5. 补充后端自动化测试；先写可复现测试再修 bug。

### 合格标准

- 每个对齐接口至少有一条后端测试。
- app/admin 对应主流程在关闭 Mock 时可用。
- 运行：pnpm -F @acuity/api-client verify、pnpm typecheck、pnpm lint、pnpm test。

---

## 第 5 步：实现 P0 缺失能力

范围：

1. Claim 字段确认、intake text、row_version、永久删除规则。
2. admin claims 总览与详情，按 PHI 脱敏策略返回。
3. 审计事件：写入/查询 operation_log。
4. 医生-诊所多对多：关联、解除、原子替换、状态管理。
5. 基础安全：cookie secure 环境化、登录限流、角色与租户边界。

数据库规则：

- 每项 schema 变动使用 Alembic 新迁移。
- 每个迁移在空库和已有开发数据验证。
- 可回滚提供 downgrade；不可安全回滚必须说明恢复方案。

合格标准：并发写 Claim 时陈旧版本稳定返回 409；审计不记录密码、JWT、病历正文、完整签名 URL；admin/doctor 不能越权；P0 页面关闭 Mock 后可端到端运行。

---

## 第 6 步：按功能域补齐 P1/P2

| 批次 | 功能域 |
|---|---|
| P1-A | handoff、notifications、document inbox、print captures |
| P1-B | doctor settings、support access、coverage registry |
| P1-C | analytics、admin claims、onboarding queue |
| P2-A | tickets、tags、saved views、impersonation |
| P2-B | MFA、恢复、clinic 选择、refresh、re-auth |

每批固定流程：确认权限/状态机/保留策略 → 如需则更新 OpenAPI → 类型/文档生成 → Alembic/model/service/router/测试 → 页面关闭 Mock → 前后端回归。

合格标准：真实后端运行时完成页面流程；权限、分页、错误格式、幂等性和审计行为均有测试；已上线接口同步更新 registry 状态，不继续标记 MISSING。

---

## 第 7 步：生产化与发布

- 分离 dev/test/prod 环境、数据库、对象存储和密钥。
- PDF、病历、模板使用签名 URL；生产不得使用公开永久文件链接。
- 建立 DB 备份/恢复、迁移发布顺序、worker/Redis 监控、结构化日志与错误追踪。
- 在测试环境完整执行发布和回滚演练。

前端发布门禁：

    cd C:\Develop\baoxian-new\frontend
    pnpm typecheck
    pnpm lint
    pnpm test
    pnpm build
    pnpm test:e2e

同时运行后端测试及真实后端 E2E，至少覆盖登录、创建 claim、病历上传、AI 提取、人工确认、PDF 生成/打印、后台模板配置，以及 AI 不可用、并发冲突、会话过期。

合格标准：空环境可按文档部署且备份可恢复；真实后端核心 E2E 全通过；HTTPS 下 cookie secure、CORS 白名单、限流和密钥管理已生效；发布版本、Alembic 版本和回滚步骤均有记录。

---

## 后续委托格式

后续请按以下格式让我执行，我将只改该范围内容：

    执行第 N 步（或第 N 步的功能域）。
    范围：……
    是否允许修改数据库迁移：是/否。
    验收目标：……

完成后我会提供修改文件、数据库迁移说明、启动命令、验证结果、风险与下一步建议。涉及既有数据、生产密钥或部署环境的动作，会先单独说明。
