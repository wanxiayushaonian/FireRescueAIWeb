# 增量第 2 步:web 对接 znya 后端(执勤力量链路打通)

- 日期:2026-08-05
- 范围:web 加 `/api/business/*` 代理到 znya server,打通第一条业务链路(执勤力量 `/fire-stations`);含架构修正(第 2 步"新建 Python 后端"改为"对接 znya")
- 关联:
  - 架构纲领:`2026-08-05-incremental-integration-architecture.md`(**修正其第 2 步与 A1/B1 决策**)
  - znya 项目:`/home/ljb/program/FireRescueAI/znya_jjxf119/`(主项目,server=FastAPI 后端 + client=Vue 前端)
  - 原型数据契约:`web/src/mock/types.ts`(Station/ResourceItem)

## 背景与架构修正

架构 spec 原定第 2 步"新建 Python 后端(FastAPI + PostgreSQL,A1/B1)"。排查发现 **znya_jjxf119/server/ 已是完整 FastAPI 后端**:

- `fire-rescue-backend` v0.1.0,FastAPI + SQLAlchemy 2.0 + PostgreSQL 16 + Redis + APScheduler + Alembic + JWT
- **21 router / 157 接口**:auth / key-buildings / key-units / fire-stations / fire-facilities / water-sources / fire-objects / hazard-materials / disadvantage-positions / panoramas / related-documents / drawings / plans / v1-ai(SSE) / ai_models / knowledge / dict_items / tool_usage / share / upload / health
- fire_rescue.db 完整 schema(47 表),app/models + app/services 完整,onboarding 7 步 + CRUD factory,基线 96 tests
- CLAUDE.md 明示:FireRescueAI 主项目,数据采集 MVP 完整 + 预案骨架 + 平台管理部分

**修正决策**:
- 第 2 步不再新建后端 → **web 对接 znya**(消费其 API)
- web 是 znya/client 的升级替代(Q1 A 用户确认)—— 3D 化新前端,最终替代 Vue client
- A1/B1 决策作废("新建 FastAPI + 业务 MCP");若后续要业务 MCP,可在 znya 侧加(不在本步)

## 链路验证(已完成 2026-08-05)

| 项 | 结果 |
|---|---|
| znya 启动 | `uvicorn main:app --port 8000` → `health:200`(依赖 docker PG `fire-rescue-postgres` + Redis,均已 Up) |
| 认证 | `POST /auth/login {admin/admin123}` → JWT(role admin) |
| 请求头 | **`Authorization: Bearer {token}`**(注意:非外部 API 文档的 `Access-Token`) |
| `/fire-stations/` | 200,分页 `{total, page, page_size, items}` |
| 字段 | id / name / station_type / brigade / address / longitude / latitude / district_code / duty_phone / status / extra_attrs / ai_description / created_by / updated_by / created_at |
| 数据 | 当前 1 条测试数据(消防站1) |

## 设计(web 对接 znya)

### 1. web 代理:`app/api/business/[...path]/route.ts`

catch-all 转发到 znya:
- 目标:`ZNYA_BASE_URL + /{path}`(env,默认 `http://localhost:8000`;部署服务器时改)
- 透传:path / query / method / body
- 认证:带 service JWT(`Authorization: Bearer`)

> Next API route 转发:用 `fetch(znyaUrl, { method, headers, body })`,流式/JSON 都透传。

### 2. service JWT(web BFF 侧,前端无感)

- module 级缓存:`{ token, expiresAt }`(解析 JWT `exp` 或按 znya token 有效期)
- 未缓存/将过期 → BFF 调 znya `/auth/login`(凭证 `ZNYA_ADMIN_USER`/`ZNYA_ADMIN_PASSWORD`,env)拿新 token
- 前端不持 znya token;调 `/api/business/*` 即可

### 3. 第一个接口:执勤力量

- web `GET /api/business/fire-stations` → znya `/fire-stations/`(带 token)
- 供原型 `ForceResourcePanel`(态势总览)后续替换 mock(本步只打通接口,不替换 UI)

### 4. 配置(env,web `.env.local`)

- `ZNYA_BASE_URL`(本地 `http://localhost:8000`)
- `ZNYA_ADMIN_USER` / `ZNYA_ADMIN_PASSWORD`(service 凭证,默认 admin/admin123;生产换真实)

## 边界(第 2 步不做)

- 不替换原型全部 mock(只打通代理基础设施 + fire-stations 列表链路)
- 不新建后端(znya 已存在)
- **不动 znya**(只消费其 API;改 znya 是别的任务)
- 建筑档案 id 对齐、预案、考核等模块的 mock 替换 —— 留后续步骤
- 原型 `ForceResourcePanel` 的 UI 替换 mock —— 本步只验证链路,UI 替换另做

## 验证标准

- znya 跑(8000)+ web `npm run dev`
- `GET /api/business/fire-stations` → 200 + znya 数据(fire-stations 列表)
- 前端**不持 znya token** 也能通(BFF service JWT 兜底)
- 401/过期 → BFF 自动刷新 token 重试
- `typecheck` + `build` 绿,`vitest` 不回归

## 风险点

1. **znya 依赖环境**:需要 docker PG(`fire-rescue-postgres`)+ Redis 起,且 fire_rescue 库已迁移(本步验证已起,但 web 联调时若 znya 不在要说明)
2. **JWT 过期刷新**:service token 过期要静默刷新;实现时注意并发(多请求同时过期 → 单次刷新)
3. **CORS**:web 代理是服务端转发(非浏览器直连 znya),无 CORS 问题;若未来浏览器直连 znya 才需要(znya 已有 CORSMiddleware)
4. **路径透传**:znya 部分接口带尾斜杠(`/fire-stations/`)、部分无——代理保留原始 path(不 normalize),前端按 znya 实际路径调
