# znya 后端 + Python MCP 部署规划(架构 B1)

> 2026-08-07 创建 ｜ **2026-08-14 更新:已部署完成,生产实测可用**(见下方「部署现状(2026-08-14 实测)」)。

## 部署现状(2026-08-14 实测)

生产服务器 `111.75.149.221`(SSH user@2222,项目目录 `~/jjxf/`)上 znya 已完整运行:

| 容器 | 端口 | 状态 |
|---|---|---|
| `znya-backend` | 9100(仅容器网络) | ✅ Up |
| `znya-mcp` | **8788 对外**(`znya-backend:latest`,MCP_TRANSPORT=sse) | ✅ Up,鉴权生效(`?appKey=` 校验,实测无 key 返回 401) |
| `znya-postgres` / `znya-redis` | 容器网络 | ✅ Up |

**实测通过**:
- BFF `/api/business/*` → `http://znya-backend:9100` 全通(如 `/api/business/fire-stations` 返回 552 条真实数据)。
- 生产 BFF/MCP 的 `MCP_APP_KEY` 一致(4cd9...),`/api/scene-events` 代理返回 `: connected`。
- znya MCP 的 `MCP_APP_KEY` 与 Node MCP(8787)**不同值**(两套独立服务,平台 agent 需分别配对应 key)。

**生产配置来源**:`~/jjxf/FireRescueAIWeb/deploy/.env`(已同步至本仓库 `web/deploy/.env`)。znya compose 在 `~/jjxf/znya/docker-compose.yml`。

**待确认(平台侧,非代码)**:平台 agent admin 里 znya MCP(8788)与 Node 场景 MCP(8787)的 `mcpServers` URL/appKey 是否都已配置正确。

## 原规划(2026-08-07,保留备查)

## 现状

| 资产 | 状态 |
|---|---|
| `znya/docker-compose.yml` | postgres + redis + backend(9100)+ worker + frontend(80) |
| `znya/server/Dockerfile` | python:3.10-slim,uvicorn main:app 9100 |
| `znya/DEPLOY_DOCKER.md` | 服务器部署手册(上传 /opt/fire-rescue + docker compose up) |
| **znya Python MCP**(app/mcp,8788 SSE) | ✅ 本地已通(FastMCP,工具 ping/query_units/query_stations/plan_dispatch) |
| **实际部署** | ❌ 未执行(用户确认) |

## 部署目标

1. znya 业务后端(API 9100 + PostgreSQL + Redis)上线 — 业务数据(执勤/警情/单位)在服务器
2. **znya Python MCP(8788,SSE)上线** — 业务大脑给 agent(plan_dispatch 等)

## 部署架构

```
外网
 ├─ Node mcp-server(已部署)   : 场景命令 show_route / fly_to / focus_*
 ├─ 🆕 znya API(9100)         : 业务数据(执勤/警情/重点单位/消防站)
 ├─ 🆕 znya Python MCP(8788)  : plan_dispatch / query_units / query_stations
 └─ web 前端(BFF /api/business)
```

## 步骤

1. **docker-compose 加 mcp 服务**(`server.py` 用 FastMCP `run(transport="sse")`,自带 uvicorn,已本地验证 SSE 握手):
   ```yaml
   mcp:
     build: ./server
     container_name: fire-rescue-mcp
     profiles: ["fullstack"]
     command: python -m app.mcp.server   # FastMCP run(transport="sse") 自带 uvicorn
     environment:
       - DATABASE_URL=postgresql://fire_rescue:fire_rescue@postgres:5432/fire_rescue
       - MCP_APP_KEY=${MCP_APP_KEY:-replace-with-real-appkey}
       - AMAP_KEY=${AMAP_KEY:-}
     ports:
       - "8788:8788"
     depends_on: [postgres]
     networks: [fire-rescue-network]
   ```
2. 上传 znya 到服务器 `/opt/fire-rescue` + `docker compose up -d --build`
3. 开放端口 **9100 + 8788**(ufw / 云安全组)
4. **appKey 鉴权**(待实现):FastMCP SSE 默认无鉴权,需在 server.py 加 Starlette middleware 校验 `?appKey=`(参照 Node mcp-server 的 `checkAppKey`)
5. 平台 agent 配置(admin):
   - znya 业务 MCP:`http://<server-ip>:8788/sse?appKey=<MCP_APP_KEY>`
   - Node 场景 MCP:已有

## 待办 / 风险

- [ ] **appKey 鉴权**(znya MCP):FastMCP SSE 需 middleware 校验 `?appKey=`(参照 Node `checkAppKey` 常量时间比较)
- [ ] docker-compose 加 mcp 服务 + 端口暴露(8788)
- [ ] 平台 agent 是否支持 znya MCP 的 SSE URL(参照 Node `/sse?appKey=`,Phase 0 已验证该形态)
- [ ] 高德 key(AMAP_KEY)配置到 mcp 容器环境
- [ ] DB 迁移在服务器执行(alembic upgrade head)
- [ ] server/Dockerfile 的 `python:3.10-slim` 是否满足 FastMCP 依赖(需在镜像构建时 `uv add fastmcp` 或 requirements 含 fastmcp)

## 决策备注

- **传输**:用 `run(transport="sse")`(已本地验证 SSE 握手),与平台 agent(Phase 0 SSE)兼容;FastMCP 的 `http_app`(Streamable HTTP)是 v2 标准,若平台 agent 支持可切换
- **单进程**:`run()` 自带 uvicorn 单进程,MCP 低并发够用;后续如需多进程改用 `http_app` + 外部 uvicorn `--workers`
- **鉴权**:MCP_APP_KEY 走环境变量(不入镜像/git)
