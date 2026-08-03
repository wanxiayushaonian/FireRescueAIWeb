# FireRescueAI 服务器部署(外网服务器 + Docker)

目标:把 mcp-server 部署到外网服务器,让赛事方 agent(能访问外网)直接连
`http://<服务器IP>:8787/sse?appKey=...`,不再依赖 cloudflared 隧道。

## 架构

```
外网服务器
├── Docker: firerescue-bff   (Next.js standalone,端口 3000)
│     提供 /api/ustudio/* 取场景数据(连 fc.xwbuilders.com)
└── Docker: firerescue-mcp   (端口 8787,映射到宿主)
       MCP SSE,agent 直接连
       内部指向 http://bff:3000 (取场景数据)
```

## 部署步骤

### 1. 本机准备

```bash
source ~/.nvm/nvm.sh
cd /home/ljb/program/FireRescueAI/web

# 准备服务器 .env(真实值,从本机 .env.local 复制密钥)
cp deploy/.env.example deploy/.env
# 编辑 deploy/.env,填:
#   NEXT_PUBLIC_X_APP_KEY  <- 本机 .env.local 的同名值
#   MCP_APP_KEY            <- 生成一个强随机串
#   SCENE_ID               <- 真实 sceneId(如 463961468455870464)
```

### 2. 上传到服务器

```bash
rsync -avz --exclude node_modules --exclude .next --exclude .git \
  /home/ljb/program/FireRescueAI/web/ user@服务器IP:/opt/firerescue/
```

> 服务器需装 Docker + docker compose 插件。

### 3. 服务器上启动

```bash
ssh user@服务器IP
cd /opt/firerescue
docker compose -f deploy/docker-compose.yml up -d --build
```

### 4. 开放端口

mcp-server 端口 **8787**(docker-compose 已映射宿主 8787)。
需在服务器防火墙/安全组放行 8787 入站 TCP。

### 5. agent 连接地址

```
http://<服务器IP>:8787/sse?appKey=<MCP_APP_KEY>
```

在 dt-ustudio-agent-admin 配:
```json
{ "mcpServers": { "instance": { "url": "http://<服务器IP>:8787/sse?appKey=<MCP_APP_KEY>" } } }
```

## 验证

服务器上:
```bash
curl -s -o /dev/null -w "%{http_code}" "http://localhost:8787/sse?appKey=<MCP_APP_KEY>"
# 200 = 通
```

## 常见问题

- **agent 看不到工具**:确认 MCP_APP_KEY 与 admin URL 里的一致,端口已放行,`docker compose logs mcp` 无报错。
- **list_fire_devices 500**:检查 deploy/.env 的 NEXT_PUBLIC_X_APP_KEY、SCENE_ID 是否正确,`docker compose logs bff` 看 BFF 是否成功连 ustudio。
