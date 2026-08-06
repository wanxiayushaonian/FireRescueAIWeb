# web 端水源面板 + 地图水源点 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** overview 模块新增独立 `WaterSourcePanel`(按区浏览/搜索/定位水源)+ `RealGisMap` 水源点(zoom≥13 显示,消防站与水源都改 SVG `divIcon` 图标)。

**Architecture:** 纯逻辑(映射/统计/SVG/zoom 判定)放根 `lib/`(TDD,vitest 覆盖);数据层 `src/api/water.ts` 经 BFF 分页拉 `water_sources`;组件 `WaterSourcePanel` 复用 `ForceResourcePanel` 模式(统计/树/清单/联动);`RealGisMap` 加站图标化 + 水源层(zoom 过滤 + sceneLog 联动)。

**Tech Stack:** Next.js · React · TypeScript · Leaflet(divIcon SVG)· vitest · Tailwind v4。

## Global Constraints

(摘自 spec `2026-08-06-water-source-panel-design.md`)

- web repo,master 分支;工作目录 `/home/ljb/program/FireRescueAI/web`
- 纯逻辑/工具放**根 `lib/`**(`@/*` 双映射 `["./src/*", "./*"]`,vitest 只覆盖 `lib/`),组件放 `src/components/`
- 测试:`npx vitest run lib/__tests__/<file>.test.ts`;全量 `npx vitest run`
- 类型检查:`npx tsc --noEmit`;构建:`npm run build`
- Leaflet 是浏览器库,`RealGisMap` 已由 `next/dynamic({ ssr:false })` 导入,新增逻辑保持客户端运行(地图操作在 `useEffect` 内)
- 区划码→区名:`{360404:'濂溪区', 360411:'柴桑区', 360410:'浔阳区', 360406:'彭泽县'}`
- 水源类型色:`市政消火栓=#38bdf8` / `消防水池=#34d399` / `天然水源=#22d3ee`
- 消防站色(复用现有):`特勤=#f97316` / `普通=#22d3ee` / `专职=#3b82f6` / `微型=#34d399` / `水上=#a78bfa`
- 数据来源:znya `water_sources` 614 条,经 `/api/business/water-sources/`(BFF catch-all 已存在)
- 参考组件:`ForceResourcePanel.tsx`(统计/树/清单/联动模式)、`api/force.ts`(fetchAll 分页)、`lib/force-mapper.ts`(Znya 映射)

## File Structure

| 文件 | 责任 | 动作 |
|---|---|---|
| `src/mock/types.ts` | 加 `WaterSource` 接口 | 修改 |
| `lib/water-mapper.ts` | `ZnyaWaterSource`/`mapWaterSource`/`buildWaterDistrictStats`/`buildWaterTypeStats`/`DISTRICT_NAME` | 新建 |
| `lib/__tests__/water-mapper.test.ts` | 映射/统计/区名测试 | 新建 |
| `lib/map-icons.ts` | `TYPE_COLORS`/`WATER_COLORS`/`stationIconSvg`/`waterIconSvg`/`shouldShowWater`(纯函数,不依赖 leaflet) | 新建 |
| `lib/__tests__/map-icons.test.ts` | svg 含色 / zoom 判定测试 | 新建 |
| `src/api/water.ts` | `fetchWaterSources`(分页) | 新建 |
| `src/components/panels/WaterSourcePanel.tsx` | 统计 + 区树 + 清单 + 联动 | 新建 |
| `src/components/RealGisMap.tsx` | 站图标化 + 水源层(zoom 过滤)+ sceneLog 联动扩展 | 修改 |
| `src/App.tsx` | overview 加 `DraggablePanel`(水源) | 修改 |

---

### Task 1: `WaterSource` 类型 + `lib/water-mapper.ts`(TDD)

**Files:**
- Modify: `src/mock/types.ts`(末尾追加)
- Create: `lib/water-mapper.ts`
- Test: `lib/__tests__/water-mapper.test.ts`

**Interfaces:**
- Produces:
  - `WaterSource`(types.ts):`{id,name,type,lat,lng,address,districtCode,district,status}`
  - `ZnyaWaterSource`、`DISTRICT_NAME`、`mapWaterSource(raw): WaterSource`
  - `buildWaterDistrictStats(list): {district,districtCode,count}[]`(固定顺序 濂溪/柴桑/浔阳/彭泽)
  - `buildWaterTypeStats(list): {type,count}[]`(顺序 市政消火栓/消防水池/天然水源)

- [ ] **Step 1: 在 `src/mock/types.ts` 末尾追加 `WaterSource`**

```ts
export interface WaterSource {
  id: string;
  name: string;
  type: string; // 市政消火栓 / 消防水池 / 天然水源
  lat: number;
  lng: number;
  address: string;
  districtCode: string;
  district: string; // 区名(DISTRICT_NAME 映射)
  status: string;
}
```

