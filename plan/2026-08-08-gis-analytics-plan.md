# GIS 子项目4:灾情响应 ETA 分析 + 3D引导 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 围绕乐盈广场21号楼演示场景,GIS 实现"选中灾情建筑 → 5km 内消防站驾车 ETA 染色 + 估算参考圈 + 最近站路线"响应分析,并能引导进入该建筑 3D 建模。

**Architecture:** 复用现有 `/route/driving` 代理取每站 ETA(无需 zyna 新端点);前端 `lib/gis` 纯函数(ETA 配色/筛选/排序,可单测)+ 渲染器(染色环 + 参考圈,import type L + require)+ `use-incident-response` hook 编排;3D引导把 building.scene_id 经 `KeyBuilding → RadialTarget → radialActions` 数据链带到「进入3D」动作,通过 **prop callback**(`onEnterScene`)通知 App 切 `RealSceneView`。

**Tech Stack:** Next.js 16 + React 19 + TS + Leaflet 1.9 + vitest(node) + zyna(FastAPI/alembic) + uStudio sceneSdk

## Global Constraints

- 坐标系:全库 GCJ02(driving 输入输出 GCJ02,无需基准转换)
- vitest node 环境:`lib/gis` 凡需 Leaflet 运行时的模块统一 `import type L from 'leaflet'` + 函数内 `require('leaflet')`(顶层 import 会炸);测试放 `lib/gis/__tests__/*.test.ts`
- `lib/` 不 import `src/`(vitest `@` 别名只映射仓库根);渲染器用结构类型入参
- amap_key 仅存 zyna 后端,前端经 `/api/business` 代理;driving 经 `@/api/route` 的 `fetchDrivingRoute`
- 演示锚点:乐盈广场21号楼 `key_buildings.id = 1c2d4772-831d-4c77-b88a-f9565ad589c7`,uStudio `scene_id = 465718852859613184`
- 已知基线失败套件 `lib/scene-command-bus/__tests__/{bridge,handlers}.test.ts` 不动(与本工作无关)
- 设计依据:`plan/2026-08-08-gis-analytics-design.md`(Task 0 已完成:reachcircle 驾车不可用 → ETA 染色;21号楼 scene_id 已确认)
- `GisLayers` 现有字段:boundary/stations/water/highlight/keyUnits/incidents/buildings/regions/**route**/temp(无 response,本计划新增 `incidentResponse`)
- `RealGisMap` 当前无 props(`export default function RealGisMap()`);3D引导用 prop callback,不用 scene-command-bus(其 `ustudio:scene` 是 uStudio→app 方向事件,非切换通道)

## File Structure

| 文件 | 职责 | 类型 |
|---|---|---|
| `lib/gis/eta-render.ts` | ETA→颜色 level、5min 估算半径、时间格式化(纯函数) | 新 |
| `lib/gis/response-query.ts` | 5km 站筛选(haversineKm)、按 ETA 排序(纯函数) | 新 |
| `lib/gis/render-response.ts` | 染色环 + 参考圈 Leaflet 渲染 + 清除(import type L + require) | 新 |
| `lib/gis/__tests__/eta-render.test.ts` | eta-render 纯函数单测 | 新 |
| `lib/gis/__tests__/response-query.test.ts` | response-query 纯函数单测 | 新 |
| `src/components/gis/hooks/use-incident-response.ts` | 编排:筛选→批量 driving→染色+参考圈+最近站路线 | 新 |
| `src/components/gis/hooks/use-layer-visibility.ts` | flags 加 `incidentResponse` | 改 |
| `src/components/gis/hooks/use-leaflet-map.ts` | `GisLayers` 加 `incidentResponse` + 创建图层 | 改 |
| `src/components/RealGisMap.tsx` | 接入 hook + 图层开关 + `onEnterScene` prop + radialActions 加「响应分析」「进入3D」 | 改 |
| `src/App.tsx` | `<RealGisMap onEnterScene={setSelectedSceneId} />` | 改 |
| `lib/key-building-mapper.ts` | `KeyBuilding` 加 `sceneId?`(3D引导数据链) | 改 |
| `lib/gis/radial-target.ts` | `RadialTarget` 加 `sceneId?` | 改 |
| `lib/gis/render-key-buildings.ts` | `RenderKeyBuilding` 加 `sceneId?`;onRadial 传 sceneId | 改 |
| zyna `alembic/versions/..._key_building_scene_id.py` | key_buildings.scene_id 加列 | 新 |
| zyna 数据 | 21号楼 scene_id = 465718852859613184 | UPDATE |

---

## Task 1:ETA 纯函数(eta-render + response-query)+ 单测

