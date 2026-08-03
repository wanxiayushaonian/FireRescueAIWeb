/**
 * 全局 X-App-Key —— 场景接口(lib/ustudio.ts)与智能体浮窗共用。
 * 来源:环境变量 NEXT_PUBLIC_X_APP_KEY(本地见 .env.local,已 gitignore;
 *        jarvis 预览会自动注入)。不再内置硬编码兜底值,避免密钥入库。
 * 缺失时返回空串,调用方需自行处理。
 */
export const X_APP_KEY = process.env.NEXT_PUBLIC_X_APP_KEY || '';
