# GIS 性能与加载（子项目 3）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 依据 `plan/2026-08-08-gis-perf-design.md`：重点单位/建筑渲染视口裁剪 + 平移重渲染 + popup 保活；水源/单位/建筑超阈值回落客户端聚合气泡。

**Architecture:** 纯函数（裁剪/阈值判定）进 `lib/gis/point-render.ts`（可单测）；`use-leaflet-map` 加 `viewportTick`（moveend 防抖自增）；渲染器（render-key-units/render-key-buildings/render-water）加裁剪与回落分支；编排者 effect 算 bounds/密度并传参。

**Tech Stack:** Next.js 16 + React 19 + TS + Leaflet + vitest（node 环境，仅 `lib/**/__tests__`）。

## Global Constraints

- 所有 shell 命令前缀 `source ~/.nvm/nvm.sh`
- 测试 `npx vitest run`；类型 `npm run typecheck`；构建 `npm run build`
- 已知既有失败（勿修勿报）：`lib/scene-command-bus/__tests__/{bridge,handlers}.test.ts`
- lib 模块不得 import src；不得顶层 `import L from 'leaflet'`（import type + 函数内 require 模式）
- 行为保真：警情单位始终逐点（不进气泡）；聚合气泡点击放大逻辑复用现有实现
- 提交规范：Conventional Commits + 结尾 `Co-Authored-By: Claude <noreply@anthropic.com>`，每 Task 一个 commit，精确 git add

---

### Task 1: `lib/gis/point-render.ts` — 裁剪与阈值判定纯函数

**Files:**
- Create: `lib/gis/point-render.ts`
- Test: `lib/__tests__/point-render.test.ts`

**Interfaces:**
- Produces（Task 3/4 依赖）:
  - `POINT_CAP = 800`
  - `interface ViewportBounds { west: number; south: number; east: number; north: number }`
  - `cullToBounds<T>(items: T[], getLng: (t: T) => number, getLat: (t: T) => number, b: ViewportBounds): T[]`（含边界）
  - `decidePointRender(countInView: number, cap?: number): 'points' | 'cluster'`（count > cap 才回落，等于不回落；cap 默认 POINT_CAP）

- [ ] **Step 1: 写失败测试**

```ts
// lib/__tests__/point-render.test.ts
import { describe, it, expect } from 'vitest';
import { POINT_CAP, cullToBounds, decidePointRender } from '../gis/point-render';

describe('cullToBounds', () => {
  const b = { west: 115, south: 29, east: 116, north: 30 };
  const items = [
    { id: 'in', lng: 115.5, lat: 29.5 },
    { id: 'out-lng', lng: 116.5, lat: 29.5 },
    { id: 'out-lat', lng: 115.5, lat: 28.5 },
    { id: 'edge', lng: 116, lat: 30 },
  ];
  it('只保留边界内(含边界)的点', () => {
    const r = cullToBounds(items, (t) => t.lng, (t) => t.lat, b);
    expect(r.map((t) => t.id)).toEqual(['in', 'edge']);
  });
  it('空数组返回空', () => {
    expect(cullToBounds([] as Array<{ lng: number; lat: number }>, (t) => t.lng, (t) => t.lat, b)).toEqual([]);
  });
});

describe('decidePointRender', () => {
  it('count > cap 回落聚合;等于 cap 仍逐点', () => {
    expect(decidePointRender(POINT_CAP, POINT_CAP)).toBe('points');
    expect(decidePointRender(POINT_CAP + 1, POINT_CAP)).toBe('cluster');
    expect(decidePointRender(0, POINT_CAP)).toBe('points');
  });
  it('默认 cap 为 POINT_CAP(800)', () => {
    expect(POINT_CAP).toBe(800);
    expect(decidePointRender(801)).toBe('cluster');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `source ~/.nvm/nvm.sh && npx vitest run lib/__tests__/point-render.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