**Files:**
- Create: `lib/gis/eta-render.ts`
- Create: `lib/gis/response-query.ts`
- Create: `lib/gis/__tests__/eta-render.test.ts`
- Create: `lib/gis/__tests__/response-query.test.ts`

**Interfaces:**
- Produces:
  - `etaColor(etaSec: number, targetMin?: number): 'green'|'yellow'|'red'`(默认 targetMin=5:<=300s 绿/300–600 黄/>600 红;targetMin=10 阈值翻倍)
  - `estimateRadiusKm(minutes: number, speedKmh?: number): number`(默认 30km/h:5min→2.5km,10min→5km)
  - `formatEta(sec: number): string`
  - `selectWithinKm(stations: StationRef[], center: {lng,lat}, km: number): StationRef[]`(用 `haversineKm`)
  - `rankByEta(items: EtaItem[]): EtaItem[]`(etaSec 升序)
  - 类型 `StationRef {id,name,lng,lat}`、`EtaItem {id,name,lat,lng,etaSec,distanceM}`

- [ ] **Step 1: 写 eta-render 失败测试**

```ts
// lib/gis/__tests__/eta-render.test.ts
import { describe, it, expect } from 'vitest';
import { etaColor, estimateRadiusKm, formatEta } from '../eta-render';

describe('etaColor', () => {
  it('5min 档:<=300 绿 / 300–600 黄 / >600 红', () => {
    expect(etaColor(120)).toBe('green');
    expect(etaColor(300)).toBe('green');
    expect(etaColor(301)).toBe('yellow');
    expect(etaColor(600)).toBe('yellow');
    expect(etaColor(601)).toBe('red');
  });
  it('targetMin=10 阈值翻倍', () => {
    expect(etaColor(600, 10)).toBe('green');
    expect(etaColor(601, 10)).toBe('yellow');
    expect(etaColor(1201, 10)).toBe('red');
  });
});

describe('estimateRadiusKm', () => {
  it('5min@30km/h=2.5km,10min=5km', () => {
    expect(estimateRadiusKm(5)).toBeCloseTo(2.5);
    expect(estimateRadiusKm(10)).toBeCloseTo(5);
  });
});

describe('formatEta', () => {
  it('秒 / 分秒 / 整分', () => {
    expect(formatEta(45)).toBe('45秒');
    expect(formatEta(125)).toBe('2分5秒');
    expect(formatEta(120)).toBe('2分钟');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `source ~/.nvm/nvm.sh && npx vitest run lib/gis/__tests__/eta-render.test.ts`
Expected: FAIL(模块不存在)

- [ ] **Step 3: 实现 eta-render.ts**

```ts
// lib/gis/eta-render.ts
// 灾情响应 ETA 配色 / 估算半径 / 格式化(纯函数,无 Leaflet/IO)。

export type EtaLevel = 'green' | 'yellow' | 'red';

/** ETA → 到场等级。targetMin 为目标到场分钟(默认 5):<=target 绿 / target~2×target 黄 / >2×target 红。 */
export function etaColor(etaSec: number, targetMin = 5): EtaLevel {
  const target = targetMin * 60;
  if (etaSec <= target) return 'green';
  if (etaSec <= target * 2) return 'yellow';
  return 'red';
}

/** 5min 驾车估算半径(城区默认 30km/h):minutes/60 × speedKmh。 */
export function estimateRadiusKm(minutes: number, speedKmh = 30): number {
  return (minutes / 60) * speedKmh;
}