- [ ] **Step 2: 写失败测试 `lib/__tests__/water-mapper.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import {
  DISTRICT_NAME,
  mapWaterSource,
  buildWaterDistrictStats,
  buildWaterTypeStats,
  type ZnyaWaterSource,
} from '../water-mapper';
import type { WaterSource } from '../../src/mock/types';

describe('water-mapper', () => {
  const raw: ZnyaWaterSource = {
    id: 'w1', name: 'JJ-BLHSYL-001', water_type: '市政消火栓', status: 'normal',
    location_path: '江西省九江市柴桑区沙阎路',
    longitude: 115.9117, latitude: 29.6953, district_code: '360411',
  };

  it('DISTRICT_NAME 含九江 4 区', () => {
    expect(DISTRICT_NAME['360404']).toBe('濂溪区');
    expect(DISTRICT_NAME['360411']).toBe('柴桑区');
    expect(DISTRICT_NAME['360410']).toBe('浔阳区');
    expect(DISTRICT_NAME['360406']).toBe('彭泽县');
  });

  it('mapWaterSource 映射字段 + district_code→district', () => {
    const w: WaterSource = mapWaterSource(raw);
    expect(w.id).toBe('w1');
    expect(w.name).toBe('JJ-BLHSYL-001');
    expect(w.type).toBe('市政消火栓');
    expect(w.lng).toBe(115.9117);
    expect(w.lat).toBe(29.6953);
    expect(w.address).toBe('江西省九江市柴桑区沙阎路');
    expect(w.districtCode).toBe('360411');
    expect(w.district).toBe('柴桑区');
    expect(w.status).toBe('normal');
  });

  it('mapWaterSource 容忍空字段', () => {
    const w = mapWaterSource({ id: 'w2', name: 'x', water_type: '消防水池', status: 'normal' });
    expect(w.lat).toBe(0);
    expect(w.lng).toBe(0);
    expect(w.address).toBe('');
    expect(w.districtCode).toBe('');
    expect(w.district).toBe('未知');
  });

  it('buildWaterDistrictStats 按区聚合 + 固定顺序', () => {
    const list = [
      mapWaterSource({ ...raw, id: 'a', district_code: '360411' }),
      mapWaterSource({ ...raw, id: 'b', district_code: '360411' }),
      mapWaterSource({ ...raw, id: 'c', district_code: '360404' }),
      mapWaterSource({ ...raw, id: 'd', district_code: '360406' }),
    ];
    const stats = buildWaterDistrictStats(list);
    expect(stats.map((s) => s.districtCode)).toEqual(['360404', '360411', '360410', '360406'].filter((c) => c !== '360410'));
    const cxs = Object.fromEntries(stats.map((s) => [s.districtCode, s.count]));
    expect(cxs['360404']).toBe(1);
    expect(cxs['360411']).toBe(2);
    expect(cxs['360406']).toBe(1);
  });

  it('buildWaterTypeStats 按类型聚合', () => {
    const list = [
      mapWaterSource({ ...raw, water_type: '市政消火栓' }),
      mapWaterSource({ ...raw, id: 'x', water_type: '天然水源' }),
    ];
    const stats = buildWaterTypeStats(list);
    const m = Object.fromEntries(stats.map((s) => [s.type, s.count]));
    expect(m['市政消火栓']).toBe(1);
    expect(m['天然水源']).toBe(1);
  });
});
```

- [ ] **Step 3: 跑测试确认失败**

Run: `cd /home/ljb/program/FireRescueAI/web && npx vitest run lib/__tests__/water-mapper.test.ts`
Expected: FAIL(`Failed to resolve import '../water-mapper'` 或模块不存在)。

- [ ] **Step 4: 实现 `lib/water-mapper.ts`**