```ts
// lib/gis/point-render.ts
// 点位渲染的视口裁剪与密度判定(纯函数,node 可测)。
// 用途:zoom 进入逐点级别后,只渲染视野内点位;视野内数量超阈值时回落客户端聚合气泡(不藏数据)。

/** 视口内点位数上限:超过则回落聚合气泡。 */
export const POINT_CAP = 800;

export interface ViewportBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

/** 视口裁剪:只保留 bounds 内(含边界)的点。九江不涉及 antimeridian,直接区间比较。 */
export function cullToBounds<T>(
  items: T[],
  getLng: (t: T) => number,
  getLat: (t: T) => number,
  b: ViewportBounds,
): T[] {
  return items.filter((t) => {
    const lng = getLng(t);
    const lat = getLat(t);
    return lng >= b.west && lng <= b.east && lat >= b.south && lat <= b.north;
  });
}

/** 密度判定:视口内点数 > cap 回落聚合;等于 cap 仍逐点。 */
export function decidePointRender(countInView: number, cap: number = POINT_CAP): 'points' | 'cluster' {
  return countInView > cap ? 'cluster' : 'points';
}
```

- [ ] **Step 4: 跑测试确认通过 + Commit**

Run: `source ~/.nvm/nvm.sh && npx vitest run lib/__tests__/point-render.test.ts`
Expected: PASS（4 用例）

```bash
git add lib/gis/point-render.ts lib/__tests__/point-render.test.ts
git commit -m "feat(lib): point-render 视口裁剪与密度判定纯函数

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: `use-leaflet-map` 加 `viewportTick`

**Files:**
- Modify: `src/components/gis/hooks/use-leaflet-map.ts`
- Modify: `src/components/RealGisMap.tsx`（解构加 viewportTick，暂不使用）

**Interfaces:**
- Produces（Task 3 依赖）: `useLeafletMap` 返回值新增 `viewportTick: number`——moveend 300ms 防抖后自增（与水源加载同款防抖模式；水源 effect 自己的 moveend 监听不动）。

- [ ] **Step 1: hook 内加 viewportTick**

```ts
const [viewportTick, setViewportTick] = useState(0);

// 视口变化通知(moveend 300ms 防抖):单位/建筑渲染裁剪后需随平移重建
useEffect(() => {
  const map = mapRef.current;
  if (!map || !mapInited) return;
  let timer: number | undefined;
  const onMove = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => setViewportTick((t) => t + 1), 300);
  };
  map.on('moveend', onMove);
  return () => {
    window.clearTimeout(timer);
    map.off('moveend', onMove);
  };
}, [mapInited]);
```

返回值对象加 `viewportTick`。RealGisMap 解构处加 `viewportTick`（本任务先不消费，typecheck 会报 unused → 解构处先不加，Task 3 再加；本任务 RealGisMap 不用改）。

- [ ] **Step 2: 验证 + Commit**

Run: `source ~/.nvm/nvm.sh && npm run typecheck && npm run build`

```bash
git add src/components/gis/hooks/use-leaflet-map.ts
git commit -m "feat(gis): use-leaflet-map 加 viewportTick(moveend 防抖自增)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: 单位/建筑渲染——裁剪 + popup 保活 + 超限回落

**Files:**
- Modify: `lib/gis/render-key-units.ts`
- Modify: `lib/gis/render-key-buildings.ts`
- Modify: `src/components/RealGisMap.tsx`（两个渲染 effect：算 bounds、加 viewportTick 依赖、传 prevMarkers）

**Interfaces:**
- Consumes: Task 1 的 `cullToBounds / decidePointRender / ViewportBounds / POINT_CAP`；Task 2 的 `viewportTick`
- Produces: 渲染器 opts 新增字段——
  - `RenderKeyUnitsOpts` 加 `bounds: ViewportBounds; prevMarkers: Map<string, L.Marker>; cap?: number`
  - `RenderKeyBuildingsOpts` 同样加这三项

- [ ] **Step 1: render-key-units.ts 改造**

