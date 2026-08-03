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

**`list_fire_devices`**(复用 BFF `GET /api/ustudio/tree?sceneId=`,拍平过滤 6 类消防设备标识)返回:
```json
{
  "total": 407,
  "devices": [
    { "id": "f1be1f3e-...", "name": "灭火器箱", "type": "ExtinguisherCabinet" },
    { "id": "2640d3f7-...", "name": "照明灯", "type": "EmergencyLightingFixture" }
  ],
  "truncated": true,
  "overview": { "sceneId": "463961468455870464", "storyCount": 41, "deviceCount": 3839, "fireDeviceCount": 407, "ok": true }
}
```
- `devices[].id` = `out_instance_id`,正是 `fly_to` 的 target。
- `total` 与 overview 的 `fireDeviceCount` 交叉验证一致(407)。
- 全量 407 条,`truncated: true` 时只返回前 50 条 + `overview`,防 token 爆炸。
- 消防类型标识(与前端 `lib/fire-types.ts` 同步副本,在 `bff-client.ts` 维护):
  `StandaloneSmokeAlarm / EmergencyLightingFixture / PortableCO2Extinguisher / ExtinguisherCabinet / HydrantButton / ClosedSprinklerHead`。
- 历史:原复用 `POST /api/ustudio/overview` 只返回统计数字(无设备 id),Phase 0 集成时已改为复用 tree 路由拿真实清单。

**`fly_to`**:经内存 pub/sub → `GET /scene-events`(SSE)推给浏览器,实测收到:
```json
{ "id": "cmd_...", "tool": "fly_to", "args": { "target": "468794779843497984" }, "ts": 1785737682405 }
```
浏览器端 `SceneCommandBridge` 订阅 `/scene-events` → `dispatch` → `sdk.fly(target)`。

**场景**:真实 sceneId 可从 `GET /api/ustudio/instances` 拿(取 `scene_id` 字段),示例 `463961468455870464`。消防设备 id 示例 `468794779843497984`(twins 类型 `ClosedSprinklerHead` 等,来自 instances 的 `twins_instance_id`)。