/** 秒 → "45秒" / "2分5秒" / "2分钟"。 */
export function formatEta(sec: number): string {
  if (sec < 60) return `${Math.round(sec)}秒`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return s > 0 ? `${m}分${s}秒` : `${m}分钟`;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `source ~/.nvm/nvm.sh && npx vitest run lib/gis/__tests__/eta-render.test.ts`
Expected: PASS

- [ ] **Step 5: 写 response-query 失败测试**

```ts
// lib/gis/__tests__/response-query.test.ts
import { describe, it, expect } from 'vitest';
import { selectWithinKm, rankByEta } from '../response-query';

describe('selectWithinKm', () => {
  it('筛 center 5km 内的站', () => {
    const stations = [
      { id: 'a', name: '近站', lng: 115.95, lat: 29.66 },   // ~0.3km
      { id: 'b', name: '远站', lng: 116.05, lat: 29.66 },    // ~9km
    ];
    const r = selectWithinKm(stations, { lng: 115.9475, lat: 29.6612 }, 5);
    expect(r.map((s) => s.id)).toEqual(['a']);
  });
});

describe('rankByEta', () => {
  it('按 etaSec 升序,不改原数组', () => {
    const items = [
      { id: 'a', name: 'A', lat: 0, lng: 0, etaSec: 600, distanceM: 0 },
      { id: 'b', name: 'B', lat: 0, lng: 0, etaSec: 120, distanceM: 0 },
    ];
    expect(rankByEta(items).map((i) => i.id)).toEqual(['b', 'a']);
    expect(items[0].id).toBe('a'); // 原数组不变
  });
});
```

- [ ] **Step 6: 跑测试确认失败**

Run: `source ~/.nvm/nvm.sh && npx vitest run lib/gis/__tests__/response-query.test.ts`
Expected: FAIL(模块不存在)

- [ ] **Step 7: 实现 response-query.ts**

```ts
// lib/gis/response-query.ts
// 灾情响应:5km 站筛选 + ETA 排序(纯函数)。haversineKm 复用 lib/geo-query。
import { haversineKm } from '../geo-query';

export interface StationRef {
  id: string;
  name: string;
  lng: number;
  lat: number;
}

export interface EtaItem {
  id: string;
  name: string;
  lat: number;
  lng: number;
  etaSec: number;
  distanceM: number;
}

/** 筛 center 半径 km 内的站(haversine 直线距离)。 */
export function selectWithinKm(stations: StationRef[], center: { lng: number; lat: number }, km: number): StationRef[] {
  return stations.filter((s) => haversineKm(s.lng, s.lat, center.lng, center.lat) <= km);
}

/** 按 ETA 升序(返回新数组,不改原数组)。 */
export function rankByEta(items: EtaItem[]): EtaItem[] {
  return [...items].sort((a, b) => a.etaSec - b.etaSec);
}
```

- [ ] **Step 8: 跑全部新测试确认通过**

Run: `source ~/.nvm/nvm.sh && npx vitest run lib/gis/__tests__/`
Expected: PASS(2 文件全过)

- [ ] **Step 9: Commit**

```bash
git add lib/gis/eta-render.ts lib/gis/response-query.ts lib/gis/__tests__/
git commit -m "feat(gis): ETA 配色/筛选/排序纯函数 + 单测(子项目4 Task1)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 2:响应渲染器 render-response(染色环 + 参考圈)

**Files:**
- Create: `lib/gis/render-response.ts`

**Interfaces:**
- Consumes: `etaColor`/`estimateRadiusKm`/`formatEta` from `./eta-render`(Task 1)
- Produces:
  - `renderResponseEta(layer: L.LayerGroup, items: ResponseEtaItem[], targetMin?: number): void`
  - `renderReferenceCircle(layer: L.LayerGroup, center: {lat,lng}, minutes?: number): void`
  - `clearResponseLayer(layer: L.LayerGroup | null): void`
  - 类型 `ResponseEtaItem {id,name,lat,lng,etaSec}`

> 说明:Leaflet 渲染是 DOM 副作用,node 环境(vitest)无 DOM 无法直接单测——与现有 `render-water.ts`/`render-stations.ts` 一致(均无单测,靠人工冒烟)。配色/半径/排序纯逻辑已在 Task 1 覆盖。

- [ ] **Step 1: 实现 render-response.ts**

```ts
// lib/gis/render-response.ts
// 灾情响应图层渲染:每站染色环(ETA 颜色)+ 灾情点 5min 估算参考圈。
// 模式同 render-water:import type L + 函数内 require('leaflet')(vitest node 约束)。
import type L from 'leaflet';
import { etaColor, estimateRadiusKm, formatEta, type EtaLevel } from './eta-render';

export interface ResponseEtaItem {
  id: string;
  name: string;
  lat: number;
  lng: number;
  etaSec: number;
}

const ETA_COLOR_HEX: Record<EtaLevel, string> = {
  green: '#34d399',
  yellow: '#fbbf24',
  red: '#ef4444',
};

/** 渲染每站染色环(ETA 颜色 circleMarker + tooltip)。叠加在站 marker 上,不侵入 stations 图层。 */
export function renderResponseEta(layer: L.LayerGroup, items: ResponseEtaItem[], targetMin = 5): void {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const L: typeof import('leaflet') = require('leaflet');
  for (const it of items) {
    const hex = ETA_COLOR_HEX[etaColor(it.etaSec, targetMin)];
    L.circleMarker([it.lat, it.lng], {
      radius: 14,
      color: hex,
      weight: 2,
      fillColor: hex,
      fillOpacity: 0.18,
    })
      .bindTooltip(`${it.name} · 到场 ${formatEta(it.etaSec)}`, { direction: 'top', className: 'gis-tip' })
      .addTo(layer);
  }
}

/** 渲染灾情点 5min 驾车估算参考圈(虚线,标注估算)。 */
export function renderReferenceCircle(layer: L.LayerGroup, center: { lat: number; lng: number }, minutes = 5): void {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const L: typeof import('leaflet') = require('leaflet');
  const radiusKm = estimateRadiusKm(minutes);
  L.circle([center.lat, center.lng], {
    radius: radiusKm * 1000,
    color: '#22d3ee',
    weight: 1,
    opacity: 0.5,
    dashArray: '6 6',
    fill: false,
  })
    .bindTooltip(`${minutes}分钟驾车估算圈(~${radiusKm.toFixed(1)}km)`, {
      direction: 'top',
      className: 'gis-tip',
    })
    .addTo(layer);
}

/** 清除响应图层(染色环 + 参考圈)。 */
export function clearResponseLayer(layer: L.LayerGroup | null): void {
  layer?.clearLayers();
}
```

- [ ] **Step 2: typecheck 确认类型正确**

Run: `source ~/.nvm/nvm.sh && npx tsc --noEmit`
Expected: 无新增错误(基线错误除外)

- [ ] **Step 3: Commit**

```bash
git add lib/gis/render-response.ts
git commit -m "feat(gis): 响应渲染器(染色环+估算参考圈)(子项目4 Task2)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 3:use-incident-response 编排 hook

**Files:**
- Create: `src/components/gis/hooks/use-incident-response.ts`

**Interfaces:**
- Consumes:
  - `selectWithinKm`/`rankByEta`/`EtaItem` from `@/lib/gis/response-query`(Task 1)
  - `renderResponseEta`/`renderReferenceCircle`/`clearResponseLayer` from `@/lib/gis/render-response`(Task 2)
  - `fetchDrivingRoute(from:{lng,lat}, to:{lng,lat}) → {polyline,distance,duration,trafficLights}` from `@/api/route`(已有)
  - `renderRoutes(layer, RouteRenderItem[]) → {bounds,summary}`、`RouteRenderItem` from `@/lib/gis/route-render`(已有)
  - `Station`(含 id/name/lng/lat) from `@/mock/types`
- Produces:
  - `useIncidentResponse(deps) → { responseState, analyze, clearResponse }`
  - `deps: { mapRef, responseLayer, routeLayer, stationsRef, stationsVisible }`
  - `analyze(target: ResponseTarget, targetMin?: number): Promise<void>`
  - `ResponseTarget { name, lng, lat }`、`ResponseState { target, items: EtaItem[], nearestId, targetMin, loading, error? }`

> 说明:hook 是 IO 编排(并发 driving + 渲染副作用),靠人工冒烟;纯逻辑(筛选/排序/配色)已在 Task 1 覆盖。

- [ ] **Step 1: 实现 use-incident-response.ts**

```ts
'use client';
// 灾情响应分析 hook:选中灾情建筑 → 筛 5km 可见站 → 批量 driving 取 ETA
// → 染色环 + 估算参考圈 + 最近站一条路线。从 RealGisMap 编排,纯逻辑在 lib/gis。
import { useCallback, useState } from 'react';
import L from 'leaflet';
import type { Station } from '@/mock/types';
import { fetchDrivingRoute } from '@/api/route';
import { selectWithinKm, rankByEta, type EtaItem } from '@/lib/gis/response-query';
import {
  renderResponseEta,
  renderReferenceCircle,
  clearResponseLayer,
} from '@/lib/gis/render-response';
import { renderRoutes, type RouteRenderItem } from '@/lib/gis/route-render';

export interface ResponseTarget {
  name: string;
  lng: number;
  lat: number;
}

export interface ResponseState {
  target: ResponseTarget;
  items: EtaItem[];
  nearestId: string | null;
  targetMin: number;
  loading: boolean;
  error?: string;
}

const RESPONSE_RADIUS_KM = 5;

export function useIncidentResponse(deps: {
  mapRef: React.MutableRefObject<L.Map | null>;
  responseLayer: L.LayerGroup | null;
  routeLayer: L.LayerGroup | null;
  stationsRef: React.MutableRefObject<Station[]>;
  stationsVisible: boolean;
}): {
  responseState: ResponseState | null;
  analyze: (target: ResponseTarget, targetMin?: number) => Promise<void>;
  clearResponse: () => void;
} {
  const { mapRef, responseLayer, routeLayer, stationsRef, stationsVisible } = deps;
  const [state, setState] = useState<ResponseState | null>(null);

  const analyze = useCallback(
    async (target: ResponseTarget, targetMin = 5) => {
      const map = mapRef.current;
      if (!map || !responseLayer) return;

      // 前置:stations 小眼睛关闭或无站 → 空态
      if (!stationsVisible || stationsRef.current.length === 0) {
        clearResponseLayer(responseLayer);
        setState({
          target,
          items: [],
          nearestId: null,
          targetMin,
          loading: false,
          error: '5km 内无可见消防站(检查消防站图层小眼睛)',
        });
        return;
      }

      setState({ target, items: [], nearestId: null, targetMin, loading: true });
      clearResponseLayer(responseLayer);
      routeLayer?.clearLayers();
      renderReferenceCircle(responseLayer, { lat: target.lat, lng: target.lng }, targetMin);

      const within = selectWithinKm(
        stationsRef.current.map((s) => ({ id: s.id, name: s.name, lng: s.lng, lat: s.lat })),
        { lng: target.lng, lat: target.lat },
        RESPONSE_RADIUS_KM,
      );
      if (within.length === 0) {
        setState({
          target,
          items: [],
          nearestId: null,
          targetMin,
          loading: false,
          error: `5km 内无可见消防站`,
        });
        return;
      }

      // 并发:每站→灾情点 driving;单站失败跳过
      const results = (
        await Promise.all(
          within.map(async (s) => {
            try {
              const r = await fetchDrivingRoute(
                { lng: s.lng, lat: s.lat },
                { lng: target.lng, lat: target.lat },
              );
              return {
                id: s.id,
                name: s.name,
                lat: s.lat,
                lng: s.lng,
                etaSec: r.duration,
                distanceM: r.distance,
              } as EtaItem;
            } catch {
              return null;
            }
          }),
        )
      ).filter((x): x is EtaItem => x !== null);

      const ranked = rankByEta(results);
      renderResponseEta(responseLayer, ranked, targetMin);

      // 最近站一条路线(复用 route-render)
      if (ranked.length > 0 && routeLayer) {
        const nearest = ranked[0];
        const s = stationsRef.current.find((x) => x.id === nearest.id);
        if (s) {
          try {
            const r = await fetchDrivingRoute(
              { lng: s.lng, lat: s.lat },
              { lng: target.lng, lat: target.lat },
            );
            const item: RouteRenderItem = {
              stationId: s.id,
              stationName: s.name,
              polyline: r.polyline,
              distance: r.distance,
              duration: r.duration,
              trafficLights: r.trafficLights,
            };
            renderRoutes(routeLayer, [item]);
          } catch {
            /* 最近站路线失败不阻塞面板 */
          }
        }
      }

      setState({
        target,
        items: ranked,
        nearestId: ranked[0]?.id ?? null,
        targetMin,
        loading: false,
      });
      map.flyTo([target.lat, target.lng], Math.max(map.getZoom(), 15));
    },
    [mapRef, responseLayer, routeLayer, stationsRef, stationsVisible],
  );

  const clearResponse = useCallback(() => {
    clearResponseLayer(responseLayer);
    routeLayer?.clearLayers();
    setState(null);
  }, [responseLayer, routeLayer]);

  return { responseState: state, analyze, clearResponse };
}
```

- [ ] **Step 2: typecheck 确认**

Run: `source ~/.nvm/nvm.sh && npx tsc --noEmit`
Expected: 无新增错误

- [ ] **Step 3: Commit**

```bash
git add src/components/gis/hooks/use-incident-response.ts
git commit -m "feat(gis): use-incident-response 响应分析编排 hook(子项目4 Task3)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 4:RealGisMap 接入 + 图层开关 + RadialMenu「响应分析」

**Files:**
- Modify: `src/components/gis/hooks/use-leaflet-map.ts`(`GisLayers` 加 `incidentResponse` + 图层创建)
- Modify: `src/components/gis/hooks/use-layer-visibility.ts`(flags 加 `incidentResponse`)
- Modify: `src/components/RealGisMap.tsx`(创建 responseLayer + 接入 hook + showIncidentResponse state + radialActions 加「响应分析」+ 响应面板)

**Interfaces:**
- Consumes: `useIncidentResponse` from `./gis/hooks/use-incident-response`(Task 3)
- Consumes: `RadialAction { key, icon: LucideIcon, label, color, onClick }` from `./gis/RadialMenu`(已有)
- Consumes: `GisLayers.route`(已有,最近站路线图层)、`formatEta`/`etaColor` from `@/lib/gis/eta-render`(Task 1,面板用)

- [ ] **Step 1: GisLayers 加 incidentResponse(use-leaflet-map.ts)**

照现有图层(boundary/stations/.../route/temp)模式:
```ts
// GisLayers 接口加:
incidentResponse: L.LayerGroup | null;
// layersRef 初始化的 useRef 对象里加:
incidentResponse: null,
// 图层创建 effect(useEffect 初始化处)里加:
layers.incidentResponse = L.layerGroup().addTo(map);
```

- [ ] **Step 2: useLayerVisibility flags 加 incidentResponse**

```ts
// use-layer-visibility.ts
// flags 参数类型加 incidentResponse:
flags: { boundary: boolean; stations: boolean; water: boolean; incidents: boolean;
         keyUnits: boolean; buildings: boolean; regions: boolean; incidentResponse: boolean }
// useEffect 依赖数组末尾加: ..., flags.incidentResponse
```

- [ ] **Step 3: RealGisMap 接入 hook + 图层开关**

在 `RealGisMap.tsx`:
- `layers` 解构(来自 useLeafletMap)加 `incidentResponse`
- 加 state:`const [showIncidentResponse, setShowIncidentResponse] = useState(true);`
- `useLayerVisibility` 调用的 flags 对象加 `incidentResponse: showIncidentResponse`
- 调用 hook:

```tsx
const { responseState, analyze, clearResponse } = useIncidentResponse({
  mapRef,
  responseLayer: layers.incidentResponse,
  routeLayer: layers.route, // 复用现有 route 图层(最近站路线,与 use-deploy-routes 同款)
  stationsRef,
  stationsVisible: showStations,
});
```

- [ ] **Step 4: radialActions 加「响应分析」(building 分支)**

在 `radialActions(target)` 的 `target.kind === 'building'` 分支,actions 数组加(lucide-react 的 `Siren` 图标):

```tsx
import { Siren } from 'lucide-react'; // 顶部 import 增补

{
  key: 'response',
  icon: Siren,
  label: '响应分析',
  color: '#ef4444',
  onClick: () => {
    analyze({ name: target.name, lng: target.lng, lat: target.lat });
    setRadial(null);
  },
},
```

- [ ] **Step 5: 响应面板(最小可用)**

在 RealGisMap JSX(`{radial && (...)}` 同级)渲染 `responseState` 面板:`responseState` 非空时显示绝对定位卡(panel-bg/panel-glow):
- 标题:`响应分析 · ${responseState.target.name}`
- loading 态:加载中提示
- error 态:`responseState.error` 文案
- 列表:`responseState.items` 按 ETA 升序(name + formatEta(etaSec) + etaColor 色点)
- 染色图例:绿≤{targetMin}min / 黄 / 红
- 关闭按钮 → `clearResponse()`

```tsx
import { formatEta, etaColor } from '@/lib/gis/eta-render';

{responseState && (
  <div className="absolute right-4 top-20 z-[500] w-64 panel-bg panel-glow rounded-lg p-3">
    <div className="flex items-center justify-between">
      <span className="text-text-1 text-sm font-semibold">响应分析 · {responseState.target.name}</span>
      <button onClick={clearResponse} className="text-text-3 hover:text-cyan">×</button>
    </div>
    {responseState.loading && <div className="text-text-2 text-xs">分析中…</div>}
    {responseState.error && <div className="text-red text-xs">{responseState.error}</div>}
    {!responseState.loading && !responseState.error && (
      <ul className="mt-2 space-y-1">
        {responseState.items.map((it) => (
          <li key={it.id} className="flex items-center gap-2 text-xs">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: { green: '#34d399', yellow: '#fbbf24', red: '#ef4444' }[etaColor(it.etaSec, responseState.targetMin)] }} />
            <span className="text-text-1 flex-1 truncate">{it.name}</span>
            <span className="text-text-2">{formatEta(it.etaSec)}</span>
          </li>
        ))}
      </ul>
    )}
  </div>
)}
```

- [ ] **Step 6: 人工冒烟**

Run: `source ~/.nvm/nvm.sh && npm run dev`,浏览器打开 GIS 页:
1. 消防站小眼睛开、有 21号楼重点建筑 marker
2. 点 21号楼 marker → 圆环菜单出现「响应分析」
3. 点「响应分析」→ 估算参考圈 + 各站染色环(绿/黄/红)+ 最近站流动路线 + 面板按 ETA 排序
4. 关菜单/选别的建筑 → 响应图层清除
5. 关消防站小眼睛再「响应分析」→ 空态"5km 内无可见消防站"

- [ ] **Step 7: typecheck + build**

Run: `source ~/.nvm/nvm.sh && npx tsc --noEmit && npm run build`
Expected: 通过

- [ ] **Step 8: Commit**

```bash
git add src/components/gis/hooks/use-leaflet-map.ts src/components/gis/hooks/use-layer-visibility.ts src/components/RealGisMap.tsx
git commit -m "feat(gis): 接入响应分析(图层开关+RadialMenu响应分析+面板)(子项目4 Task4)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 5:zyna key_buildings.scene_id 迁移 + 21号楼绑定