opts 接口加 `bounds: ViewportBounds; prevMarkers: Map<string, L.Marker>; cap?: number`。
`zoom >= MARKER_CLUSTER_MAX_ZOOM` 分支改为（zoom<14 聚合分支不动）：

```ts
if (zoom >= MARKER_CLUSTER_MAX_ZOOM) {
  // popup 保活:平移重建前记下打开中的 popup id,重建后恢复(同 render-water 模式)
  const openId = [...opts.prevMarkers.entries()].find(([, m]) => m.isPopupOpen())?.[0];
  // 视口裁剪:只渲染视野内点位(警情单位始终逐点,不进气泡的规则不变)
  const visible = cullToBounds(units, (u) => u.lng, (u) => u.lat, opts.bounds);
  const withIncident = visible.filter((u) => incidentByUnit.has(u.id));
  const rest = visible.filter((u) => !incidentByUnit.has(u.id));
  withIncident.forEach(renderUnit);
  if (decidePointRender(visible.length, opts.cap ?? POINT_CAP) === 'points') {
    rest.forEach(renderUnit);
  } else {
    renderClusterBubbles(rest, zoom);
  }
  if (openId) markers.get(openId)?.openPopup();
  return markers;
}
```

zoom<14 分支的气泡 for 循环抽成文件内局部函数 `renderClusterBubbles(items: KeyUnit[], z: number)`（气泡 html/尺寸/className/tooltip/点击 flyTo 逻辑原样移入），两个分支共用，消灭重复。

- [ ] **Step 2: render-key-buildings.ts 同款改造**

同 Step 1：opts 加三字段；zoom≥14 分支加 openId 保活 + cull + decide 回落；气泡逻辑抽 `renderClusterBubbles(items: KeyBuilding[], z: number)`（'#60a5fa'、"个重点建筑"tooltip）。建筑无警情规则，回落时全部进气泡。

- [ ] **Step 3: RealGisMap 两个 effect 接线**

从 useLeafletMap 解构加 `viewportTick`。单位/建筑渲染 effect 内、调渲染器前算 bounds：

```ts
const b = map.getBounds().pad(0.1); // 外扩避免边缘点位闪进闪出
const bounds = { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() };
```

opts 传 `bounds` 与 `prevMarkers: keyUnitMarkersRef.current`（建筑为 `buildingMarkersRef.current`），effect 依赖数组加 `viewportTick`（其余依赖不动，unitClusterMode 保留）。

- [ ] **Step 4: 验证 + Commit**

Run: `source ~/.nvm/nvm.sh && npm run typecheck && npx vitest run && npm run build`

```bash
git add lib/gis/render-key-units.ts lib/gis/render-key-buildings.ts src/components/RealGisMap.tsx
git commit -m "perf(gis): 单位/建筑渲染视口裁剪 + 平移重建 + popup 保活 + 超限回落聚合

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: 水源超限回落 + 密度指示

**Files:**
- Modify: `lib/gis/render-water.ts`
- Modify: `src/components/RealGisMap.tsx`（密度推导 + 指示区文案分支）

**Interfaces:**
- Consumes: Task 1 纯函数
- Produces: `RenderWaterOpts` 加 `cap?: number`；RealGisMap 新增 state `waterDense: boolean`（zoom≥15 且视口过滤后点数 > POINT_CAP 时为 true）

- [ ] **Step 1: render-water.ts 超限回落**

opts 加 `cap?: number`。`shouldShowWaterPoints(opts.zoom)` 分支内：

```ts
const visible = water.filter((w) => !opts.hiddenDistricts.includes(w.districtCode));
if (decidePointRender(visible.length, opts.cap ?? POINT_CAP) === 'points') {
  // 原逐点 for 循环改为遍历 visible,其余不变
} else {
  // 超限回落:客户端网格聚合(与 13-14 级同款气泡,点击放大复用)
  for (const c of gridCluster(visible, (w) => w.lng, (w) => w.lat, waterClusterCell(opts.zoom))) {
    // 与 else if 分支里的气泡渲染代码相同 → 抽局部函数 renderClusterBubbles(clusters) 共用
  }
}
if (openId) markers.get(openId)?.openPopup(); // 保活逻辑保持在逐点分支末尾(回落时无逐点 marker,自然 no-op)
```

`gridCluster` / `waterClusterCell` import 加进文件头部（`../grid-cluster`、`../map-icons`）。

- [ ] **Step 2: RealGisMap 密度推导 + 指示**

水源渲染 effect 内调渲染器前：

```ts
const b = map.getBounds(); // 水源数据已是 bbox 视口,直接用当前 bounds 计数即可(不额外 pad)
const dense =
  shouldShowWaterPoints(map.getZoom()) &&
  decidePointRender(water.filter((w) => !layerPrefs.hiddenWaterDistricts.includes(w.districtCode)).length) === 'cluster';
