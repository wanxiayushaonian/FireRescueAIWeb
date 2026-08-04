import { startHttp } from './http.js';

const appKey = process.env.MCP_APP_KEY;
if (!appKey) throw new Error('MCP_APP_KEY not set (use mcp-server/.env)');

const corsOrigin = process.env.CORS_ORIGIN || '';
if (!corsOrigin) {
  console.warn(
    '[mcp] WARNING: CORS_ORIGIN 未配置,默认允许任意源跨域 (*)。\n' +
    '       生产环境应在 .env 设置 CORS_ORIGIN=<前端域名>,收紧跨域范围。',
  );
}

// 进程级兜底:未捕获异常只记录日志,避免单个请求/连接异常拖垮整个服务。
// (Docker restart: unless-stopped 仍会兜底重启,这里先自救,减少硬崩溃。)
process.on('uncaughtException', (err) => {
  console.error('[mcp] uncaughtException:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[mcp] unhandledRejection:', reason);
});

const port = Number(process.env.MCP_PORT || 8787);
startHttp({
  port,
  appKey,
  corsOrigin: corsOrigin || '*',
});
