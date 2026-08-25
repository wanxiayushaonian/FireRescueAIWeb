#!/usr/bin/env bash
# FireRescueAI 服务器一键部署脚本(方案 B 手动部署)
# 用法:在项目目录里执行(如 ~/jjxf/FireRescueAIWeb),需已装 Docker + compose 插件。
set -euo pipefail

# 自动用当前目录(clone 项目根),无需硬编码 /opt
APP_DIR="$(pwd)"
echo "==> 部署目录: $APP_DIR"

# 1. 检查 Docker
command -v docker >/dev/null 2>&1 || { echo "❌ 未安装 Docker,先装:"; echo "   curl -fsSL https://get.docker.com | sh"; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "❌ 未安装 docker compose 插件"; exit 1; }

# 2. 确保目录结构
mkdir -p "$APP_DIR/deploy"

# 3. 提示准备 .env
if [ ! -f "$APP_DIR/deploy/.env" ]; then
  echo "==> 未找到 $APP_DIR/deploy/.env,已从模板复制,请编辑填入真实值!"
  cp /dev/null "$APP_DIR/deploy/.env"
  cat > "$APP_DIR/deploy/.env" <<'ENVEOF'
# ===== firerescue-bff =====
NEXT_PUBLIC_X_APP_KEY=REPLACE_ME
NEXT_PUBLIC_USTUDIO_BASE=https://fc.xwbuilders.com
USTUDIO_GATEWAY=https://fc.xwbuilders.com
NEXT_PUBLIC_LOCALE=zh-CN
# ===== firerescue-mcp =====
MCP_APP_KEY=REPLACE_WITH_STRONG_KEY
MCP_PORT=8787
WEB_BFF_URL=http://bff:3000
SCENE_ID=REPLACE_ME
CORS_ORIGIN=
ENVEOF
  echo "   vim $APP_DIR/deploy/.env   # 填 NEXT_PUBLIC_X_APP_KEY / MCP_APP_KEY / SCENE_ID"
  echo "   填完后重新运行本脚本"
  exit 0
fi

echo "==> .env 已存在"
# 占位符检查:拦截 REPLACE_ME / REPLACE_WITH / replace-with / <...>,避免 source 报错或 build 注入失败
if grep -qE 'REPLACE_ME|REPLACE_WITH|replace-with|<[^>]+>' "$APP_DIR/deploy/.env"; then
  echo "❌ .env 里还有占位符,先全部填真实值:"
  grep -nE 'REPLACE_ME|REPLACE_WITH|replace-with|<[^>]+>' "$APP_DIR/deploy/.env"
  exit 1
fi

# 4. 构建并启动
cd "$APP_DIR"
# NEXT_PUBLIC_* 是 build 时固化进客户端 bundle,必须从 deploy/.env 读出经 --build-arg 传入
set -a; . "$APP_DIR/deploy/.env"; set +a
echo "==> 构建 BFF 镜像(注入 NEXT_PUBLIC_*)..."
docker build -f deploy/Dockerfile.bff \
  --build-arg NEXT_PUBLIC_X_APP_KEY="${NEXT_PUBLIC_X_APP_KEY-}" \
  --build-arg NEXT_PUBLIC_USTUDIO_BASE="${NEXT_PUBLIC_USTUDIO_BASE-}" \
  --build-arg NEXT_PUBLIC_SCENE_EVENTS_URL="${NEXT_PUBLIC_SCENE_EVENTS_URL-}" \
  --build-arg NEXT_PUBLIC_LOCALE="${NEXT_PUBLIC_LOCALE-}" \
  --build-arg NEXT_PUBLIC_OBJECTS_APP_ID="${NEXT_PUBLIC_OBJECTS_APP_ID-}" \
  --build-arg NEXT_PUBLIC_TRAINING_APP_ID="${NEXT_PUBLIC_TRAINING_APP_ID-}" \
  --build-arg NEXT_PUBLIC_COMMAND_APP_ID="${NEXT_PUBLIC_COMMAND_APP_ID-}" \
  --build-arg NEXT_PUBLIC_DRILL_COMMANDER_APP_ID="${NEXT_PUBLIC_DRILL_COMMANDER_APP_ID-}" \
  --build-arg NEXT_PUBLIC_ADVERSARY_APP_ID="${NEXT_PUBLIC_ADVERSARY_APP_ID-}" \
  --build-arg NEXT_PUBLIC_EVALUATE_APP_ID="${NEXT_PUBLIC_EVALUATE_APP_ID-}" \
  --build-arg NEXT_PUBLIC_GLOBAL_AGENT_APP_ID="${NEXT_PUBLIC_GLOBAL_AGENT_APP_ID-}" \
  --build-arg NEXT_PUBLIC_DRILL_PLANNER_APP_ID="${NEXT_PUBLIC_DRILL_PLANNER_APP_ID-}" \
  -t firerescue-bff:local .
echo "==> 构建 MCP 镜像..."
docker build -f deploy/Dockerfile.mcp -t firerescue-mcp:local mcp-server

# 5. 用 compose 起(覆盖 image 为本地构建)
export IMAGE_BFF=firerescue-bff
export IMAGE_MCP=firerescue-mcp
export TAG=local
cd "$APP_DIR/deploy"
docker compose up -d --remove-orphans --wait --wait-timeout 180
docker image prune -f || true

echo "==> 部署完成!"
echo "   BFF health: http://localhost:3000/api/health"
echo "   MCP health: http://localhost:8787/healthz"
echo "   agent 连接: http://<本机公网IP>:8787/sse?appKey=<MCP_APP_KEY>"
echo "   (需在防火墙/安全组放行 8787)"