```ts
import type { WaterSource } from '../src/mock/types';

/** znya /water-sources 返回项(字段对齐,read-only 快照)。 */
export interface ZnyaWaterSource {
  id: string;
  name: string;
  water_type: string;
  status: string;
  location_path?: string | null;
  longitude?: number | null;
  latitude?: number | null;
  district_code?: string | null;
}

/** 区划码 → 区名(九江 4 区,水源覆盖范围)。 */
export const DISTRICT_NAME: Record<string, string> = {
  '360404': '濂溪区',
  '360411': '柴桑区',
  '360410': '浔阳区',
  '360406': '彭泽县',
};

export function mapWaterSource(raw: ZnyaWaterSource): WaterSource {
  const code = raw.district_code ?? '';
  return {
    id: raw.id,
    name: raw.name,
    type: raw.water_type,
    lat: raw.latitude ?? 0,
    lng: raw.longitude ?? 0,
    address: raw.location_path ?? '',
    districtCode: code,
    district: DISTRICT_NAME[code] ?? '未知',
    status: raw.status,
  };
}

export interface WaterDistrictStat {
  district: string;
  districtCode: string;
  count: number;
}

/** 按区聚合,固定顺序:濂溪/柴桑/浔阳/彭泽(仅返回实际出现的区)。 */
export function buildWaterDistrictStats(list: WaterSource[]): WaterDistrictStat[] {
  const map = new Map<string, WaterDistrictStat>();
  for (const w of list) {
    const cur = map.get(w.districtCode) ?? { district: w.district, districtCode: w.districtCode, count: 0 };
    cur.count += 1;
    map.set(w.districtCode, cur);
  }
  const order = ['360404', '360411', '360410', '360406'];
  return order.map((c) => map.get(c)).filter((x): x is WaterDistrictStat => !!x);
}

export interface WaterTypeStat {
  type: string;
  count: number;
}

/** 按类型聚合,顺序:市政消火栓/消防水池/天然水源(其余按字母追加)。 */
export function buildWaterTypeStats(list: WaterSource[]): WaterTypeStat[] {
  const map = new Map<string, number>();
  for (const w of list) map.set(w.type, (map.get(w.type) ?? 0) + 1);
  const order = ['市政消火栓', '消防水池', '天然水源'];
  return [...map.entries()]
    .sort((a, b) => {
      const ia = order.indexOf(a[0]);
      const ib = order.indexOf(b[0]);
      if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      return a[0].localeCompare(b[0]);
    })
    .map(([type, count]) => ({ type, count }));
}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `cd /home/ljb/program/FireRescueAI/web && npx vitest run lib/__tests__/water-mapper.test.ts`
Expected: 5 passed。

- [ ] **Step 6: 提交**

```bash
cd /home/ljb/program/FireRescueAI/web
git add src/mock/types.ts lib/water-mapper.ts lib/__tests__/water-mapper.test.ts
git commit -m "feat(water): WaterSource 类型 + water-mapper(映射/区统计/类型统计,TDD)" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: `lib/map-icons.ts`(纯 SVG + zoom 判定,TDD)

**Files:**
- Create: `lib/map-icons.ts`
- Test: `lib/__tests__/map-icons.test.ts`

**Interfaces:**
- Produces(纯函数,不依赖 leaflet,`RealGisMap` 用 `L.divIcon({html})` 包装):
  - `TYPE_COLORS: Record<string,string>`(站色)
  - `WATER_COLORS: Record<string,string>`(水源色)
  - `stationIconSvg(type: string): string`(返回 SVG html)
  - `waterIconSvg(waterType: string): string`(返回 SVG html)
  - `shouldShowWater(zoom: number): boolean`(`zoom>=13`)

- [ ] **Step 1: 写失败测试 `lib/__tests__/map-icons.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import {
  TYPE_COLORS, WATER_COLORS,
  stationIconSvg, waterIconSvg, shouldShowWater,
} from '../map-icons';

describe('map-icons', () => {
  it('shouldShowWater: zoom>=13 显水源', () => {
    expect(shouldShowWater(12)).toBe(false);
    expect(shouldShowWater(13)).toBe(true);
    expect(shouldShowWater(18)).toBe(true);
  });

  it('stationIconSvg 含对应站类型色', () => {
    const svg = stationIconSvg('特勤消防站');
    expect(svg).toContain(TYPE_COLORS['特勤消防站']); // #f97316
    expect(svg).toContain('<svg');
  });

  it('stationIconSvg 未知类型用默认色', () => {
    const svg = stationIconSvg('未知');
    expect(svg).toContain('#22d3ee');
  });

  it('waterIconSvg 含对应水源类型色', () => {
    expect(waterIconSvg('消防水池')).toContain(WATER_COLORS['消防水池']); // #34d399
    expect(waterIconSvg('天然水源')).toContain(WATER_COLORS['天然水源']); // #22d3ee
    expect(waterIconSvg('市政消火栓')).toContain(WATER_COLORS['市政消火栓']); // #38bdf8
  });

  it('waterIconSvg 未知类型用默认色', () => {
    expect(waterIconSvg('其它')).toContain('#60a5fa');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd /home/ljb/program/FireRescueAI/web && npx vitest run lib/__tests__/map-icons.test.ts`
Expected: FAIL(模块不存在)。

- [ ] **Step 3: 实现 `lib/map-icons.ts`**

