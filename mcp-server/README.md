# FireRescueAI MCP Server

Agent → 场景 的 MCP 工具桥(v1 SDK,SSE 传输)。

## 运行
```bash
source ~/.nvm/nvm.sh
cd mcp-server
cp .env.example .env   # 填入真实 MCP_APP_KEY / SCENE_ID 等
npm install
npm run dev            # 监听 :8787,/sse?appKey=...
```

## 用 MCP inspector 验证 SSE
```bash
npx @modelcontextprotocol/inspector
```
Inspector 里选 "SSE" transport,URL 填 `http://localhost:8787/sse?appKey=<你的 MCP_APP_KEY>`,应能 List Tools 看到 `ping`,Call 它应返回 `pong: ...`。

## 暴露给赛事方 agent
```bash
# 本机起 cloudflare 隧道(或 ngrok http 8787)
cloudflared tunnel --url http://localhost:8787
```
把得到的 `https://<tunnel>.trycloudflare.com/sse?appKey=<MCP_APP_KEY>` 填进 `dt-ustudio-agent-admin` 的 `mcpServers.instance.url`。

## 已知数据形态(Phase 0 集成实测,2026-08-03)

**`list_fire_devices`**(复用 BFF `POST /api/ustudio/overview`,body `{ sceneIds: [SCENE_ID] }`)返回 `{ results: [...] }` 中的首个对象,实测结构:
```json
{ "sceneId": "463961468455870464", "storyCount": 41, "deviceCount": 3839, "fireDeviceCount": 407, "ok": true }
```
⚠️ 该端点只返回**统计数字,不含设备 id/名称清单**。agent 无法直接从 `list_fire_devices` 拿到 `fly_to` 所需的 target id。Phase 0 回退为"返回 overview 原文供 agent 理解";**Phase 1 需加专用 `fire-devices` 端点**(含 id/name)。

**`fly_to`**:经内存 pub/sub → `GET /scene-events`(SSE)推给浏览器,实测收到:
```json
{ "id": "cmd_...", "tool": "fly_to", "args": { "target": "468794779843497984" }, "ts": 1785737682405 }
```
浏览器端 `SceneCommandBridge` 订阅 `/scene-events` → `dispatch` → `sdk.fly(target)`。

**场景**:真实 sceneId 可从 `GET /api/ustudio/instances` 拿(取 `scene_id` 字段),示例 `463961468455870464`。消防设备 id 示例 `468794779843497984`(twins 类型 `ClosedSprinklerHead` 等,来自 instances 的 `twins_instance_id`)。
