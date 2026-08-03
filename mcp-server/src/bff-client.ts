const BFF_URL = (process.env.WEB_BFF_URL || 'http://localhost:3000').replace(/\/$/, '');
const X_APP_KEY = process.env.WEB_X_APP_KEY || '';

export async function getSceneOverview(params: { sceneId: string }): Promise<unknown> {
  const url = new URL('/api/ustudio/overview', BFF_URL);
  url.searchParams.set('sceneId', params.sceneId);
  const res = await fetch(url, {
    headers: { 'x-app-key': X_APP_KEY },
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`BFF overview failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}