```ts
// 地图图标:纯 SVG html 工厂 + zoom 判定(不依赖 leaflet;由 RealGisMap 用 L.divIcon 包装)。
// 深色背景:亮色填充 + 深色描边,保证可见。

export const TYPE_COLORS: Record<string, string> = {
  特勤消防站: '#f97316',
  普通消防站: '#22d3ee',
  专职消防站: '#3b82f6',
  微型消防站: '#34d399',
  水上消防站: '#a78bfa',
};

export const WATER_COLORS: Record<string, string> = {
  市政消火栓: '#38bdf8',
  消防水池: '#34d399',
  天然水源: '#22d3ee',
};

const DEFAULT_STATION_COLOR = '#22d3ee';
const DEFAULT_WATER_COLOR = '#60a5fa';
const WATER_ZOOM_THRESHOLD = 13;

/** zoom>=13 时显示水源点(远景只显消防站,避免密集)。 */
export function shouldShowWater(zoom: number): boolean {
  return zoom >= WATER_ZOOM_THRESHOLD;
}

/** 消防站图标:菱形徽标 + "消"字,24px,锚点底部中心。 */
export function stationIconSvg(type: string): string {
  const color = TYPE_COLORS[type] ?? DEFAULT_STATION_COLOR;
  return `<svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <path d="M12 1 L22 11 L12 23 L2 11 Z" fill="${color}" stroke="#0b1220" stroke-width="1.5"/>
  <text x="12" y="16" font-size="11" text-anchor="middle" fill="#0b1220" font-weight="700" font-family="sans-serif">消</text>
</svg>`;
}

/** 水源图标:水滴形,18px,锚点底部中心。 */
export function waterIconSvg(waterType: string): string {
  const color = WATER_COLORS[waterType] ?? DEFAULT_WATER_COLOR;
  return `<svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <path d="M12 2 C12 2 4 12 4 16 a8 8 0 0 0 16 0 C20 12 12 2 12 2 Z" fill="${color}" stroke="#0b1220" stroke-width="1.2"/>
</svg>`;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd /home/ljb/program/FireRescueAI/web && npx vitest run lib/__tests__/map-icons.test.ts`
Expected: 5 passed。

- [ ] **Step 5: 提交**

```bash
cd /home/ljb/program/FireRescueAI/web
git add lib/map-icons.ts lib/__tests__/map-icons.test.ts
git commit -m "feat(gis): 地图图标工厂(站徽标/水源水滴 SVG + zoom 判定,TDD)" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: `src/api/water.ts`(数据层)

**Files:**
- Create: `src/api/water.ts`

**Interfaces:**
- Consumes(Task 1):`mapWaterSource`、`ZnyaWaterSource`(from `@/lib/water-mapper`);`concatPageItems`/`remainingPages`(from `@/lib/paginate`);`WaterSource`/`FetchState`(from `@/mock/types`)
- Produces:`fetchWaterSources(state?: FetchState): Promise<WaterSource[]>`

- [ ] **Step 1: 实现 `src/api/water.ts`**

```ts
// 水源数据访问层:web /api/business/*(BFF 代理 znya)→ 映射为 WaterSource。
// fetchAll 与 src/api/force.ts 同模式(znya page 从 1 开始,page_size 上限 100)。
import type { FetchState, WaterSource } from '@/mock/types';
import { mapWaterSource, type ZnyaWaterSource } from '@/lib/water-mapper';
import { concatPageItems, remainingPages } from '@/lib/paginate';

const PAGE_SIZE = 100;

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`请求失败 ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

async function fetchAll<T>(path: string, pageSize = PAGE_SIZE): Promise<T[]> {
  const sep = path.includes('?') ? '&' : '?';
  const pageUrl = (page: number) => `${path}${sep}page=${page}&page_size=${pageSize}`;
  const first = await getJson<{ items: T[]; total: number }>(pageUrl(1));
  const rest = remainingPages(first.total, pageSize, first.items.length);
  if (rest.length === 0) return first.items;
  const pages = await Promise.all(rest.map((p) => getJson<{ items: T[] }>(pageUrl(p))));
  return concatPageItems(first.items, pages.map((r) => r.items ?? []));
}

export async function fetchWaterSources(state?: FetchState): Promise<WaterSource[]> {
  if (state === 'error') throw new Error('水源加载失败');
  if (state === 'empty') return [];
  const items = await fetchAll<ZnyaWaterSource>('/api/business/water-sources');
  return items.map(mapWaterSource);
}
```

- [ ] **Step 2: 类型检查**

Run: `cd /home/ljb/program/FireRescueAI/web && npx tsc --noEmit`
Expected: 无新增错误(新文件类型自洽)。

- [ ] **Step 3: 提交**

