/**
 * znya 业务接口代理:转发构建纯函数(URL 拼接 + Bearer header 注入)。
 * route 薄壳(见 app/api/business/[...path]/route.ts)调用这些构建。
 */

export function buildProxyUrl(
  path: string,
  search: string,
  base = process.env.ZNYA_BASE_URL || 'http://localhost:8000',
): string {
  const clean = base.replace(/\/+$/, '');
  const q = search ? `?${search}` : '';
  // path 不带前导斜杠(route 已截掉),保留尾斜杠(如 /fire-stations/)
  return `${clean}/${path}${q}`;
}

export function buildProxyHeaders(token: string, incoming: Headers): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    'content-type': incoming.get('content-type') ?? 'application/json',
  };
}
