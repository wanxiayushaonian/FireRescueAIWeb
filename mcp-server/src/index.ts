import { startHttp } from './http.js';

const appKey = process.env.MCP_APP_KEY;
if (!appKey) throw new Error('MCP_APP_KEY not set (use mcp-server/.env)');

const port = Number(process.env.MCP_PORT || 8787);
startHttp({
  port,
  appKey,
  corsOrigin: process.env.CORS_ORIGIN || '*',
});