setWaterDense(dense);
```

组件加 `const [waterDense, setWaterDense] = useState(false);`。指示区 JSX（Task 4 of 视觉计划的现有块）改为三分支：加载中 > 密集聚合 > 无数据：

```tsx
{showWater && (waterLoading || waterDense || waterEmpty) && (
  <div className="absolute bottom-3 right-14 z-[500] flex items-center rounded border border-line bg-bg-panel/90 px-2.5 py-1 text-[11px] text-text-2">
    {waterLoading ? (
      <>
        <span className="gis-loading-dot" />
        水源加载中…
      </>
    ) : waterDense ? (
      '点位密集,已聚合显示'
    ) : (
      '当前区域无水源数据'
    )}
  </div>
)}
```

`waterEmpty` 推导加 `!waterDense &&` 前缀（密集回落时 waterClusters 为空、water 非空，现有推导已不致误报，加此前缀双保险）。`decidePointRender`/`shouldShowWaterPoints` import 补齐。

- [ ] **Step 3: 验证 + Commit**

Run: `source ~/.nvm/nvm.sh && npm run typecheck && npx vitest run && npm run build`

```bash
git add lib/gis/render-water.ts src/components/RealGisMap.tsx
git commit -m "perf(gis): 水源视口超限回落客户端聚合 + 密度指示

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: 全量验证 + 性能验收

- [ ] **Step 1: 全量验证**

Run: `source ~/.nvm/nvm.sh && npm run typecheck && npx vitest run && npm run build`
Expected: 全绿（除已知 2 套件）

- [ ] **Step 2: dev server 冒烟**

`npm run dev` 起服务（注意 3000 端口可能有用户既有实例，占用则复用），curl 首页 200 后停掉（若复用则不杀）。

- [ ] **Step 3: 输出用户验收清单**

```
□ 性能对比(九江市密集区 zoom 14-15):Chrome DevTools → Elements 数 DOM 节点,平移感受流畅度
  - 重构前参考值:zoom≥14 时单位+建筑 marker 全量进 DOM(千级)
  - 重构后预期:仅视口内点位;超 800 回落气泡
□ 平移重建:点位随视野移动正常出现/消失,无残留无缺失
□ popup 保活:打开单位/建筑 popup 后小幅平移,popup 不消失
□ 超限回落:密集区看到"点位密集,已聚合显示"指示 + 聚合气泡,点击气泡放大后散开
□ 警情单位:任何密度下始终逐点显示(不进气泡)
□ 淡入动画:平移重建时是否闪烁烦人(烦则反馈,把淡入限定为数据变化时触发)
□ 水源三级加载、单位/建筑 zoom<14 聚合等既有行为回归
```

- [ ] **Step 4: Commit（若有调整）**

---

## 附：风险

1. viewportTick 引入后，单位/建筑每次平移（防抖后）都重建 marker——裁剪后量级已小，重建成本可接受；popup 保活已覆盖 UX
2. 水源回落与 13-14 级服务端聚合是两套数据源（客户端 gridCluster vs 服务端 clusters 端点），气泡外观一致（同 waterClusterSvg），点击行为一致
3. 淡入动画在平移重建时频繁触发是已知的验收观察项（设计文档第三节），非默认改动