**Files:**
- Create: `znya_jjxf119/server/alembic/versions/e0a2b3c4d5e6_key_building_scene_id.py`
- Data: UPDATE key_buildings
- Modify: `zyna_jjxf119/server/app/models/`(key_buildings model,若有)

**Interfaces:**
- Produces: `key_buildings.scene_id` 列(String(36),nullable);21号楼(`1c2d4772-831d-4c77-b88a-f9565ad589c7`)scene_id = `465718852859613184`

> 仓库:`/home/ljb/program/FireRescueAI/znya_jjxf119`。alembic:`cd server && uv run alembic ...`。

- [ ] **Step 1: 写迁移文件**

```python
# server/alembic/versions/e0a2b3c4d5e6_key_building_scene_id.py
"""key_buildings 加 scene_id(uStudio 建模场景 ID,3D引导用)。

Revision ID: e0a2b3c4d5e6
Revises: <当前 head>
Create Date: 2026-08-08
"""
from alembic import op
import sqlalchemy as sa

revision = "e0a2b3c4d5e6"
down_revision = "<当前 head>"  # implementer 先 alembic current 确认,替换
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("key_buildings", sa.Column("scene_id", sa.String(length=36), nullable=True))


def downgrade() -> None:
    op.drop_column("key_buildings", "scene_id")
```

