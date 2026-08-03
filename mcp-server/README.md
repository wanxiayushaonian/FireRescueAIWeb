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