```bash
cd /home/ljb/program/FireRescueAI/web
git add src/api/water.ts
git commit -m "feat(water): 水源数据访问层 fetchWaterSources(/api/business 代理)" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: `src/components/panels/WaterSourcePanel.tsx`

**Files:**
- Create: `src/components/panels/WaterSourcePanel.tsx`

**Interfaces:**
- Consumes:`fetchWaterSources`(Task 3)、`buildWaterDistrictStats`/`buildWaterTypeStats`(Task 1)、`waterIconSvg`(Task 2)、`WaterSource`/`FetchState`、`addSceneAction`(from `@/mock/sceneLog`)、`StatCard`/`PanelStateView`/`StatusBadge`/`showToast`(现有组件)
- Produces:默认导出 `WaterSourcePanel`(供 App.tsx 挂载)

- [ ] **Step 1: 实现 `src/components/panels/WaterSourcePanel.tsx`**

```tsx
'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Droplet, Search, ChevronDown, ChevronRight, MapPin } from 'lucide-react';
import type { FetchState, WaterSource } from '@/mock/types';
import { fetchWaterSources } from '@/api/water';
import { buildWaterDistrictStats, buildWaterTypeStats } from '@/lib/water-mapper';
import { waterIconSvg } from '@/lib/map-icons';
import { addSceneAction } from '@/mock/sceneLog';
import StatCard from '@/components/StatCard';
import PanelStateView from '@/components/PanelStateView';
import { showToast } from '@/components/Toast';

const STATE_OPTIONS: Array<{ value: FetchState; label: string }> = [
  { value: 'ok', label: '正常' },
  { value: 'loading', label: '加载中' },
  { value: 'empty', label: '空态' },
  { value: 'error', label: '失败' },
];