- [ ] **Step 2: 确认当前 head + 跑迁移**

Run:
```bash
cd /home/ljb/program/FireRescueAI/znya_jjxf119/server && uv run alembic current
# 把输出的 head revision 填入迁移文件 down_revision,再:
uv run alembic upgrade head
```
Expected: upgrade 成功

- [ ] **Step 3: 绑定 21号楼 scene_id**

```bash
cd /home/ljb/program/FireRescueAI/znya_jjxf119/server && uv run python <<'PY'
from app.database.connection import SessionLocal
from sqlalchemy import text
db = SessionLocal()
try:
    db.execute(text("UPDATE key_buildings SET scene_id = '465718852859613184' WHERE id = '1c2d4772-831d-4c77-b88a-f9565ad589c7'"))
    db.commit()
    r = db.execute(text("SELECT id, name, scene_id FROM key_buildings WHERE id = '1c2d4772-831d-4c77-b88a-f9565ad589c7'")).fetchone()
    print("绑定结果:", r)
finally:
    db.close()
PY
```
Expected: `('1c2d4772-...', '乐盈广场21号楼', '465718852859613184')`

- [ ] **Step 4: model 加字段(若 key_buildings 有 ORM model)**

在 key_buildings 的 model 文件加:
```python
scene_id = Column(String(36))  # uStudio 建模场景 ID(3D引导用,仅演示建筑填)
```
> 若 key_buildings 无独立 model(裸表/视图),跳过,仅靠迁移列 + 裸 SQL 读写。

