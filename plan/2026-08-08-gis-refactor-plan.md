# GIS 底座结构重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 拆解 1786 行的 `RealGisMap.tsx`（8 类职责混杂）为「编排者组件 + hooks + lib 纯函数渲染器」，消灭路线渲染双份代码与 API 层重复，顺带清理死代码/过期数据。

**Architecture:** 依据 `plan/2026-08-08-gis-refactor-design.md`（已批准）。React 状态留在组件层，Leaflet 命令式操作下沉为 `lib/gis/` 纯函数，两者通过 `src/components/gis/hooks/` 桥接。搬家不改语义。

**Tech Stack:** Next.js 16 + React 19 + TS + Leaflet + vitest（node 环境，仅覆盖 `lib/**/__tests__`）。

## Global Constraints

- **行为保真红线**：不写新功能、不改交互、不改样式；订阅源、effect 依赖数组、防抖/seq 语义逐字保留
- 唯一例外：清债三项（Task 4）
- 所有 shell 命令前缀 `source ~/.nvm/nvm.sh`（node 经 nvm，非交互 shell 必须）
- 测试命令：`npm test`（= `vitest run`，node 环境，仅 `lib/**/__tests__/**/*.test.ts`）
- 类型检查：`npm run typecheck`（= `tsc --noEmit`）；构建：`npm run build`
- **vitest 是 node 环境**：依赖 Leaflet DOM 的代码不可单测 → `lib/gis/` 中 Leaflet 封装保持极薄，纯函数部分才进测试
- `lib/` 内部模块互相 import 用**相对路径**（`../paginate`），不用 `@/`（vitest 别名 `@`→仓库根，`@/mock` 会解析失败；tsconfig 是 `['./src/*', './*']` 双回退）
- 提交规范：Conventional Commits，每 Task 一个 commit，消息结尾加 `Co-Authored-By: Claude <noreply@anthropic.com>`
- 当前工作区有大量未提交的其他改动（git status 里 M/?? 的文件），**全部不要动、不要提交**，每个 commit 只 `git add` 本任务涉及的文件

---

### Task 1: `lib/http.ts` — API 层共用 fetch 助手

**Files:**
- Create: `lib/http.ts`
- Test: `lib/__tests__/http.test.ts`
- 参考（语义来源）: `src/api/force.ts:9-27`、`src/api/water.ts:7-11,108-115`、`lib/paginate.ts`

**Interfaces:**
- Produces（后续所有 api 文件依赖）:
  - `getJson<T>(path: string, signal?: AbortSignal): Promise<T>` — 非 ok 抛 `请求失败 {status}: {path}`
  - `mutate(path: string, method: 'POST'|'PUT'|'DELETE', body?: unknown): Promise<void>` — 非 ok 抛 `操作失败 {status}: {path}`
  - `fetchAll<T>(path: string, pageSize?: number): Promise<T[]>` — 第 1 页 + `remainingPages` 并行拉余页 + `concatPageItems` 合并

- [ ] **Step 1: 写失败测试**

```ts
// lib/__tests__/http.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { getJson, mutate, fetchAll } from '../http';

function jsonRes(ok: boolean, status: number, data: unknown) {
  return { ok, status, json: () => Promise.resolve(data) } as Response;
}

afterEach(() => vi.unstubAllGlobals());

describe('getJson', () => {
  it('ok 时返回解析后的 JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonRes(true, 200, { a: 1 })));
    await expect(getJson<{ a: number }>('/x')).resolves.toEqual({ a: 1 });
  });
  it('非 ok 抛带状态码与路径的错误', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonRes(false, 500, null)));
    await expect(getJson('/x')).rejects.toThrow('请求失败 500: /x');
  });
});

describe('mutate', () => {
  it('带 body 时发 JSON content-type', async () => {
    const f = vi.fn().mockResolvedValue(jsonRes(true, 200, {}));
    vi.stubGlobal('fetch', f);
    await mutate('/x', 'POST', { n: 1 });
    expect(f).toHaveBeenCalledWith('/x', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"n":1}',
    });
  });
  it('无 body 时不带 headers/body', async () => {
    const f = vi.fn().mockResolvedValue(jsonRes(true, 200, {}));
    vi.stubGlobal('fetch', f);
    await mutate('/x/1', 'DELETE');
    expect(f).toHaveBeenCalledWith('/x/1', { method: 'DELETE', headers: undefined, body: undefined });
  });
  it('非 ok 抛错', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonRes(false, 403, null)));
    await expect(mutate('/x', 'PUT', {})).rejects.toThrow('操作失败 403: /x');
  });
});

describe('fetchAll', () => {
  it('total=211/pageSize=100 时并行补拉第 2、3 页并合并', async () => {
    const mk = (n: number, offset: number) => Array.from({ length: n }, (_, i) => offset + i);
    const f = vi.fn().mockImplementation((url: string) => {
      if (url.includes('page=1')) return Promise.resolve(jsonRes(true, 200, { items: mk(100, 0), total: 211 }));
      if (url.includes('page=2')) return Promise.resolve(jsonRes(true, 200, { items: mk(100, 100), total: 211 }));
      return Promise.resolve(jsonRes(true, 200, { items: mk(11, 200), total: 211 }));
    });
    vi.stubGlobal('fetch', f);
    const all = await fetchAll<number>('/api/business/things');
    expect(all.length).toBe(211);
    expect(all[0]).toBe(0);
    expect(all[210]).toBe(210);
    expect(f).toHaveBeenCalledTimes(3);
  });
  it('单页装得下时只请求 1 次', async () => {
    const f = vi.fn().mockResolvedValue(jsonRes(true, 200, { items: [1, 2], total: 2 }));
    vi.stubGlobal('fetch', f);
    await expect(fetchAll<number>('/x?foo=1')).resolves.toEqual([1, 2]);
    expect(f).toHaveBeenCalledTimes(1);
    // 已有 query 时用 & 拼 page 参数
    expect(f.mock.calls[0][0]).toContain('/x?foo=1&page=1&page_size=100');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `source ~/.nvm/nvm.sh && npx vitest run lib/__tests__/http.test.ts`
Expected: FAIL（`Cannot find module '../http'`）

- [ ] **Step 3: 实现 `lib/http.ts`**

```ts
// lib/http.ts
// web /api/business/*(BFF 代理 znya)共用 fetch 助手:getJson / mutate / fetchAll(分页拼齐)。
// 语义与 src/api 各文件原私有实现逐字一致(错误消息格式不变)。
import { concatPageItems, remainingPages } from './paginate';

