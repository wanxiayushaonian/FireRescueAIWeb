const BFF_URL = (process.env.WEB_BFF_URL || 'http://localhost:3000').replace(/\/$/, '');
const X_APP_KEY = process.env.WEB_X_APP_KEY || '';

// 消防设备本体类型标识(与前端 lib/fire-types.ts 的 FIRE_TYPE_IDENTIFIERS 保持一致)。
// mcp-server 独立子包,不 import 前端代码,这里维护一份同步副本。
const FIRE_TYPE_IDENTIFIERS = new Set([
  'StandaloneSmokeAlarm',
  'EmergencyLightingFixture',
  'PortableCO2Extinguisher',
  'ExtinguisherCabinet',
  'HydrantButton',
  'ClosedSprinklerHead',
]);

export type SceneTreeNode = {
  id: string;
  name: string;
  type: string;
  children: SceneTreeNode[];
  [k: string]: unknown;
};

export type FireDevice = {
  id: string;
  name: string;
  type: string;
};

const BFF_TIMEOUT_MS = 8000;

async function bffFetch(path: string, init?: RequestInit): Promise<Response> {
  // 超时兜底:避免 BFF 卡住(尤其 /tree 14MB)时工具调用无限期挂起。
  const timeoutSignal = AbortSignal.timeout(BFF_TIMEOUT_MS);
  const signal = init?.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal;
  let res: Response;
  try {
    res = await fetch(`${BFF_URL}${path}`, {
      ...init,
      signal,
      headers: { 'x-app-key': X_APP_KEY, ...(init?.headers ?? {}) },
      cache: 'no-store',
    });
  } catch (e) {
    throw new Error(`BFF ${path} 网络错误或超时(${BFF_TIMEOUT_MS}ms): ${(e as Error).message}`);
  }
  if (!res.ok) {
    throw new Error(`BFF ${path} failed: ${res.status} ${res.statusText}`);
  }
  return res;
}

export async function getSceneOverview(params: { sceneId: string }): Promise<unknown> {
  // 真实 BFF overview 是 POST /api/ustudio/overview,body 为 { sceneIds: string[] },返回 { results: SceneOverview[] }
  const res = await bffFetch('/api/ustudio/overview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sceneIds: [params.sceneId] }),
  });
  const data = (await res.json()) as { results?: unknown[] };
  return data.results?.[0] ?? {};
}

/** 递归拍平场景树,收集 type 属于消防设备标识的叶子节点。 */
function collectFireDevices(node: SceneTreeNode, out: FireDevice[]): void {
  if (FIRE_TYPE_IDENTIFIERS.has(node.type)) {
    out.push({ id: node.id, name: node.name, type: node.type });
  }
  if (Array.isArray(node.children)) {
    for (const child of node.children) collectFireDevices(child, out);
  }
}

/** 消防设备清单:复用 BFF tree 路由,拍平过滤出设备本体(id 供 fly_to 用)。 */
export async function getFireDeviceList(params: { sceneId: string }): Promise<FireDevice[]> {
  const res = await bffFetch(
    `/api/ustudio/tree?sceneId=${encodeURIComponent(params.sceneId)}`,
  );
  const tree = (await res.json()) as SceneTreeNode;
  const out: FireDevice[] = [];
  collectFireDevices(tree, out);
  return out;
}
