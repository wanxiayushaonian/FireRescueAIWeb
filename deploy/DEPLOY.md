# FireRescueAI 部署

## 方式一:CI/CD 自动部署(推荐)

代码 push 到 GitHub master → GitHub Actions 构建两个镜像推 GHCR → SSH 到服务器拉取重启。

### 前置(一次性)

1. **GitHub 仓库**:把项目推到 GitHub(仓库名决定 GHCR 镜像名)。
2. **GitHub Secrets**(仓库 Settings → Secrets):
   | Secret | 值 |
   |--------|----|
   | `GHCR_TOKEN` | 有 `write:packages` 权限的 Personal Access Token(或 GitHub App token) |
   | `SERVER_HOST` | 服务器 IP/域名 |
   | `SERVER_USER` | SSH 用户名 |
   | `SERVER_SSH_KEY` | 服务器部署用的 SSH 私钥(OpenSSH 格式) |
   | `SERVER_PORT` | SSH 端口(默认 22,可省略) |
   | `NEXT_PUBLIC_X_APP_KEY` | 场景数据密钥(与服务器 `deploy/.env` 同值,必配) |
   | `NEXT_PUBLIC_USTUDIO_BASE` | uStudio 网关(默认 `https://fc.xwbuilders.com`,可省略) |
   | `NEXT_PUBLIC_SCENE_EVENTS_URL` | 命令流订阅地址(默认走同源 `/api/scene-events`,留空即可) |
   | `NEXT_PUBLIC_LOCALE` | 界面语言(默认 `zh-CN`,可省略) |
3. **服务器准备**:
   - 装 Docker + compose 插件
   - 建目录 `/opt/firerescue` 并 `git clone` 本仓库(部署 job 会 `git pull` 同步 compose),然后配 `deploy/.env`(真实密钥)
   - 服务器 `.env` 放真实值:`NEXT_PUBLIC_X_APP_KEY`、`MCP_APP_KEY`、`SCENE_ID`、`NEXT_PUBLIC_USTUDIO_BASE` 等
   - 开放 **8787**(agent 连 mcp)+ **3000**(前端页面 / BFF)入站 TCP

### 流程

```
git push origin master
   ↓ GitHub Actions
   ├─ 构建 firerescue-<repo>-bff / -mcp → 推 ghcr.io
   └─ SSH 到服务器: compose pull + up -d
```

### agent 连接地址

```
http://<SERVER_HOST>:8787/sse?appKey=<MCP_APP_KEY>
```

## 方式二:手动部署(备选/本地验证)

```bash
# 本机构建验证
docker build -f deploy/Dockerfile.bff -t firerescue-bff:test .
docker build -f deploy/Dockerfile.mcp -t firerescue-mcp:test mcp-server

# 本地起整套
cd deploy
cp .env.example .env   # 填真实值
docker compose up -d --build

# 验证
curl -s -o /dev/null -w "%{http_code}" "http://localhost:8787/sse?appKey=<MCP_APP_KEY>"   # 200
```

## 验证清单

- `docker compose -f deploy/docker-compose.yml ps` 两个容器 Up
- `curl .../sse?appKey=<key>` 返回 200(或 SSE 挂起)
- agent 配 `http://<host>:8787/sse?appKey=<key>` 能列出 list_fire_devices / fly_to
- `list_fire_devices` 返回 total 407 等真实数据
