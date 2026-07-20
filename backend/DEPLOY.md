# 服务器部署指南

本文档适用于 **单台 Linux 云服务器**（推荐 Ubuntu 22.04+，4 核 8G 内存起）通过 Docker Compose 部署。

---

## 一、你需要提供给我的信息

> **安全提示：请勿在聊天/邮件中明文发送密码。** 推荐 SSH 密钥登录；敏感项你自己填进服务器上的 `.env` 即可。

请按下面清单准备，发给我时 **密码类可以留空**，只说明「已在服务器 `.env` 填好」。

### 1. 服务器访问（必填）

| 项 | 示例 | 说明 |
|---|---|---|
| 公网 IP | `123.45.67.89` | 云厂商控制台可见 |
| SSH 端口 | `22` | 若非默认请说明 |
| SSH 用户名 | `root` 或 `ubuntu` | |
| 登录方式 | **SSH 私钥**（推荐） | 把公钥加到服务器；不建议共享 root 密码 |
| 操作系统 | Ubuntu 22.04 | |

### 2. 域名与 HTTPS（强烈建议）

| 项 | 示例 | 说明 |
|---|---|---|
| 域名 | `insurance.example.com` | 需已解析 A 记录到服务器 IP |
| 是否已有 SSL 证书 | 有 / 无 | 无则可用 Let's Encrypt 免费申请 |

> 若暂时没有域名，可先用 IP + HTTP 访问（`http://IP`），生产环境仍建议尽快上 HTTPS。

### 3. 应用密钥（你在服务器上自己生成，不必发给我）

在服务器执行：

```bash
# JWT 密钥
python3 -c "import secrets; print(secrets.token_urlsafe(48))"

# 病历加密密钥
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

填入 `.env` 的 `JWT_SECRET`、`FIELD_ENCRYPTION_KEY`。

### 4. 数据库 / 存储密码（你自己设定）

| 变量 | 说明 |
|---|---|
| `POSTGRES_PASSWORD` | PostgreSQL 密码 |
| `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` | 对象存储账号（或改用云 OSS） |

### 5. AI 能力（可选）

| 项 | 说明 |
|---|---|
| 是否启用 Vertex AI | 是 / 否（否则 AI 走 stub，可手动填字段） |
| GCP 项目 ID | 如 `my-project-123` |
| 服务账号 JSON | 放到服务器 `secrets/gcp-sa.json`（不要提交 Git） |

---

## 二、服务器最低要求

| 资源 | 建议 |
|---|---|
| CPU | 4 核+ |
| 内存 | 8 GB+ |
| 磁盘 | 40 GB+ SSD |
| 端口 | 开放 **80、443**（HTTP/HTTPS）；**不要**对公网开放 5432/6379/9000 |

需预装：**Docker 24+**、**Docker Compose v2**、**Git**。

```bash
# Ubuntu 一键装 Docker（官方脚本）
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
```

---

## 三、部署步骤（在服务器上执行）

### 1. 拉代码

```bash
cd /opt
git clone <你的仓库地址> baoxian
cd baoxian
```

### 2. 配置环境变量

```bash
cp .env.production.example .env
nano .env   # 按注释填写 PUBLIC_BASE_URL、密钥、密码等
```

### 3. 准备 Nginx 站点配置

```bash
cp deploy/nginx/conf.d/app.conf.template deploy/nginx/conf.d/app.conf
sed -i 's/YOUR_DOMAIN/insurance.example.com/g' deploy/nginx/conf.d/app.conf
mkdir -p deploy/certbot/www deploy/certbot/conf secrets
# 若无 GCP：touch secrets/gcp-sa.json
```

**首次申请 SSL 前**：可临时注释 `app.conf` 里 HTTPS server 块和 HTTP→HTTPS 跳转，只保留 80 端口反代，签完证再改回。

### 4. 构建并启动

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

### 5. 初始化数据

```bash
docker compose -f docker-compose.prod.yml exec api python -m src.seed
```

默认账号：

- 管理员：`admin` / `admin123`
- 医生：`doctor` / `doctor123`

**上线后请立即修改密码。**

### 6. 申请 HTTPS（Let's Encrypt，需域名）

```bash
docker run -it --rm \
  -v $(pwd)/deploy/certbot/www:/var/www/certbot \
  -v $(pwd)/deploy/certbot/conf:/etc/letsencrypt \
  certbot/certbot certonly --webroot -w /var/www/certbot \
  -d insurance.example.com --email your@email.com --agree-tos

docker compose -f docker-compose.prod.yml restart nginx
```

---

## 四、架构示意

```
用户浏览器
    │  https://your-domain.com
    ▼
┌─────────┐
│  nginx  │ :80 / :443
└────┬────┘
     ├── /          → web:3000   (Next.js)
     ├── /api/*     → api:8000   (FastAPI)
     └── /local-storage/* → api:8000

内网（不对外暴露）：
  postgres:5432 · redis:6379 · minio:9000 · worker(arq)
```

---

## 五、常用运维命令

```bash
# 查看状态
docker compose -f docker-compose.prod.yml ps

# 查看日志
docker compose -f docker-compose.prod.yml logs -f api web worker

# 更新部署
git pull
docker compose -f docker-compose.prod.yml up -d --build

# 数据库备份
docker compose -f docker-compose.prod.yml exec postgres \
  pg_dump -U insurance insurance > backup_$(date +%F).sql
```

---

## 六、发给我即可开始远程协助的最低信息

1. **服务器 IP**
2. **SSH 用户名 + 端口**（密钥已配置好，或说明如何添加我的公钥）
3. **域名**（有则提供，无则说明用 IP 访问）
4. **是否启用 Gemini AI**
5. 说明：「`.env` 里的密码和密钥已在服务器本地填好，无需经聊天传输」

收到以上信息后，可以在服务器上完成：环境检查 → 配置 `.env` → 构建镜像 → 启动服务 → 初始化种子数据 → 验证登录与医生端工作台。
