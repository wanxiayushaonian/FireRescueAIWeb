const BFF_URL = (process.env.WEB_BFF_URL || 'http://localhost:3000').replace(/\/$/, '');
const X_APP_KEY = process.env.WEB_X_APP_KEY || '';

export async function getSceneOverview(params: { sceneId: string }): Promise<unknown> {
  // 真实 BFF overview 是 POST /api/ustudio/overview,body 为 { sceneIds: string[] },返回 { results: SceneOverview[] }
  const res = await fetch(`${BFF_URL}/api/ustudio/overview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-app-key': X_APP_KEY },
    body: JSON.stringify({ sceneIds: [params.sceneId] }),
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`BFF overview failed: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as { results?: unknown[] };
  return data.results?.[0] ?? {};
}