- [ ] **Step 5: 确认 key-buildings 列表 API 返回 scene_id**

Run(确认 web 经 /api/business 能拿到 scene_id):
```bash
# 直接查列表接口字段(需 service token,可跳过,只要 model/迁移有列,序列化通常自动带)
```
> 若 key-buildings API 用 response_schema 显式字段白名单,需把 scene_id 加入 schema(仿 fire_station 的 external_uuid 模式)。

- [ ] **Step 6: Commit(zyna 仓库)**

```bash
cd /home/ljb/program/FireRescueAI/znya_jjxf119
git add server/alembic/versions/e0a2b3c4d5e6_key_building_scene_id.py server/app/models/
git commit -m "feat(key-buildings): 加 scene_id 列 + 21号楼绑定 uStudio 465718852859613184(子项目4 Task5)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 6:3D引导(building 数据链带 scene_id + RadialMenu「进入3D」+ prop callback)

**Files:**
- Modify: `lib/key-building-mapper.ts`(`KeyBuilding` 加 `sceneId?`)
- Modify: `lib/gis/radial-target.ts`(`RadialTarget` 加 `sceneId?`)
- Modify: `lib/gis/render-key-buildings.ts`(`RenderKeyBuilding` 加 `sceneId?`;onRadial 传 sceneId)
- Modify: `src/components/RealGisMap.tsx`(props 加 `onEnterScene?`;radialActions 加「进入3D」)
- Modify: `src/App.tsx`(`<RealGisMap onEnterScene={setSelectedSceneId} />`)

**Interfaces:**
- Consumes: building 的 scene_id(zyna key_buildings.scene_id,Task 5 入库;21号楼 = 465718852859613184)
- Produces:
  - `KeyBuilding.sceneId?: string`(mapper 把 znya `scene_id` 映射到 `sceneId`)
  - `RadialTarget.sceneId?: string`
  - `RealGisMap` 可选 prop `onEnterScene?: (sceneId: string) => void`

> 3D引导用 **prop callback**(App 传 `setSelectedSceneId`)。`scene-command-bus` 的 `ustudio:scene` 是 uStudio→app 方向(场景加载事件),非 app→RealSceneView 切换通道,不用。RealGisMap 当前无 props,本 task 加 `onEnterScene`。

- [ ] **Step 1: KeyBuilding 加 sceneId(lib/key-building-mapper.ts)**

读现有 `KeyBuilding` 类型与 znya→KeyBuilding 映射函数,照现有字段(如 `external_uuid`/`name`)模式加:
```ts
export interface KeyBuilding {
  // ...现有字段
  sceneId?: string; // uStudio 建模场景 ID(3D引导用)
}
// 映射函数里:sceneId: raw.scene_id,
```

- [ ] **Step 2: RadialTarget 加 sceneId?(lib/gis/radial-target.ts)**

```ts
export interface RadialTarget {
  kind: 'unit' | 'building' | 'station' | 'incident' | 'water';
  // ...现有字段(id/name/lng/lat/type?)
  sceneId?: string; // 仅 kind=building 用(3D引导)
}
```

- [ ] **Step 3: render-key-buildings 传 sceneId**

`lib/gis/render-key-buildings.ts`:
- `RenderKeyBuildings` 入参类型加 `sceneId?: string`
- onRadial 回调传 sceneId(现有第 49 行 onRadial 调用):
```ts
opts.onRadial({ kind: 'building', id: b.id, name: b.name, lng: b.lng, lat: b.lat, sceneId: b.sceneId }, [b.lat, b.lng]);
```

- [ ] **Step 4: RealGisMap 加 onEnterScene prop + radialActions「进入3D」**

```tsx
// 组件签名加 props:
export default function RealGisMap({ onEnterScene }: { onEnterScene?: (sceneId: string) => void }) {
```

在 `radialActions(target)` 的 building 分支,actions 加(`Boxes` 图标);**仅当 target.sceneId 存在时**加入:
```tsx
import { Boxes } from 'lucide-react';

// building 分支:
const actions: RadialAction[] = [/* 现有动作 */, /* Task4 的「响应分析」 */];
if (target.sceneId && onEnterScene) {
  actions.push({
    key: 'enter3d',
    icon: Boxes,
    label: '进入3D',
    color: '#22d3ee',
    onClick: () => {
      onEnterScene(target.sceneId!);
      setRadial(null);
    },
  });
}
return actions;
```

> RealGisMap 的 radial state target 类型须含 sceneId——若 radial 用 `CoordFixTarget`(CoordinateFixPanel.tsx),需在该接口加 `sceneId?: string`,并在 building onRadial → setRadial 时携带。若 radial 直接用 `RadialTarget`,Step 2 已加。

- [ ] **Step 5: App 传 onEnterScene**

`src/App.tsx`(第 192 行 `<RealGisMap />`):
```tsx
<RealGisMap onEnterScene={setSelectedSceneId} />
```

- [ ] **Step 6: 人工冒烟**

1. GIS 页点 21号楼 marker → 圆环菜单有「进入3D」(蓝,因 21号楼有 scene_id)
2. 点「进入3D」→ RealSceneView 切换到 21号楼 3D(scene_id 465718852859613184)
3. TopBar 场景下拉同步选中"21D（XG）简化版已修改)"
4. 点其他无 scene_id 的重点建筑 → 无「进入3D」按钮
5. 先「响应分析」再「进入3D」→ 两者独立,不冲突

- [ ] **Step 7: typecheck + build**

Run: `source ~/.nvm/nvm.sh && npx tsc --noEmit && npm run build`
Expected: 通过

- [ ] **Step 8: Commit**

```bash
git add lib/key-building-mapper.ts lib/gis/radial-target.ts lib/gis/render-key-buildings.ts src/components/RealGisMap.tsx src/App.tsx
git commit -m "feat(gis): 3D引导(building 数据链带 scene_id + 进入3D prop callback)(子项目4 Task6)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## 整体冒烟 + 部署(全部 task 完成后)

- [ ] 全量测试: `source ~/.nvm/nvm.sh && npx vitest run lib/gis/__tests__/`(Task 1 两个文件绿)
- [ ] typecheck + build: `npx tsc --noEmit && npm run build`
- [ ] 演示叙事链:GIS 态势 → 点 21号楼 → 「响应分析」(参考圈+染色环+最近站路线+面板)→ 「进入3D」→ RealSceneView 21号楼建模
- [ ] 推送 web master + zyna feature 分支 → CI/CD 自动部署 → 线上验证