export default function WaterSourcePanel() {
  const [demoState, setDemoState] = useState<FetchState>('ok');
  const [state, setState] = useState<FetchState>('loading');
  const [list, setList] = useState<WaterSource[]>([]);
  const [districtSel, setDistrictSel] = useState<string | null>(null); // districtCode | null(全部)
  const [query, setQuery] = useState('');
  const [visible, setVisible] = useState(20);
  const [appending, setAppending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (s: FetchState) => {
    if (s === 'loading') { setState('loading'); return; }
    setState('loading');
    try {
      const items = await fetchWaterSources(s);
      setList(items);
      setState(items.length === 0 ? 'empty' : 'ok');
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => { load(demoState); }, [demoState, load]);

  const districtStats = useMemo(() => buildWaterDistrictStats(list), [list]);
  const typeStats = useMemo(() => buildWaterTypeStats(list), [list]);

  const rows = useMemo<WaterSource[]>(() => {
    let l = districtSel ? list.filter((w) => w.districtCode === districtSel) : list;
    if (query.trim()) {
      const q = query.trim();
      l = l.filter((w) => w.name.includes(q) || w.address.includes(q));
    }
    return l;
  }, [list, districtSel, query]);

  const shown = rows.slice(0, visible);
  const allLoaded = visible >= rows.length;

  const onScroll = () => {
    const el = listRef.current;
    if (!el || allLoaded || appending) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight * 0.8) {
      setAppending(true);
      window.setTimeout(() => { setVisible((v) => v + 20); setAppending(false); }, 600);
    }
  };

  const writeLinkage = (w: WaterSource) => {
    addSceneAction({ action: 'flyTo', target: `${w.name} (${w.lng}, ${w.lat})`, params: { lng: w.lng, lat: w.lat }, source: '面板' });
    showToast('已定位到水源');
  };

  return (
    <div className="flex h-full flex-col">
      {/* 工具行 */}
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-3" />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setVisible(20); }}
            placeholder="搜索水源名称 / 地址…"
            className="h-8 w-full rounded-md border border-line bg-bg-panel-2 pl-7 pr-2 text-[13px] text-text-1 placeholder:text-text-3 focus:border-line-glow focus:outline-none"
          />
        </div>
        <div className="relative">
          <select
            value={demoState}
            onChange={(e) => setDemoState(e.target.value as FetchState)}
            className="h-8 appearance-none rounded-md border border-line bg-bg-panel-2 pl-2 pr-7 text-[12px] text-text-2 focus:border-line-glow focus:outline-none"
            title="状态演示"
          >
            {STATE_OPTIONS.map((o) => <option key={o.value} value={o.value}>状态演示：{o.label}</option>)}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-3" />
        </div>
      </div>

      {state !== 'ok' ? (
        <PanelStateView state={state} onRetry={() => load('ok')} />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          {/* 统计:总数 + 类型小计 */}
          <div className="space-y-2 p-3">
            <StatCard icon={Droplet} label="水源总数" value={list.length} />
            <div className="flex flex-wrap gap-2">
              {typeStats.map((t) => (
                <span key={t.type} className="rounded border border-line bg-bg-panel-2 px-2 py-0.5 text-[11px] text-text-2">
                  {t.type} <span className="font-num text-text-1">{t.count}</span>
                </span>
              ))}
            </div>
          </div>
          {/* 区树 + 清单 */}
          <div className="flex min-h-0 flex-1 border-t border-line">
            <div className="w-[110px] shrink-0 overflow-y-auto border-r border-line py-1">
              <button
                onClick={() => { setDistrictSel(null); setVisible(20); }}
                className={`flex w-full items-center justify-between px-2 py-1.5 text-[12px] hover:bg-bg-panel-2 ${districtSel === null ? 'text-cyan' : 'text-text-2'}`}
              >
                全部
                <span className="font-num text-text-3">{list.length.toLocaleString()}</span>
              </button>
              {districtStats.map((d) => {
                const sel = districtSel === d.districtCode;
                return (
                  <button
                    key={d.districtCode}
                    onClick={() => { setDistrictSel(sel ? null : d.districtCode); setVisible(20); }}
                    className={`relative flex w-full items-center justify-between px-2 py-1.5 text-[12px] hover:bg-bg-panel-2 ${sel ? 'text-cyan' : 'text-text-2'}`}
                  >
                    {sel && <span className="absolute left-0 top-0 h-full w-[2px] bg-cyan" />}
                    {d.district}
                    <span className="font-num text-text-3">{d.count.toLocaleString()}</span>
                  </button>
                );
              })}
            </div>
            <div ref={listRef} onScroll={onScroll} className="min-w-0 flex-1 overflow-y-auto">
              {shown.length === 0 ? (
                <PanelStateView state="empty" />
              ) : (
                <ul className="p-1.5">
                  <AnimatePresence initial={false}>
                    {shown.map((w, i) => (
                      <motion.li
                        key={w.id}
                        initial={{ x: -6, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        transition={{ duration: 0.25, delay: Math.min(i % 20, 10) * 0.03 }}
                        onClick={() => writeLinkage(w)}
                        className="group relative flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 transition-colors hover:bg-bg-panel-2"
                      >
                        <span className="absolute left-0 top-1/2 h-0 w-[2px] -translate-y-1/2 bg-cyan transition-all duration-200 group-hover:h-4/5" />
                        <span className="h-[18px] w-[18px] shrink-0" dangerouslySetInnerHTML={{ __html: waterIconSvg(w.type) }} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13px] text-text-1">{w.name}</div>
                          <div className="truncate text-[11px] text-text-3">{w.address || `${w.district} · ${w.type}`}</div>
                        </div>
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-text-3 opacity-0 transition-opacity group-hover:opacity-100" />
                      </motion.li>
                    ))}
                  </AnimatePresence>
                  {appending && Array.from({ length: 3 }).map((_, i) => (
                    <li key={`sk-${i}`} className="mx-2 my-1.5 h-9 animate-pulse rounded-md bg-bg-panel-2" />
                  ))}
                  {allLoaded && (
                    <li className="py-2 text-center text-[11px] text-text-3">已加载全部 {rows.length} 条</li>
                  )}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 类型检查**

Run: `cd /home/ljb/program/FireRescueAI/web && npx tsc --noEmit`
Expected: 无新增错误。

- [ ] **Step 3: 提交**

```bash
cd /home/ljb/program/FireRescueAI/web
git add src/components/panels/WaterSourcePanel.tsx
git commit -m "feat(water): WaterSourcePanel(统计+区树+清单+定位联动)" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: `RealGisMap.tsx` 改(站图标化 + 水源层 + 联动)

**Files:**
- Modify: `src/components/RealGisMap.tsx`

**Interfaces:**
- Consumes(Task 2/3):`stationIconSvg`/`waterIconSvg`/`shouldShowWater`(from `@/lib/map-icons`)、`fetchWaterSources`(from `@/api/water`)、`WaterSource`

- [ ] **Step 1: 改 import(顶部)**

把第 10 行 `import { fetchStations } from '@/api/force';` 下一行加:
```ts
import { fetchWaterSources } from '@/api/water';
import { stationIconSvg, waterIconSvg, shouldShowWater } from '@/lib/map-icons';
import type { WaterSource } from '@/mock/types';
```
**删除**第 19–25 行的本地 `TYPE_COLORS`(改用 `map-icons` 导出;但本文件改用 `stationIconSvg(type)` 直接产 SVG,不再单独取色,故移除 `TYPE_COLORS` 常量与第 96 行 `const color = ...` 用法)。

- [ ] **Step 2: 加水源 state/ref(在 `const [stations, setStations]` 附近)**

```ts
const [water, setWater] = useState<WaterSource[]>([]);
const waterRef = useRef<WaterSource[]>([]);
const waterLayerRef = useRef<L.LayerGroup | null>(null);
const waterMarkersRef = useRef<Map<string, L.Marker>>(new Map());
```

- [ ] **Step 3: 拉取水源(在拉取消防站的 `useEffect` 之后新增一个 `useEffect`)**

```ts
useEffect(() => {
  let alive = true;
  fetchWaterSources()
    .then((ws) => { if (alive) { waterRef.current = ws; setWater(ws); } })
    .catch(() => { /* 水源加载失败不阻断站显示 */ });
  return () => { alive = false; };
}, []);
```

- [ ] **Step 4: 消防站 marker 改 `divIcon`(替换原 `L.circleMarker` 块,第 95–108 行)**

把
```ts
for (const s of stations) {
  const color = TYPE_COLORS[s.type] ?? '#22d3ee';
  const marker = L.circleMarker([s.lat, s.lng], { radius: 7, color, weight: 2, fillColor: color, fillOpacity: 0.35 })
    .addTo(map).bindPopup(`<b>${s.name}</b><br/>${s.type} · 在位 ${s.personnel} 人<br/>${s.address}<br/>${s.lng}, ${s.lat}`)
    .on('click', () => handleStationClick(s));
  markersRef.current.set(s.id, marker);
}
```
改为:
```ts
for (const s of stations) {
  const marker = L.marker([s.lat, s.lng], {
    icon: L.divIcon({ html: stationIconSvg(s.type), className: 'map-icon-station', iconSize: [24, 24], iconAnchor: [12, 24], popupAnchor: [0, -24] }),
  })
    .addTo(map).bindPopup(`<b>${s.name}</b><br/>${s.type} · 在位 ${s.personnel} 人<br/>${s.address}<br/>${s.lng}, ${s.lat}`)
    .on('click', () => handleStationClick(s));
  markersRef.current.set(s.id, marker);
}
```

- [ ] **Step 5: 新增水源层 effect(zoom 过滤 + marker)**

在消防站 marker 的 `useEffect` 之后新增:
```ts
useEffect(() => {
  const map = mapRef.current;
  if (!map || !TIANDITU_KEY) return;
  const layer = L.layerGroup().addTo(map);
  waterLayerRef.current = layer;

  const render = () => {
    layer.clearLayers();
    waterMarkersRef.current.clear();
    if (!shouldShowWater(map.getZoom())) return;
    for (const w of water) {
      const m = L.marker([w.lat, w.lng], {
        icon: L.divIcon({ html: waterIconSvg(w.type), className: 'map-icon-water', iconSize: [18, 18], iconAnchor: [9, 18], popupAnchor: [0, -18] }),
      })
        .bindPopup(`<b>${w.name}</b><br/>${w.type} · ${w.district}<br/>${w.address}<br/>${w.lng}, ${w.lat}`)
        .on('click', () => addSceneAction({ action: 'flyTo', target: w.name, params: { lng: w.lng, lat: w.lat }, source: '面板' }));
      layer.addLayer(m);
      waterMarkersRef.current.set(w.id, m);
    }
  };

  render();
  const onZoom = () => render();
  map.on('zoomend', onZoom);

  return () => {
    map.off('zoomend', onZoom);
    layer.remove();
    waterLayerRef.current = null;
    waterMarkersRef.current.clear();
  };
}, [water]);
```

- [ ] **Step 6: sceneLog 联动扩展(在现有 `flyTo`/`addMarker` 分支内,站名 miss 后查水源)**

把原
```ts
if (latest.action === 'flyTo' || latest.action === 'addMarker') {
  const hit = stationsRef.current.find((s) => latest.target?.includes(s.name));
  if (hit) {
    map.flyTo([hit.lat, hit.lng], Math.max(map.getZoom(), 14));
    const m = markersRef.current.get(hit.id);
    if (m) m.openPopup();
  }
}
```
改为(站 miss → 查水源,且确保 zoom≥13 让水源层可见):
```ts
if (latest.action === 'flyTo' || latest.action === 'addMarker') {
  const hit = stationsRef.current.find((s) => latest.target?.includes(s.name));
  if (hit) {
    map.flyTo([hit.lat, hit.lng], Math.max(map.getZoom(), 14));
    const m = markersRef.current.get(hit.id);
    if (m) m.openPopup();
  } else {
    const w = waterRef.current.find((x) => latest.target?.includes(x.name));
    if (w) {
      map.flyTo([w.lat, w.lng], Math.max(map.getZoom(), 13));
      // zoomend 后水源层重建,延迟开 popup
      window.setTimeout(() => waterMarkersRef.current.get(w.id)?.openPopup(), 350);
    }
  }
}
```

- [ ] **Step 7: 无 key 降级列表含水源(替换降级 `stations.map` 块,第 156–163 行附近)**

在 `{stations.map((s) => ...)}` 同级后追加:
```tsx
{water.map((w) => (
  <div key={w.id} className="whitespace-nowrap text-text-3">
    💧 {w.name} {w.lng.toFixed(4)}, {w.lat.toFixed(4)}
  </div>
))}
```

- [ ] **Step 8: 类型检查 + 构建**

Run: `cd /home/ljb/program/FireRescueAI/web && npx tsc --noEmit && npm run build`
Expected: 无新增类型错误;build 成功。

- [ ] **Step 9: 提交**

```bash
cd /home/ljb/program/FireRescueAI/web
git add src/components/RealGisMap.tsx
git commit -m "feat(gis): RealGisMap 站图标化 + 水源层(zoom>=13,divIcon)+ 联动定位" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: `App.tsx` 挂水源面板 + 全量验证

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes(Task 4):`WaterSourcePanel`(默认导出)、`Droplet`(lucide 图标,已在文件内或新增 import)

- [ ] **Step 1: 加 import(顶部)**

在 `import ForceResourcePanel ...` 下加:
```ts
import WaterSourcePanel from '@/components/panels/WaterSourcePanel';
import { Droplet } from 'lucide-react';
```
(若 `Droplet` 未在已有 lucide import 中,合并进现有 `lucide-react` import 行。)

- [ ] **Step 2: 加 `waterPanelOpen` state**

在 `forcePanelOpen` state 旁加:
```ts
const [waterPanelOpen, setWaterPanelOpen] = useState(true);
```
并把第 71 行 `if (k === 'overview') setForcePanelOpen(true);` 改为:
```ts
if (k === 'overview') { setForcePanelOpen(true); setWaterPanelOpen(true); }
```

- [ ] **Step 3: overview 挂 `DraggablePanel`(在 ForceResourcePanel 的 `DraggablePanel` 闭合 `)}` 之后,line 210 之前)**

```tsx
<DraggablePanel
  panelId="water-source"
  title="消防水源"
  icon={Droplet}
  width={380}
  dock="left"
  defaultPos={{ x: 16, y: 460 }}
  open={waterPanelOpen}
  onOpenChange={setWaterPanelOpen}
>
  <WaterSourcePanel />
</DraggablePanel>
```

- [ ] **Step 4: 类型检查 + 构建 + 全量测试**

Run:
```bash
cd /home/ljb/program/FireRescueAI/web && npx tsc --noEmit && npm run build && npx vitest run
```
Expected:类型/构建无错;vitest 全绿(新增 water-mapper 5 + map-icons 5,既有无回归)。

- [ ] **Step 5: 手动验证(dev server)**

Run(用户侧,若 znya 与 web 未跑):
```bash
# znya 后端(若未跑)
cd /home/ljb/program/FireRescueAI/znya_jjxf119/server && setsid .venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000 > /tmp/znya.log 2>&1 < /dev/null &
# web dev
cd /home/ljb/program/FireRescueAI/web && npm run dev
```
打开 overview 模块,核验:
- 左侧两个浮动面板:执勤力量资源库(16/16)+ 消防水源(16/460),可拖拽
- 水源面板:总数卡(614)+ 类型小计 + 区树(濂溪288/柴桑256/浔阳42/彭泽28)+ 清单;点行地图 flyTo + popup
- 地图:消防站菱形"消"图标(按类型色);zoom≥13 显示水源水滴图标;zoom<13 隐藏水源

- [ ] **Step 6: 提交**

```bash
cd /home/ljb/program/FireRescueAI/web
git add src/App.tsx
git commit -m "feat(water): overview 挂载 WaterSourcePanel(DraggablePanel,与站库面板错开)" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Self-Review(写计划后自查)

**1. Spec coverage** — 对照 spec 各节:
- 独立 WaterSourcePanel → Task 4 + Task 6 挂载 ✓
- zoom≥13 水源点 + 站图标化 → Task 5 Step 4/5/6 ✓
- 面板↔地图联动(flyTo+popup)→ Task 4 writeLinkage + Task 5 Step 6 sceneLog 扩展 ✓
- 不破坏 82 站/执勤面板 → 站 marker 仅换渲染(divIcon),逻辑/popup/联动保留;执勤面板不动 ✓
- api/water.ts(fetchWaterSources 分页)→ Task 3 ✓
- water-mapper(区/类型统计 + 区名)→ Task 1 ✓
- map-icons(divIcon SVG + shouldShowWater)→ Task 2 ✓
- 测试(water-mapper / map-icons / shouldShowWater)→ Task 1/2 ✓
- WaterSource 类型 → Task 1 Step 1 ✓

**2. Placeholder scan** — 无 TBD/TODO;所有代码块完整;测试有断言;命令有 Expected。Task 5 对 RealGisMap 的修改以"替换块 + 行号锚点"给出,无含糊。

**3. Type consistency** — `WaterSource` 接口跨 Task 1/3/4/5 字段一致(id/name/type/lat/lng/address/districtCode/district/status);`mapWaterSource`/`buildWaterDistrictStats`/`buildWaterTypeStats`/`fetchWaterSources`/`stationIconSvg`/`waterIconSvg`/`shouldShowWater` 签名跨任务一致;`waterMarkersRef`/`waterLayerRef`/`waterRef` 在 Task 5 内一致。