export async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, { signal });
  if (!res.ok) throw new Error(`请求失败 ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

export async function mutate(path: string, method: 'POST' | 'PUT' | 'DELETE', body?: unknown): Promise<void> {
  const res = await fetch(path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`操作失败 ${res.status}: ${path}`);
}

/** 分页拉取全部:先取第 1 页拿 total(znya page 从 1 开始),未取满则并行拉余页合并。 */
export async function fetchAll<T>(path: string, pageSize = 100): Promise<T[]> {
  const sep = path.includes('?') ? '&' : '?';
  const pageUrl = (page: number) => `${path}${sep}page=${page}&page_size=${pageSize}`;
  const first = await getJson<{ items: T[]; total: number }>(pageUrl(1));
  const rest = remainingPages(first.total, pageSize, first.items.length);
  if (rest.length === 0) return first.items;
  const pages = await Promise.all(rest.map((p) => getJson<{ items: T[] }>(pageUrl(p))));
  return concatPageItems(first.items, pages.map((r) => r.items ?? []));
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `source ~/.nvm/nvm.sh && npx vitest run lib/__tests__/http.test.ts`
Expected: PASS（7 个用例）

- [ ] **Step 5: Commit**

```bash
git add lib/http.ts lib/__tests__/http.test.ts
git commit -m "feat(lib): http 共用 fetch 助手(getJson/mutate/fetchAll)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: 5 个 API 文件去重（改用 `lib/http.ts`）

**Files:**
- Modify: `src/api/water.ts`（删 7-11 私有 getJson、108-115 私有 mutate；`fetchWaterSourcesInBbox` 改用 fetchAll）
- Modify: `src/api/key-units.ts`（删 8-12、47-54；`fetchKeyUnits` 改用 fetchAll）
- Modify: `src/api/key-buildings.ts`（同模式）
- Modify: `src/api/incidents.ts`（同模式）
- Modify: `src/api/force.ts`（删 9-27；改用 import）

**Interfaces:**
- Consumes: Task 1 的 `getJson / mutate / fetchAll`
- Produces: 各文件导出签名不变（`fetchStations` / `fetchKeyUnits` / `createWaterSource` 等全部原样）

- [ ] **Step 1: 改 `src/api/force.ts`**

删第 9-27 行（私有 `getJson` + `fetchAll`），顶部改为：

```ts
import { getJson, fetchAll } from '@/lib/http';
```

`fetchAll` 调用处不变（签名一致）。`getJson` 的 `signal` 形参保留在 lib 版本里，调用处不动。

- [ ] **Step 2: 改 `src/api/key-units.ts`**

删第 8-12 行与 47-54 行，顶部 `import { getJson, mutate, fetchAll } from '@/lib/http';`，删 `import { concatPageItems, remainingPages } from '@/lib/paginate';`。`fetchKeyUnits` 函数体改为：

```ts
export async function fetchKeyUnits(): Promise<KeyUnit[]> {
  const items = await fetchAll<ZnyaKeyUnit>('/api/business/key-units');
  return items.map(mapKeyUnit).filter((x): x is KeyUnit => x !== null);
}
```

注意：`updateKeyUnitCoords`（28-35）与 `geocodeMissingKeyUnits`（38-43）的错误消息与 `mutate` 不同（`更新单位坐标失败 {status}` / `批量补全失败 {status}`），**保持原样手写 fetch，不改**。

- [ ] **Step 3: 改 `src/api/key-buildings.ts` 与 `src/api/incidents.ts`**

同 Step 2 模式：删私有 getJson/mutate/分页拼装，改 import，`fetch*` 函数体用 `fetchAll` 一行替换。`updateKeyBuildingCoords` 等特殊错误消息的函数保持手写。

- [ ] **Step 4: 改 `src/api/water.ts`**

删私有 getJson（7-11）与 mutate（108-115），import 共用版。`fetchWaterSourcesInBbox` 改为（语义等价：`remainingPages` 页码集合与原 for 循环一致，顺序翻页变并行，`concatPageItems` 保序）：

```ts
export async function fetchWaterSourcesInBbox(bbox: WaterBbox): Promise<WaterSource[]> {
  const q = `min_lng=${bbox.minLng}&min_lat=${bbox.minLat}&max_lng=${bbox.maxLng}&max_lat=${bbox.maxLat}`;
  const items = await fetchAll<ZnyaWaterSource>(`/api/business/water-sources?${q}`, 2000);
  return items.map(mapWaterSource);
}
```

- [ ] **Step 5: 验证 + Commit**

Run: `source ~/.nvm/nvm.sh && npm run typecheck && npm test && grep -rn "async function getJson\|async function mutate\|async function fetchAll" src/api/ || echo OK`
Expected: typecheck 通过；测试全绿；grep 无输出（OK）

```bash
git add src/api/water.ts src/api/key-units.ts src/api/key-buildings.ts src/api/incidents.ts src/api/force.ts
git commit -m "refactor(api): 5 个数据访问文件改用 lib/http 共用助手

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: `lib/gis/route-render.ts` — 消灭路线渲染双份代码

**Files:**
- Create: `lib/gis/route-render.ts`
- Test: `lib/__tests__/route-render.test.ts`
- Modify: `src/components/RealGisMap.tsx:506-596`（planRoutes）与 `:1526-1556`（showRoute 执行器）

**Interfaces:**
- Consumes: 无（首批 lib/gis 模块）
- Produces（Task 11 scene-bridge 依赖）:
  - `interface RouteRenderItem { stationId?: string; stationName: string; polyline: [number, number][]; distance?: number; duration?: number; trafficLights?: number }`（distance 米 / duration 秒）
  - `interface RouteSummary { stationId: string; stationName: string; distance: number; duration: number; trafficLights: number }`（与 DeployPanel 的 `PlannedRoute` 结构一致）
  - `ROUTE_COLORS: readonly string[]`、`routeColor(idx)`、`routeSegIndex(polylineLength, idx)`、`routeTipHtml(item, idx)`
  - `renderRoutes(layer: L.LayerGroup, routes: RouteRenderItem[]): { bounds: L.LatLngBounds | null; summary: RouteSummary[] }` — 内部 `clearLayers()`，跳过无 polyline 项，summary 的 stationId 取 `item.stationId ?? \`ext-${idx}\``

- [ ] **Step 1: 写失败测试（纯函数部分；renderRoutes 依赖 Leaflet DOM，不进 node 单测）**

```ts
// lib/__tests__/route-render.test.ts
import { describe, it, expect } from 'vitest';
import { ROUTE_COLORS, routeColor, routeSegIndex, routeTipHtml } from '../gis/route-render';

describe('routeColor', () => {
  it('按色板轮换,超出长度取模', () => {
    expect(routeColor(0)).toBe('#22d3ee');
    expect(routeColor(ROUTE_COLORS.length)).toBe('#22d3ee');
    expect(routeColor(3)).toBe('#fbbf24');
  });
});

describe('routeSegIndex', () => {
  it('按 idx 错开锚点,且不超过末点', () => {
    expect(routeSegIndex(100, 0)).toBe(30);   // floor(100*0.3)
    expect(routeSegIndex(100, 1)).toBe(48);   // floor(100*0.48)
    expect(routeSegIndex(10, 9)).toBe(9);     // 夹取到 length-1
  });
});

describe('routeTipHtml', () => {
  it('含站名/距离km/ETA分/红绿灯数,颜色为对应色板色', () => {
    const html = routeTipHtml({ stationName: '庐山大道站', polyline: [], distance: 2500, duration: 480, trafficLights: 3 }, 0);
    expect(html).toContain('庐山大道站');
    expect(html).toContain('2.5km');
    expect(html).toContain('8分');
    expect(html).toContain('3灯');
    expect(html).toContain('#22d3ee');
  });
  it('缺 distance/duration 时显示 ?(MCP 通道数据可能不全)', () => {
    const html = routeTipHtml({ stationName: 'x', polyline: [] }, 1);
    expect(html).toContain('?km');
    expect(html).toContain('?分');
    expect(html).toContain('0灯');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `source ~/.nvm/nvm.sh && npx vitest run lib/__tests__/route-render.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `lib/gis/route-render.ts`**

```ts
// lib/gis/route-render.ts
// 多站到场路线渲染:色板/锚点/tipHtml 纯函数 + Leaflet 渲染封装(极薄,node 单测只覆盖纯函数)。
// 面板 planRoutes 与 sceneLog showRoute 执行器(MCP 通道)共用本模块——tipHtml 模板与色板只此一份。
import L from 'leaflet';

export interface RouteRenderItem {
  stationId?: string;
  stationName: string;
  polyline: [number, number][];
  distance?: number; // 米
  duration?: number; // 秒
  trafficLights?: number;
}

export interface RouteSummary {
  stationId: string;
  stationName: string;
  distance: number;
  duration: number;
  trafficLights: number;
}

export const ROUTE_COLORS = ['#22d3ee', '#34d399', '#a78bfa', '#fbbf24', '#f87171', '#60a5fa'] as const;

export function routeColor(idx: number): string {
  return ROUTE_COLORS[idx % ROUTE_COLORS.length];
}

/** 信息标签锚定路线分段点(按 idx 错开,避免多条叠在中点)。 */
export function routeSegIndex(polylineLength: number, idx: number): number {
  return Math.min(Math.floor(polylineLength * (0.3 + idx * 0.18)), polylineLength - 1);
}

/** 贴线 tooltip HTML(深色卡片 + 站名 + 距离/ETA/红绿灯)。 */
export function routeTipHtml(r: RouteRenderItem, idx: number): string {
  const color = routeColor(idx);
  const distKm = r.distance != null ? (r.distance / 1000).toFixed(1) : '?';
  const etaMin = r.duration != null ? String(Math.round(r.duration / 60)) : '?';
  return `<div style="background:rgba(10,20,32,.94);border:1px solid ${color}66;border-radius:5px;padding:2px 6px;color:#e6edf3;font-size:11px;white-space:nowrap;box-shadow:0 0 8px ${color}44"><span style="color:${color};font-weight:700">${r.stationName}</span> <span style="color:#9db4c8">${distKm}km · ${etaMin}分 · ${r.trafficLights ?? 0}灯</span></div>`;
}

/** 渲染多条路线到 layer(先 clearLayers),返回适窗 bounds 与面板 summary。 */
export function renderRoutes(
  layer: L.LayerGroup,
  routes: RouteRenderItem[],
): { bounds: L.LatLngBounds | null; summary: RouteSummary[] } {
  layer.clearLayers();
  const allLatLngs: [number, number][] = [];
  const summary: RouteSummary[] = [];
  routes.forEach((r, idx) => {
    if (!r.polyline?.length) return;
    const color = routeColor(idx);
    L.polyline(r.polyline, { color, weight: 4, dashArray: '10 8', opacity: 0.9, className: 'route-flow' }).addTo(layer);
    const seg = routeSegIndex(r.polyline.length, idx);
    L.marker(r.polyline[seg], {
      icon: L.divIcon({ html: routeTipHtml(r, idx), className: 'route-tip-icon', iconSize: undefined, iconAnchor: [0, 0] }),
      interactive: false,
      keyboard: false,
    }).addTo(layer);
    r.polyline.forEach((pt) => allLatLngs.push(pt));
    summary.push({
      stationId: r.stationId ?? `ext-${idx}`,
      stationName: r.stationName,
      distance: r.distance ?? 0,
      duration: r.duration ?? 0,
      trafficLights: r.trafficLights ?? 0,
    });
  });
  return { bounds: allLatLngs.length ? L.latLngBounds(allLatLngs) : null, summary };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `source ~/.nvm/nvm.sh && npx vitest run lib/__tests__/route-render.test.ts`
Expected: PASS

- [ ] **Step 5: 重写 `planRoutes`（RealGisMap.tsx:548-596）**

删除 506-507 行的局部 `ROUTE_COLORS`。`planRoutes` 改为：并发拉 driving → 按 `stationIds` 顺序组装 `RouteRenderItem[]` → 一次 `renderRoutes` → 适窗 + setPlanned + showRoute action：

```ts
const planRoutes = useCallback(
  async (stationIds: string[]) => {
    const map = mapRef.current;
    const routeLayer = routeLayerRef.current;
    if (!map || !routeLayer || !deploy) return;
    setPlanning(true);
    setPlanned([]);
    // 并发拉各站 driving;失败站跳过;按 stationIds 顺序组装(原实现靠 sort 恢复顺序,等价)
    const items = (
      await Promise.all(
        stationIds.map(async (id) => {
          const s = stationsRef.current.find((x) => x.id === id);
          if (!s) return null;
          try {
            const route = await fetchDrivingRoute({ lng: s.lng, lat: s.lat }, { lng: deploy.target.lng, lat: deploy.target.lat });
            return { stationId: id, stationName: s.name, polyline: route.polyline, distance: route.distance, duration: route.duration, trafficLights: route.trafficLights } as RouteRenderItem;
          } catch {
            return null; // 单站失败跳过
          }
        }),
      )
    ).filter((x): x is RouteRenderItem => x !== null);
    const { bounds, summary } = renderRoutes(routeLayer, items);
    setPlanned(summary);
    setPlanning(false);
    if (bounds) map.flyToBounds(bounds, { padding: [60, 60] });
    addSceneAction({
      action: 'showRoute',
      target: `派遣路线:${deploy.target.name}(${summary.length} 站)`,
      params: { routes: summary },
      source: '面板',
    });
  },
  [deploy],
);
```

注意：原实现开头有 `routeLayer.clearLayers()`，`renderRoutes` 内部已含，不重复调。

- [ ] **Step 6: 重写 sceneLog `showRoute` 执行器分支（RealGisMap.tsx:1526-1556）**

```ts
if (latest.action === 'showRoute' && latest.source !== '面板') {
  // MCP/agent 通道:外部写 showRoute(含 routes[])→ 渲染多 polyline(面板自己写的跳过,避免重复)
  const routeLayer = routeLayerRef.current;
  const routes = (latest.params as { routes?: RouteRenderItem[] }).routes;
  if (routeLayer && Array.isArray(routes) && routes.length) {
    const { bounds, summary } = renderRoutes(routeLayer, routes);
    setPlanned(summary);
    if (bounds) map.flyToBounds(bounds, { padding: [60, 60] });
  }
}
```

顶部 import 加 `import { renderRoutes, type RouteRenderItem } from '@/lib/gis/route-render';`。

- [ ] **Step 7: 验证 + Commit**

Run: `source ~/.nvm/nvm.sh && npm run typecheck && npm test && npm run build`
Expected: 全绿。冒烟（可选，Task 9 统一做）：派遣面板选站 → 路线 + 贴线标签正常。

```bash
git add lib/gis/route-render.ts lib/__tests__/route-render.test.ts src/components/RealGisMap.tsx
git commit -m "refactor(gis): 路线渲染抽 lib/gis/route-render,消灭 planRoutes/showRoute 双份代码

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: 清债 — 死代码 / 过期坐标 / 文档修正

**Files:**
- Delete: `lib/geo-convert.ts`、`lib/__tests__/geo-convert.test.ts`
- Modify: `src/mock/sceneLog.ts:34`（及 `applyActionToState` 内 reset 默认值）
- Modify: `src/mock/stations.ts:36-37`
- Modify: `plan/situation-overview-roadmap.md:132`

- [ ] **Step 1: 确认 geo-convert 零业务引用后删除**

Run: `source ~/.nvm/nvm.sh && grep -rn "geo-convert" src/ lib/ app/ --include="*.ts" --include="*.tsx" | grep -v "__tests__/geo-convert.test.ts" || echo ZERO`
Expected: ZERO
Then: `git rm lib/geo-convert.ts lib/__tests__/geo-convert.test.ts`

- [ ] **Step 2: 修 `src/mock/sceneLog.ts` 默认中心**

把 `'118.7968, 32.0603'`（南京）全部替换为 `'115.96498, 29.66734'`（九江，与 `RealGisMap.tsx` 的 `DEFAULT_CENTER` 一致，格式 `lng, lat`）。文件内所有出现处（初始 state 与 reset 默认值）都改。

- [ ] **Step 3: 修 `src/mock/stations.ts` mock 坐标**

36-37 行附近的南京基准坐标（`118.74` / `32.02` 一带）改为九江市中心基准（经度围绕 `115.96`、纬度围绕 `29.66` 生成）。只改基准数值，生成逻辑不动。

- [ ] **Step 4: 修 roadmap 坐标系描述**

`plan/situation-overview-roadmap.md:132` 的 `- **坐标系**:站/水 WGS84(显示转 GCJ02);单位/建筑/警情 GCJ02;driving 用 GCJ02 — 新数据按此对齐` 改为：

```markdown
- **坐标系**:自 znya c8d4e5f6a7b8 迁移起全库统一 GCJ02(高德),前端不做基准转换,库内坐标直接使用
```

- [ ] **Step 5: 验证 + Commit**

Run: `source ~/.nvm/nvm.sh && npm run typecheck && npm test`
Expected: 全绿

```bash
git add -A lib/geo-convert.ts lib/__tests__/geo-convert.test.ts src/mock/sceneLog.ts src/mock/stations.ts plan/situation-overview-roadmap.md
git commit -m "chore(gis): 删 geo-convert 死代码,修南京残留坐标与 roadmap 坐标系描述

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: `lib/gis/popup-html.ts` — popup 模板下沉

**Files:**
- Create: `lib/gis/popup-html.ts`
- Test: `lib/__tests__/popup-html.test.ts`
- Modify: `src/components/RealGisMap.tsx:57-85`（删两个函数）、`:1170`（站 popup）、`:1201`（水 popup）、`:1251-1255`（单位 popup + 警情后缀）、`:1318-1321`（警情 popup）、`:1348`（建筑 popup）

**Interfaces:**
- Produces:
  - `popupForKeyUnit(u: KeyUnit): string`（从 RealGisMap 逐字搬，import 改为相对路径 `../key-unit-mapper`）
  - `popupForKeyBuilding(b: KeyBuilding, unitName?: string): string`（同上）
  - `popupIncidentSuffix(inc: Incident): string` — 返回 `<br/><span style="color:#ef4444">⚠ 警情:...</span>`（incident-mapper 的 `Incident` 用相对路径 import）
  - `popupForStation(s: { name: string; type: string; address: string; lng: number; lat: number }, personnel: number): string`
  - `popupForWater(w: { name: string; type: string; district: string; address: string; lng: number; lat: number }): string`
  - `popupForIncident(i: Incident): string`
  - 后三个入参用**结构类型**（不 import `@/mock/types`，避免 lib→src 依赖破坏 vitest 解析）

- [ ] **Step 1: 写失败测试**

```ts
// lib/__tests__/popup-html.test.ts
import { describe, it, expect } from 'vitest';
import { popupForStation, popupForWater, popupIncidentSuffix, popupForIncident } from '../gis/popup-html';

describe('popupForStation', () => {
  it('含站名/类型/在位人数/地址/坐标', () => {
    const html = popupForStation({ name: '庐山大道站', type: '救援站', address: '庐山大道 1 号', lng: 115.98, lat: 29.67 }, 42);
    expect(html).toContain('庐山大道站');
    expect(html).toContain('在位 42 人');
    expect(html).toContain('(GCJ02)');
  });
});

describe('popupForWater', () => {
  it('含名称/类型/区划/地址', () => {
    const html = popupForWater({ name: '消火栓A', type: '市政消火栓', district: '濂溪区', address: 'x路', lng: 116, lat: 29.7 });
    expect(html).toContain('消火栓A');
    expect(html).toContain('市政消火栓 · 濂溪区');
  });
});

describe('popupIncidentSuffix / popupForIncident', () => {
  const inc = { id: 'i1', address: '某化工厂', incidentType: '火灾', level: 3, status: '出动', description: '明火', lng: 116, lat: 29.7, keyUnitId: null } as any;
  it('后缀含类型/等级/状态/描述', () => {
    const s = popupIncidentSuffix(inc);
    expect(s).toContain('火灾 · 3 级 · 出动');
    expect(s).toContain('(明火)');
  });
  it('无描述时不含括号', () => {
    expect(popupIncidentSuffix({ ...inc, description: '' })).not.toContain('(明火)');
  });
  it('警情 popup 含 ⚠ 与地址', () => {
    expect(popupForIncident(inc)).toContain('⚠ 某化工厂');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `source ~/.nvm/nvm.sh && npx vitest run lib/__tests__/popup-html.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现 `lib/gis/popup-html.ts`**

```ts
// lib/gis/popup-html.ts
// 各图层 popup HTML 模板(纯函数,node 可测)。从 RealGisMap.tsx 逐字搬出;
// 站/水入参用结构类型,避免 lib 依赖 src/mock/types(vitest '@' 别名解析不到 src)。
import type { KeyUnit } from '../key-unit-mapper';
import type { KeyBuilding } from '../key-building-mapper';
import type { Incident } from '../incident-mapper';

/** 重点单位 popup:基础信息 + 微型站统计 + 已建模标记。 */
export function popupForKeyUnit(u: KeyUnit): string {
  const micro = u.extra;
  const microLines = [
    micro.has_micro_station ? `微型站 ${micro.has_micro_station}` : '',
    micro.duty_24h ? `24h执勤 ${micro.duty_24h}` : '',
    micro.total_people ? `总人数 ${micro.total_people}` : '',
    micro.has_equipment ? `器材 ${micro.has_equipment}` : '',
    micro.has_control_room ? `控制室 ${micro.has_control_room}` : '',
  ].filter(Boolean);
  const built = u.status === 'completed' ? '<br/><span style="color:#fbbf24">★ 已 3D 建模</span>' : '';
  return (
    `<b>${u.name}</b><br/>${u.unitType} · ${u.district ?? ''}` +
    `<br/>负责人 ${u.contactName ?? '-'}${u.contactPhone ? ` · ${u.contactPhone}` : ''}` +
    (microLines.length ? `<br/>${microLines.join(' · ')}` : '') +
    `${built}<br/>${u.lng.toFixed(5)}, ${u.lat.toFixed(5)}(GCJ02)`
  );
}

/** 重点建筑 popup:类型/用途 + 所属单位 + 已建模标记。 */
export function popupForKeyBuilding(b: KeyBuilding, unitName?: string): string {
  const built = b.status === 'completed' ? '<br/><span style="color:#fbbf24">★ 已 3D 建模</span>' : '';
  return (
    `<b>${b.name}</b><br/>重点建筑${b.buildingType ? ` · ${b.buildingType}` : ''}` +
    `${b.buildingUsage ? `<br/>${b.buildingUsage}` : ''}` +
    `${unitName ? `<br/>所属单位: ${unitName}` : ''}` +
    `${built}<br/>${b.lng.toFixed(5)}, ${b.lat.toFixed(5)}`
  );
}

/** 单位 popup 追加的警情行(有活跃警情时)。 */
export function popupIncidentSuffix(inc: Incident): string {
  return `<br/><span style="color:#ef4444">⚠ 警情:${inc.incidentType} · ${inc.level} 级 · ${inc.status}${inc.description ? `(${inc.description})` : ''}</span>`;
}

export function popupForStation(
  s: { name: string; type: string; address: string; lng: number; lat: number },
  personnel: number,
): string {
  return `<b>${s.name}</b><br/>${s.type} · 在位 ${personnel} 人<br/>${s.address}<br/>${s.lng.toFixed(5)}, ${s.lat.toFixed(5)}(GCJ02)`;
}

export function popupForWater(w: { name: string; type: string; district: string; address: string; lng: number; lat: number }): string {
  return `<b>${w.name}</b><br/>${w.type} · ${w.district}<br/>${w.address}<br/>${w.lng.toFixed(5)}, ${w.lat.toFixed(5)}(GCJ02)`;
}

export function popupForIncident(i: Incident): string {
  return (
    `<b>⚠ ${i.address}</b><br/>${i.incidentType} · ${i.level} 级 · ${i.status}` +
    `${i.description ? `<br/>${i.description}` : ''}<br/>${i.lng.toFixed(5)}, ${i.lat.toFixed(5)}`
  );
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `source ~/.nvm/nvm.sh && npx vitest run lib/__tests__/popup-html.test.ts`
Expected: PASS

- [ ] **Step 5: RealGisMap 接线**

- 删 57-85 行两个本地函数，改 import
- 1170 行站 popup → `.bindPopup(popupForStation(s, personnelCounts.get(s.id) ?? 0))`
- 1201 行水 popup → `.bindPopup(popupForWater(w))`
- 1251-1255 行 → `const popupHtml = popupForKeyUnit(u) + (inc ? popupIncidentSuffix(inc) : '');`
- 1318-1321 行警情 popup → `.bindPopup(popupForIncident(i))`
- 1348 行建筑 popup 调用改为从 lib import

- [ ] **Step 6: 验证 + Commit**

Run: `source ~/.nvm/nvm.sh && npm run typecheck && npm test`
Expected: 全绿

```bash
git add lib/gis/popup-html.ts lib/__tests__/popup-html.test.ts src/components/RealGisMap.tsx
git commit -m "refactor(gis): popup 模板下沉 lib/gis/popup-html(纯函数可测)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: `lib/gis/marker-html.ts` — marker 图标 HTML 下沉

**Files:**
- Create: `lib/gis/marker-html.ts`
- Test: `lib/__tests__/marker-html.test.ts`
- Modify: `src/components/RealGisMap.tsx:1244-1250`（单位 iconHtml 组装）、`:1311`（警情 marker html）

**Interfaces:**
- Consumes: `lib/map-icons.ts` 的 `keyUnitIconSvg`
- Produces:
  - `HIGH_RISK_PATTERN: RegExp`（= `/高层|化工|危化|超高层|大空间|地下/`）
  - `keyUnitMarkerHtml(opts: { unitType: string; status?: string; incidentLevel?: number | null; highRisk?: boolean }): string` — 警情态 > 风险角标 > 裸图标（互斥，警情优先）
  - `incidentMarkerHtml(level: number): string`

- [ ] **Step 1: 写失败测试**

```ts
// lib/__tests__/marker-html.test.ts
import { describe, it, expect } from 'vitest';
import { HIGH_RISK_PATTERN, keyUnitMarkerHtml, incidentMarkerHtml } from '../gis/marker-html';

describe('keyUnitMarkerHtml', () => {
  it('有警情:警情圆环 + 等级,不含风险角标(警情优先互斥)', () => {
    const html = keyUnitMarkerHtml({ unitType: '化工', incidentLevel: 2, highRisk: true });
    expect(html).toContain('unit-incident-ring');
    expect(html).toContain('data-level="2"');
    expect(html).not.toContain('unit-risk-badge');
  });
  it('无警情且高风险:! 角标', () => {
    const html = keyUnitMarkerHtml({ unitType: '高层建筑', highRisk: true });
    expect(html).toContain('unit-risk-badge');
    expect(html).not.toContain('unit-incident-wrap');
  });
  it('普通单位:裸图标', () => {
    const html = keyUnitMarkerHtml({ unitType: '学校' });
    expect(html).not.toContain('unit-risk-wrap');
    expect(html).not.toContain('unit-incident-wrap');
  });
});

describe('HIGH_RISK_PATTERN', () => {
  it('命中高层/化工/危化/超高层/大空间/地下', () => {
    for (const t of ['高层建筑', '化工园区', '危化品仓库', '超高层', '大空间厂房', '地下商场']) {
      expect(HIGH_RISK_PATTERN.test(t)).toBe(true);
    }
    expect(HIGH_RISK_PATTERN.test('学校')).toBe(false);
  });
});

describe('incidentMarkerHtml', () => {
  it('独立警情 marker:等级数字 + data-level', () => {
    expect(incidentMarkerHtml(4)).toBe('<div class="incident-marker" data-level="4">4</div>');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `source ~/.nvm/nvm.sh && npx vitest run lib/__tests__/marker-html.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现 `lib/gis/marker-html.ts`**

```ts
// lib/gis/marker-html.ts
// marker 图标 HTML 组装(纯函数)。重点单位:警情态(圆环+等级) > 风险角标 > 裸图标,互斥且警情优先。
import { keyUnitIconSvg } from '../map-icons';

/** 高风险单位类型关键词(用于风险角标)。 */
export const HIGH_RISK_PATTERN = /高层|化工|危化|超高层|大空间|地下/;

export function keyUnitMarkerHtml(opts: {
  unitType: string;
  status?: string;
  incidentLevel?: number | null;
  highRisk?: boolean;
}): string {
  const base = keyUnitIconSvg(opts.unitType, opts.status);
  if (opts.incidentLevel != null) {
    return `<div class="unit-incident-wrap">${base}<span class="unit-incident-ring" data-level="${opts.incidentLevel}"></span><span class="unit-incident-level">${opts.incidentLevel}</span></div>`;
  }
  if (opts.highRisk) {
    return `<div class="unit-risk-wrap">${base}<span class="unit-risk-badge" title="高风险">!</span></div>`;
  }
  return base;
}

/** 独立警情 marker(红色脉冲点位 + 等级数字)。 */
export function incidentMarkerHtml(level: number): string {
  return `<div class="incident-marker" data-level="${level}">${level}</div>`;
}
```

- [ ] **Step 4: 跑测试确认通过 → RealGisMap 接线**

Run: `source ~/.nvm/nvm.sh && npx vitest run lib/__tests__/marker-html.test.ts`

接线（1244-1250 行）：

```ts
const renderUnit = (u: KeyUnit) => {
  const inc = incidentByUnit.get(u.id);
  const iconHtml = keyUnitMarkerHtml({
    unitType: u.unitType,
    status: u.status,
    incidentLevel: inc?.level ?? null,
    highRisk: !inc && HIGH_RISK_PATTERN.test(u.unitType),
  });
```

1311 行：`html: incidentMarkerHtml(i.level),`

- [ ] **Step 5: 验证 + Commit**

Run: `source ~/.nvm/nvm.sh && npm run typecheck && npm test`

```bash
git add lib/gis/marker-html.ts lib/__tests__/marker-html.test.ts src/components/RealGisMap.tsx
git commit -m "refactor(gis): marker 图标 HTML 下沉 lib/gis/marker-html

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: `lib/gis/palette-items.ts` — 命令面板条目构建下沉

**Files:**
- Create: `lib/gis/palette-items.ts`
- Test: `lib/__tests__/palette-items.test.ts`
- Modify: `src/components/RealGisMap.tsx:1046-1151`（命令面板 effect）

**Interfaces:**
- Produces:
  - `interface PaletteActionDef { id: string; title: string; subtitle?: string; icon: LucideIcon; group: '动作' }`
  - `buildActionItems(s: { baseMap: 'vector'|'satellite'; hasPlanned: boolean; drawMode: boolean }): PaletteActionDef[]` — 顺序：切底图 → 批量补全 → [清空路线] → 划定区域
  - `filterActionItems(items: PaletteActionDef[], q: string): PaletteActionDef[]`（title/id includes）
  - `filterUnits(units: Array<{ id: string; name: string; unitType: string; district?: string | null }>, q: string, limit?: number)` — q 空返回 []，否则 name/unitType includes，截 limit（默认 6）
  - `buildAddressDefs(cs: GeoCandidate[], limit?: number): Array<{ id: string; title: string; subtitle: string; group: '地址' }>`（截 6，id 为 `addr-{lng}-{lat}`）
  - `GeoCandidate` 类型从 `@/api/geocode` import 会导致 lib→src 依赖 → 在本文件定义结构类型 `{ lng: number; lat: number; address: string; level: string }`

- [ ] **Step 1: 写失败测试**

```ts
// lib/__tests__/palette-items.test.ts
import { describe, it, expect } from 'vitest';
import { buildActionItems, filterActionItems, filterUnits, buildAddressDefs } from '../gis/palette-items';

describe('buildActionItems', () => {
  it('矢量底图时首项为"切换卫星底图",无路线时无清空项', () => {
    const items = buildActionItems({ baseMap: 'vector', hasPlanned: false, drawMode: false });
    expect(items[0].title).toBe('切换卫星底图');
    expect(items.map((i) => i.id)).toEqual(['toggle-base', 'batch-geocode', 'toggle-draw']);
  });
  it('有路线时插入清空项;绘制中显示取消划定', () => {
    const items = buildActionItems({ baseMap: 'satellite', hasPlanned: true, drawMode: true });
    expect(items.map((i) => i.id)).toEqual(['toggle-base', 'batch-geocode', 'clear-route', 'toggle-draw']);
    expect(items[0].title).toBe('切换矢量底图');
    expect(items[3].title).toBe('取消划定区域');
  });
});

describe('filterActionItems / filterUnits / buildAddressDefs', () => {
  it('动作按 title/id 过滤', () => {
    const items = buildActionItems({ baseMap: 'vector', hasPlanned: false, drawMode: false });
    expect(filterActionItems(items, '卫星').map((i) => i.id)).toEqual(['toggle-base']);
  });
  it('单位:空查询返回 [],命中按名称/类型,截 6', () => {
    const units = Array.from({ length: 8 }, (_, i) => ({ id: String(i), name: `化工厂${i}`, unitType: '化工', district: null }));
    expect(filterUnits(units, '')).toEqual([]);
    expect(filterUnits(units, '化工厂').length).toBe(6);
  });
  it('地址候选截 6 且 id 带坐标', () => {
    const cs = Array.from({ length: 8 }, (_, i) => ({ lng: 116 + i * 0.001, lat: 29.7, address: `地址${i}`, level: '兴趣点' }));
    const defs = buildAddressDefs(cs);
    expect(defs.length).toBe(6);
    expect(defs[0].id).toBe('addr-116-29.7');
    expect(defs[0].group).toBe('地址');
  });
});
```

- [ ] **Step 2: 跑测试确认失败 → 实现 → 确认通过**

```ts
// lib/gis/palette-items.ts
// Ctrl/Cmd+K 命令面板条目构建(纯函数)。run 闭包由组件层附加,本模块只管数据。
import { Satellite, Map as MapIcon, MapPin, Trash2, PenLine, type LucideIcon } from 'lucide-react';

export interface PaletteActionDef {
  id: string;
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  group: '动作';
}

export function buildActionItems(s: { baseMap: 'vector' | 'satellite'; hasPlanned: boolean; drawMode: boolean }): PaletteActionDef[] {
  const items: PaletteActionDef[] = [
    { id: 'toggle-base', title: s.baseMap === 'vector' ? '切换卫星底图' : '切换矢量底图', icon: s.baseMap === 'vector' ? Satellite : MapIcon, group: '动作' },
    { id: 'batch-geocode', title: '批量补全坐标', subtitle: '给坐标缺失的重点单位地理编码', icon: MapPin, group: '动作' },
  ];
  if (s.hasPlanned) items.push({ id: 'clear-route', title: '清空到场路线', icon: Trash2, group: '动作' });
  items.push({ id: 'toggle-draw', title: s.drawMode ? '取消划定区域' : '划定区域', icon: PenLine, group: '动作' });
  return items;
}

export function filterActionItems(items: PaletteActionDef[], q: string): PaletteActionDef[] {
  return q ? items.filter((a) => a.title.includes(q) || a.id.includes(q)) : items;
}

export function filterUnits<T extends { name: string; unitType: string }>(units: T[], q: string, limit = 6): T[] {
  if (!q) return [];
  return units.filter((u) => u.name.includes(q) || (u.unitType ?? '').includes(q)).slice(0, limit);
}

export function buildAddressDefs(
  cs: Array<{ lng: number; lat: number; address: string; level: string }>,
  limit = 6,
): Array<{ id: string; title: string; subtitle: string; group: '地址' }> {
  return cs.slice(0, limit).map((c) => ({
    id: `addr-${c.lng}-${c.lat}`,
    title: c.address,
    subtitle: `${c.lng.toFixed(5)}, ${c.lat.toFixed(5)} · ${c.level}`,
    group: '地址' as const,
  }));
}
```

Run: `source ~/.nvm/nvm.sh && npx vitest run lib/__tests__/palette-items.test.ts`

- [ ] **Step 3: RealGisMap 接线（1046-1151 行 effect 改写）**

effect 体内：动作 def 由 `buildActionItems({ baseMap, hasPlanned: planned.length > 0, drawMode })` + `filterActionItems` 得到，组件用 `id → run` 映射表附加 run 闭包（`toggle-base`→切底图+close、`batch-geocode`→batchGeocode+close、`clear-route`→clearRoutes+close、`toggle-draw`→drawMode?cancelDraw:startDraw+close）；单位由 `filterUnits(keyUnits, q)` 后 map 成 PaletteItem（icon Building2，run flyTo 16 级）；地址由 `buildAddressDefs(cs)` 后 map（icon MapPin，run setQueryMarker+flyTo）。异步追加逻辑、loading、`alive` 守卫原样保留。

- [ ] **Step 4: 验证 + Commit**

Run: `source ~/.nvm/nvm.sh && npm run typecheck && npm test && npm run build`

```bash
git add lib/gis/palette-items.ts lib/__tests__/palette-items.test.ts src/components/RealGisMap.tsx
git commit -m "refactor(gis): 命令面板条目构建下沉 lib/gis/palette-items

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 8: `use-leaflet-map.ts` — 地图初始化/底图/降级 hook

**Files:**
- Create: `src/components/gis/hooks/use-leaflet-map.ts`
- Modify: `src/components/RealGisMap.tsx:88-112`（部分 ref 声明）、`:186-255`（初始化/zoom/底图三个 effect）

**Interfaces:**
- Produces（Task 9-11 全部依赖）:

```ts
export interface GisLayers {
  boundary: L.LayerGroup | null; stations: L.LayerGroup | null; water: L.LayerGroup | null;
  highlight: L.LayerGroup | null; keyUnits: L.LayerGroup | null; incidents: L.LayerGroup | null;
  buildings: L.LayerGroup | null; regions: L.LayerGroup | null; route: L.LayerGroup | null;
  temp: L.LayerGroup | null;
}
export function useLeafletMap(
  rootRef: React.RefObject<HTMLDivElement | null>,
  onDrawCreated: (e: any) => void,
): {
  mapRef: React.MutableRefObject<L.Map | null>;
  layers: GisLayers;            // 用 useRef 持有,值在初始化时填充;返回的是稳定引用
  mapInited: boolean;
  zoom: number;
  baseMap: 'vector' | 'satellite';
  setBaseMap: React.Dispatch<React.SetStateAction<'vector' | 'satellite'>>;
  tilesFailed: boolean;
}
```

- [ ] **Step 1: 创建 hook，搬家三块逻辑**

从 RealGisMap 逐字搬：186-216 初始化 effect（含 11 个 LayerGroup 创建、`draw:created` 绑定、清理函数）、218-227 zoom 同步 effect、229-255 底图切换 effect（含 tileerror 降级）。`VECTOR_URL/SAT_URL/TILE_ERR_THRESHOLD/DEFAULT_ZOOM` 常量随 hook 搬走；`DEFAULT_CENTER` 留在组件（sceneLog resetView 也用）。`layers` 用一个 `useRef<GisLayers>` 持有，初始化 effect 里填充。

- [ ] **Step 2: RealGisMap 接线**

删 88-112 行中被 hook 接管的 ref（mapRef/vectorLayerRef/satLayerRef/boundaryLayerRef/各 LayerGroup ref/tileErrRef），改为：

```ts
const { mapRef, layers, mapInited, zoom, baseMap, setBaseMap, tilesFailed } = useLeafletMap(rootRef, onDrawCreated);
```

组件内其余引用点全局替换：`boundaryLayerRef.current` → `layers.boundary`、`waterLayerRef.current` → `layers.water` 等（11 个名字逐一替换，用编辑器的精确替换，注意 `routeLayerRef.current` → `layers.route`、`tempLayerRef.current` → `layers.temp`、`highlightLayerRef.current` → `layers.highlight`）。marker 注册表 ref（markersRef 等 7 个）与数据 ref（stationsRef/waterRef/waterClustersRef）**留在组件**。

- [ ] **Step 3: 验证 + Commit**

Run: `source ~/.nvm/nvm.sh && npm run typecheck && npm run build`
Expected: 通过（本任务无新单测；冒烟在 Task 12 统一做）

```bash
git add src/components/gis/hooks/use-leaflet-map.ts src/components/RealGisMap.tsx
git commit -m "refactor(gis): 地图初始化/底图/降级抽 use-leaflet-map

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 9: `use-gis-data.ts` + `use-layer-visibility.ts`

**Files:**
- Create: `src/components/gis/hooks/use-gis-data.ts`
- Create: `src/components/gis/hooks/use-layer-visibility.ts`
- Modify: `src/components/RealGisMap.tsx:114-127, 160, 257-413`（数据 effect）、`:1407-1468`（7 个显隐 effect）

**Interfaces:**
- Consumes: Task 8 的 `mapRef / layers / mapInited`
- Produces:

```ts
export function useGisData(deps: {
  mapRef: React.MutableRefObject<L.Map | null>;
  mapInited: boolean;
  hiddenWaterDistricts: string[];   // layerPrefs.hiddenWaterDistricts 传入
}): {
  stations: Station[]; stationsRef: React.MutableRefObject<Station[]>;
  resources: ResourceItem[];
  water: WaterSource[]; waterRef: React.MutableRefObject<WaterSource[]>;
  waterClusters: WaterCluster[];
  keyUnits: KeyUnit[]; setKeyUnits: React.Dispatch<React.SetStateAction<KeyUnit[]>>;
  incidents: Incident[];
  buildings: KeyBuilding[]; setBuildings: React.Dispatch<React.SetStateAction<KeyBuilding[]>>;
  regions: Region[]; setRegions: React.Dispatch<React.SetStateAction<Region[]>>;
  loadState: 'loading' | 'ok' | 'error';
  bumpWater: () => void;            // 原 setWaterTick(t=>t+1),实体增删改后触发 bbox 重取
}

export function useLayerVisibility(
  mapRef: React.MutableRefObject<L.Map | null>,
  layers: GisLayers,
  mapInited: boolean,
  flags: { boundary: boolean; stations: boolean; water: boolean; incidents: boolean; keyUnits: boolean; buildings: boolean; regions: boolean },
): void
```

- [ ] **Step 1: `use-gis-data.ts` — 搬 7 个数据加载 effect**

逐字搬：257-274（站）、276-287（资源）、289-361（水源视口，含 seq/防抖/"数据集没变跳过 setState 保 popup"隐藏行为——搬家时保留并加注释）、363-374（单位）、376-387（警情）、389-400（建筑）、402-413（区域）。`waterTick` state 收进 hook，对外暴露 `bumpWater`。

- [ ] **Step 2: `use-layer-visibility.ts` — 7 个显隐 effect 合一**

```ts
import { useEffect } from 'react';
import type L from 'leaflet';
import type { GisLayers } from './use-leaflet-map';

/** 图层显隐:flag 变化时 addTo/removeLayer(替代原 7 个逐字重复的 effect)。 */
export function useLayerVisibility(
  mapRef: React.MutableRefObject<L.Map | null>,
  layers: GisLayers,
  mapInited: boolean,
  flags: { boundary: boolean; stations: boolean; water: boolean; incidents: boolean; keyUnits: boolean; buildings: boolean; regions: boolean },
): void {
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapInited) return;
    (Object.keys(flags) as Array<keyof typeof flags>).forEach((k) => {
      const layer = layers[k];
      if (!layer) return;
      if (flags[k]) layer.addTo(map);
      else map.removeLayer(layer);
    });
    // 逐 key 依赖,与原 7 个独立 effect 的触发时机一致
  }, [mapInited, flags.boundary, flags.stations, flags.water, flags.incidents, flags.keyUnits, flags.buildings, flags.regions]);
}
```

- [ ] **Step 3: RealGisMap 接线**

删对应 state/effect，改两行 hook 调用；`layerPrefs.hiddenWaterDistricts` 作为参数传入；显隐 flags 从现有 `showBoundary` 等 state 组装。水源渲染 effect 的依赖 `water, waterClusters` 来自 hook 返回值，其余不变。

- [ ] **Step 4: 验证 + Commit**

Run: `source ~/.nvm/nvm.sh && npm run typecheck && npm run build`

```bash
git add src/components/gis/hooks/use-gis-data.ts src/components/gis/hooks/use-layer-visibility.ts src/components/RealGisMap.tsx
git commit -m "refactor(gis): 数据加载与图层显隐抽 use-gis-data/use-layer-visibility

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 10: 面板群 hooks — `use-deploy-routes` / `use-coord-fix` / `use-entity-form`

**Files:**
- Create: `src/components/gis/hooks/use-deploy-routes.ts`
- Create: `src/components/gis/hooks/use-coord-fix.ts`
- Create: `src/components/gis/hooks/use-entity-form.ts`
- Modify: `src/components/RealGisMap.tsx:138-169`（面板 state）、`:509-602`（highlight/deploy/plan/clear）、`:604-801`（coordFix + entityForm 逻辑）、`:988-1032`（锚点跟随 + 画区域）、`:1563-1621`（右键创建菜单/拾取/临时标记）

**Interfaces:**
- Produces:

```ts
export function useDeployRoutes(deps: { mapRef; routeLayer: L.LayerGroup | null; highlightLayer: L.LayerGroup | null; stationsRef }): {
  deploy: DeployState | null; openDeploy: (t: { name: string; lng: number; lat: number }) => void; closeDeploy: () => void;
  planned: PlannedRoute[]; setPlanned: React.Dispatch<React.SetStateAction<PlannedRoute[]>>;
  planning: boolean; planRoutes: (stationIds: string[]) => Promise<void>;
  clearRoutes: () => void; highlightNearbyWater: (t: { lng: number; lat: number }) => void;
}
// 搬:highlightNearbyWater(509-528)、openDeploy(530-545)、planRoutes(Task 3 重写版)、clearRoutes(598-602)、
//     deploy 锚点跟随 effect(1002-1014)。closeDeploy = 原 onClose 的 setDeploy(null)+clearRoutes。

export function useCoordFix(deps: { setKeyUnits; setBuildings }): {
  coordFix, draftCoord, setDraftCoord, pickMode, setPickMode, geoCandidates, setGeoCandidates,
  geoQuerying, coordSaving, coordError, openCoordFix, closeCoordFix, queryAddress, saveCoord, batchGeocode,
}
// 搬:604-674 全部。batchGeocode 依赖 setKeyUnits,saveCoord 依赖 setKeyUnits/setBuildings → 由 deps 注入。

export function useEntityForm(deps: { keyUnits; setKeyUnits; setBuildings; waterRef; bumpWater; setGeoCandidates; setPickMode; setCoordFix }): {
  entityForm, setEntityForm, entitySaving, entityError, createMenu, setCreateMenu,
  openEntityCreate, openEntityEdit, saveEntity, deleteEntity,
}
// 搬:677-801。与 coordFix 的交叉(closeXxx 互调、geoCandidates/pickMode 共享)通过 deps 注入,不合并两个 hook。
```

**注意**：pickMode 点击回填 effect（1581-1600）同时写 coordFix 与 entityForm 两家状态 → **留在编排者**（约 20 行），参数从两个 hook 的返回值拿。临时标记层 effect（1602-1621）也留编排者（依赖 draftCoord/coordFix/queryMarker）。右键创建菜单 effect（1563-1579）随 use-entity-form 搬（deps 加 `mapRef, mapInited, setRadial`）。forcePanel 锚点跟随 effect（988-1000）留编排者。

- [ ] **Step 1: 创建 `use-deploy-routes.ts` 并接线**
- [ ] **Step 2: 创建 `use-coord-fix.ts` 并接线**
- [ ] **Step 3: 创建 `use-entity-form.ts` 并接线**
- [ ] **Step 4: 每步接线后跑 `npm run typecheck`，三个 hook 全部接完再统一验证**

Run: `source ~/.nvm/nvm.sh && npm run typecheck && npm run build`

- [ ] **Step 5: Commit**

```bash
git add src/components/gis/hooks/use-deploy-routes.ts src/components/gis/hooks/use-coord-fix.ts src/components/gis/hooks/use-entity-form.ts src/components/RealGisMap.tsx
git commit -m "refactor(gis): 派遣/坐标修正/实体表单面板状态抽为三个 hook

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 11: `use-scene-bridge.ts` — sceneLog 执行器 hook

**Files:**
- Create: `src/components/gis/hooks/use-scene-bridge.ts`
- Modify: `src/components/RealGisMap.tsx:1470-1561`（订阅 effect）

**Interfaces:**
- Consumes: Task 3 的 `renderRoutes`；Task 8/9 的 refs
- Produces:

```ts
export function useSceneBridge(deps: {
  mapRef: React.MutableRefObject<L.Map | null>;
  routeLayer: L.LayerGroup | null;
  defaultCenter: [number, number];          // DEFAULT_CENTER
  defaultZoom: number;                       // DEFAULT_ZOOM
  stationsRef: React.MutableRefObject<Station[]>;
  waterRef: React.MutableRefObject<WaterSource[]>;
  stationMarkers: React.MutableRefObject<Map<string, L.Marker>>;
  waterMarkers: React.MutableRefObject<Map<string, L.Marker>>;
  setPlanned: React.Dispatch<React.SetStateAction<PlannedRoute[]>>;
}): void
```

- [ ] **Step 1: 创建 hook，搬订阅 effect（1470-1561）**

逐字搬 flyTo/addMarker 分支（含 400ms×6 重试 openPopup、后端 keyword 兜底）、resetView 分支；showRoute 分支已是 Task 3 的 renderRoutes 版本，直接搬。`DEFAULT_CENTER/DEFAULT_ZOOM` 以 deps 传入。

- [ ] **Step 2: RealGisMap 接线 + 验证 + Commit**

Run: `source ~/.nvm/nvm.sh && npm run typecheck && npm run build`

```bash
git add src/components/gis/hooks/use-scene-bridge.ts src/components/RealGisMap.tsx
git commit -m "refactor(gis): sceneLog 执行器抽 use-scene-bridge

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 12: 收尾验收 + 冒烟

**Files:**
- Modify: `src/components/RealGisMap.tsx:1-7`（文件头注释更新为新结构说明）

- [ ] **Step 1: 行数验收**

Run: `source ~/.nvm/nvm.sh && wc -l src/components/RealGisMap.tsx src/components/gis/hooks/*.ts lib/gis/*.ts lib/http.ts`
Expected: `RealGisMap.tsx` ≤450 行；任一 hook ≤200 行；lib/gis 单文件 ≤150 行。若 RealGisMap 超 450，把 JSX 中 tilesFailed 占位块（1755-1783）抽为 `gis/TileFallback.tsx` 小组件补足。

- [ ] **Step 2: 更新文件头注释**

RealGisMap.tsx 头注释改为反映新职责（编排者：状态声明 + hook 组装 + JSX；渲染纯函数在 lib/gis/；数据/显隐/sceneLog 在 hooks/）。

- [ ] **Step 3: 全量验证**

Run: `source ~/.nvm/nvm.sh && npm run typecheck && npm test && npm run build`
Expected: 全绿

- [ ] **Step 4: 手动冒烟清单（`npm run dev` 后逐项过）**

```
□ 底图矢量/卫星切换;瓦片失败降级提示(可断网验证)
□ 消防站:点击 flyTo + popup(在位人数);右键圆环 定位/详情/力量明细
□ 水源:zoom<13 不加载 → 13-14 聚合气泡(点击放大) → >=15 逐点;右键 编辑/删除
□ 重点单位:zoom<14 聚合气泡;>=14 逐点;警情单位红色圆环+左键直弹派遣;高风险 ! 角标
□ 警情:独立警情点位左键弹派遣;右键 派遣/周边水源/详情
□ 重点建筑/重点区域:聚合/多边形 hover/点击适窗
□ 派遣:右键单位→路线→选站→规划(多色 polyline+贴线标签+适窗);清空路线
□ 坐标修正:地址查询/地图拾取/手动输入三来源 + 保存;批量补全
□ 右键空白:新增水源/单位/建筑;表单保存/删除
□ Ctrl+K:动作/单位/地址三组;键盘导航
□ 划定区域:画多边形→命名→保存→刷新显示
□ sceneLog:面板触发的 flyTo/showRoute 正常;MCP 通道 showRoute 回灌(若有环境)
```

- [ ] **Step 5: Commit**

```bash
git add src/components/RealGisMap.tsx
git commit -m "refactor(gis): RealGisMap 收尾(≤450 行编排者)+ 文件头注释更新

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## 附：风险与注意

1. **Task 8-11 是纯搬家**，无单测；每步 typecheck+build 是底线，Task 12 冒烟清单是最终闸门
2. **隐藏行为清单**（搬家时必须逐字保留）：水源"数据集没变跳过 setState 保 popup"（原 318-323）、popup 重建后恢复 openId（原 1183-1184, 1212）、警情单位左键 closePopup（原 1269）、showRoute 跳过 `source === '面板'`（防重复）
3. Task 2 中 `updateKeyUnitCoords` / `geocodeMissingKeyUnits` 等**错误消息不同的函数保持手写**，不强行收编
4. 工作区有其他未提交改动，每个 commit 精确 `git add` 本任务文件
