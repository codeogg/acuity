# 香港诊所保险保单智能填报 SaaS 系统

基于两份规格文档搭建的 monorepo：

- **前端** `apps/web`：Next.js 15(App Router) + TypeScript(strict) + Tailwind CSS v4 + shadcn/ui(Radix) + React Aria
- **后端** `apps/api`：Python 3.12 + FastAPI(async) + SQLAlchemy 2.0 + Alembic + arq
- **基础设施**：PostgreSQL 16 + Redis + S3 协议对象存储 + Google Vertex AI Gemini

## 目录结构

```
保险填报/
├── docker-compose.yml          # 本地一键起 postgres / redis / api / worker / web
├── db/init.sql                 # 数据库初始化 DDL（首次启动 postgres 自动执行）
├── .env.example                # 环境变量模板
├── apps/
│   ├── api/                    # FastAPI 后端（OpenAPI 契约源）
│   └── web/                    # Next.js 前端
└── 最终版-*.md                 # 需求与技术架构文档
```

## 快速开始

### 方式一：Docker（推荐）

```bash
cp .env.example .env           # 按需修改
docker compose up -d postgres redis
docker compose up api worker web
```

- 前端：http://localhost:3000
- 后端：http://localhost:8000  （Swagger UI: http://localhost:8000/docs）

### 方式二：本地手动启动

前置：本机已运行 PostgreSQL 16 与 Redis。

**后端**

```bash
cd apps/api
python -m venv .venv
# Windows: .venv\Scripts\activate    macOS/Linux: source .venv/bin/activate
pip install -e ".[dev]"
# 初始化数据库（二选一）
#   a) 直接执行 DDL：  psql "$DATABASE_URL" -f ../../db/init.sql
#   b) 用 Alembic：    alembic upgrade head
uvicorn src.main:app --reload --port 8000
# 另开一个终端启动异步 worker：
arq src.tasks.worker.WorkerSettings
```

**前端**

```bash
cd apps/web
npm install
# 依据后端 OpenAPI 生成类型（后端需已启动）
npm run gen:api
npm run dev
```

## 默认账号

首次启动后端会通过种子脚本（`python -m src.seed`）创建：

- 超级管理员：`admin / admin123`
- 示例诊所医生：`doctor / doctor123`

> 生产环境务必修改，并按《技术架构详细方案》第 3.3 节完成 Vertex AI / 密钥管理等上线清单。

## 开发优先级（对应规格文档）

- **一期(MVP)**：基础数据 → 标准字段库 → 模板上传+人工标注 → AI 病历识别 → PDF 生成 → 填报流程
- **二期**：AI 辅助字段识别 → 模板版本管理 → 统计报表
