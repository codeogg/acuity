#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PYTHON="${PYTHON:-/opt/homebrew/bin/python3.12}"

if [[ ! -x "$PYTHON" ]]; then
  PYTHON="$(command -v python3.12 || command -v python3)"
fi

echo "==> 启动基础设施 (postgres / redis / minio)"
docker compose -f "$ROOT/docker-compose.yml" up -d postgres redis minio

echo "==> 等待 postgres 就绪..."
for i in {1..30}; do
  if docker compose -f "$ROOT/docker-compose.yml" exec -T postgres pg_isready -U postgres >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

echo "==> 准备 Python 虚拟环境"
cd "$ROOT/apps/api"
if [[ ! -d .venv ]]; then
  "$PYTHON" -m venv .venv
fi
source .venv/bin/activate
pip install -q -e ".[dev,ocr]"

echo "==> 初始化种子数据"
python -m src.seed

echo "==> 安装前端依赖"
cd "$ROOT/apps/web"
if [[ ! -d node_modules ]]; then
  npm install
fi

echo ""
echo "本地环境已就绪，可以开始调试："
echo "  - 在 Cursor 运行调试配置「全栈本地调试」"
echo "  - 或手动启动："
echo "      cd apps/api && source .venv/bin/activate && uvicorn src.main:app --reload --port 8000"
echo "      cd apps/web && npm run dev"
echo ""
echo "访问地址："
echo "  前端  http://localhost:3000"
echo "  后端  http://localhost:8000/docs"
echo "  账号  admin / admin123  |  doctor / doctor123"
