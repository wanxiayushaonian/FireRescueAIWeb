# GIS 视觉与体验（子项目 2）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 依据 `plan/2026-08-08-gis-visual-design.md` 完成四块视觉优化：底图滤镜精调、popup 深色皮肤、marker 精致化、轻量加载反馈。

**Architecture:** 纯表现层改动。CSS 皮肤集中在 `app/globals.css`；SVG 模板在 `lib/map-icons.ts` / `lib/gis/marker-html.ts`；popup className 与选中态钩子在 `lib/gis/render-*.ts`；loading 状态从 `use-gis-data.ts` 导出，指示区 JSX 在 `RealGisMap.tsx`。

**Tech Stack:** Next.js 16 + React 19 + TS + Leaflet + vitest（node 环境，仅 `lib/**/__tests__`）。

## Global Constraints

- **表现层红线**：不碰交互逻辑与数据流；effect 依赖数组、事件绑定语义不变
- 所有 shell 命令前缀 `source ~/.nvm/nvm.sh`
- 测试 `npx vitest run`；类型 `npm run typecheck`；构建 `npm run build`
- 已知既有失败（勿修勿报）：`lib/scene-command-bus/__tests__/{bridge,handlers}.test.ts` 两套件因 `@/mock` 别名在基线就失败
- 设计 token：深色卡片 `rgba(10,20,32,.94)` + 青边 `rgba(34,211,238,.35)` + 文字 `#e6edf3` / 弱化 `#9db4c8`
- **Leaflet 用 transform 定位 marker → 禁止对 `.leaflet-marker-icon` 做 scale/translate 类 transform 动画**（只能 opacity/filter）
- 提交规范：Conventional Commits + 结尾 `Co-Authored-By: Claude <noreply@anthropic.com>`，每 Task 一个 commit，精确 git add

---

### Task 1: 底图滤镜精调

**Files:**
- Modify: `app/globals.css`（`.gis-dark-filter`，约 276 行）

**Interfaces:**
- Produces: 无新接口。`use-leaflet-map.ts` 继续给矢量瓦片容器加 `gis-dark-filter` class，不动。

- [ ] **Step 1: 改滤镜**

```css
/* GIS 深色地图滤镜(高德矢量瓦片 → 深色指挥大屏;保色相,压明度饱和) */
.gis-dark-filter {
  filter: invert(1) hue-rotate(180deg) sepia(0.15) saturate(0.7) brightness(0.82) contrast(0.95);
}
```

- [ ] **Step 2: 构建验证 + Commit**

Run: `source ~/.nvm/nvm.sh && npm run build`
Expected: 通过

```bash
git add app/globals.css
git commit -m "style(gis): 底图暗色滤镜精调(保色相多滤镜组合)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

注：最终调参由用户视觉验收时迭代（sepia/saturate/brightness 三个旋钮），本任务落地结构性正确的新基线。

---

### Task 2: popup / tooltip 深色皮肤

**Files:**
- Modify: `app/globals.css`（新增 `.gis-popup` / `.gis-tip` 两组样式）
- Modify: `lib/gis/render-stations.ts`、`render-water.ts`、`render-key-units.ts`、`render-incidents.ts`、`render-key-buildings.ts`（bindPopup 加 className）

**Interfaces:**
- Produces: popup class `gis-popup`；tooltip class `gis-tip`。各渲染器 bindPopup 第二参 `{ className: 'gis-popup' }`；聚合气泡/区域 tooltip 的 className 改/加 `gis-tip`。

- [ ] **Step 1: globals.css 新增皮肤**

```css
/* === GIS popup 深色皮肤(与路线贴线卡同款 token) === */
.gis-popup .leaflet-popup-content-wrapper {
  background: rgba(10, 20, 32, 0.94);
  color: #e6edf3;
  border: 1px solid rgba(34, 211, 238, 0.35);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
  font-size: 12px;
  line-height: 1.6;
}
.gis-popup .leaflet-popup-content {
  margin: 8px 12px;
}
.gis-popup .leaflet-popup-content b {
  color: #22d3ee;
}
.gis-popup .leaflet-popup-tip {
  background: rgba(10, 20, 32, 0.94);
  border: 1px solid rgba(34, 211, 238, 0.35);
  box-shadow: none;
}
.gis-popup .leaflet-popup-close-button {
  color: #9db4c8;
  font-size: 14px;
  padding: 4px 6px 0 0;
}
.gis-popup .leaflet-popup-close-button:hover {
  color: #22d3ee;
}

/* GIS tooltip 深色皮肤(聚合气泡/区域 hover;boundary-label-tip 已有同款,不重复改) */
.gis-tip.leaflet-tooltip {
  background: rgba(10, 20, 32, 0.9) !important;
  border: 1px solid rgba(34, 211, 238, 0.3) !important;
  color: #e6edf3 !important;
  font-size: 11px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4) !important;
}
.gis-tip.leaflet-tooltip::before {
  display: none !important;
}
```

- [ ] **Step 2: 渲染器接线**

5 个渲染器中所有 `.bindPopup(html)` → `.bindPopup(html, { className: 'gis-popup' })`。
tooltip 处：水源/单位/建筑聚合气泡的 `.bindTooltip('... 个 xx,放大地图查看', { direction: 'top' })` → 加 `className: 'gis-tip'`；render-regions 的 tooltip 已有 `className: 'boundary-label-tip'`（保持）；render-water 周边高亮 circleMarker 的 tooltip（`${w.name} · ${w.type} · ...m`，在 use-deploy-routes 的 highlightNearbyWater）→ 加 `className: 'gis-tip'`。

- [ ] **Step 3: 验证 + Commit**

Run: `source ~/.nvm/nvm.sh && npm run typecheck && npx vitest run && npm run build`
Expected: 全绿（除已知 2 套件）

```bash
git add app/globals.css lib/gis/render-*.ts src/components/gis/hooks/use-deploy-routes.ts
git commit -m "style(gis): popup/tooltip 深色皮肤统一(gis-popup/gis-tip)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: marker 精致化（发光 / hover / 选中态 / 警情底环 / 淡入）

**Files:**
- Modify: `app/globals.css`
- Modify: `lib/gis/marker-html.ts`（警情单位加静态底环 span）
- Test: `lib/__tests__/marker-html.test.ts`（补底环断言）
- Modify: `lib/gis/render-stations.ts`、`render-water.ts`、`render-key-units.ts`、`render-key-buildings.ts`、`render-incidents.ts`（popupopen/popupclose 切选中态 class）

**Interfaces:**
- Produces: 选中态 class `gis-marker-active`（渲染器在 popupopen 加、popupclose 删）；警情底环 class `unit-incident-ring-base`。

- [ ] **Step 1: 先改测试（TDD：底环断言）**

`lib/__tests__/marker-html.test.ts` 的"有警情"用例补一行：

```ts
expect(html).toContain('unit-incident-ring-base');
```

Run: `source ~/.nvm/nvm.sh && npx vitest run lib/__tests__/marker-html.test.ts`
Expected: FAIL（底环不存在）

- [ ] **Step 2: marker-html.ts 加底环**

`keyUnitMarkerHtml` 警情分支改为（加静态底环，脉冲环不动）：

```ts
if (opts.incidentLevel != null) {
  return `<div class="unit-incident-wrap">${base}<span class="unit-incident-ring-base"></span><span class="unit-incident-ring" data-level="${opts.incidentLevel}"></span><span class="unit-incident-level">${opts.incidentLevel}</span></div>`;
}
```

- [ ] **Step 3: globals.css 加 marker 视觉**

```css
/* marker 发光(深色底立体化) */
.map-icon-station,
.map-icon-key-unit,
.map-icon-key-building {
  filter: drop-shadow(0 0 4px rgba(34, 211, 238, 0.35));
}
.map-icon-water {
  filter: drop-shadow(0 0 3px rgba(56, 189, 248, 0.4));
}
.map-icon-water-cluster,
.map-icon-unit-cluster,
.map-icon-building-cluster {
  filter: drop-shadow(0 0 4px rgba(255, 255, 255, 0.15));
}
/* hover 提亮(禁止 scale/translate:Leaflet 用 transform 定位 marker) */
.leaflet-marker-icon.map-icon-station:hover,
.leaflet-marker-icon.map-icon-water:hover,
.leaflet-marker-icon.map-icon-key-unit:hover,
.leaflet-marker-icon.map-icon-key-building:hover {
  filter: brightness(1.25) drop-shadow(0 0 6px rgba(34, 211, 238, 0.55));
}
/* popup 打开中的选中态:青色外圈(渲染器 popupopen/popupclose 切 class) */
.leaflet-marker-icon.gis-marker-active {
  outline: 2px solid rgba(34, 211, 238, 0.8);
  outline-offset: 2px;
  border-radius: 50%;
}
/* 警情单位静态底环(减少脉冲环的视觉漂浮感) */
.unit-incident-ring-base {
  position: absolute;
  inset: -6px;
  border: 1px solid rgba(239, 68, 68, 0.5);
  border-radius: 50%;
  pointer-events: none;
}
/* marker 淡入(Leaflet 重建时自然触发) */
@keyframes marker-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
.map-icon-station,
.map-icon-water,
.map-icon-key-unit,
.map-icon-key-building,
.map-icon-incident,
.map-icon-water-cluster,
.map-icon-unit-cluster,
.map-icon-building-cluster {
  animation: marker-fade-in 0.25s ease-out;
}
```

- [ ] **Step 4: 渲染器加选中态钩子**

5 个渲染器中每个绑了 popup 的 marker，在 bindPopup 之后加：

```ts
marker.on('popupopen', () => marker.getElement()?.classList.add('gis-marker-active'));
marker.on('popupclose', () => marker.getElement()?.classList.remove('gis-marker-active'));
```

（变量名按各渲染器实际——如 render-water 里是 `m`。）

- [ ] **Step 5: 验证 + Commit**

Run: `source ~/.nvm/nvm.sh && npx vitest run lib/__tests__/marker-html.test.ts && npm run typecheck && npx vitest run && npm run build`
Expected: 全绿（除已知 2 套件）

```bash
git add app/globals.css lib/gis/marker-html.ts lib/__tests__/marker-html.test.ts lib/gis/render-*.ts
git commit -m "style(gis): marker 发光/hover/选中态/警情底环/淡入

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: 轻量加载反馈（waterLoading + 指示区）

**Files:**
- Modify: `src/components/gis/hooks/use-gis-data.ts`（导出 `waterLoading`）
- Modify: `src/components/RealGisMap.tsx`（右下角指示区 JSX）
- Modify: `app/globals.css`（加载点动画）

**Interfaces:**
- Produces: `useGisData` 返回值新增 `waterLoading: boolean`（水源 bbox/clusters 请求进行中为 true，受 seq/alive 守卫）；`RealGisMap` 消费它 + 现有 `water`/`waterClusters`/`zoom`/`showWater` 推导空态。

- [ ] **Step 1: use-gis-data 加 waterLoading**

```ts
const [waterLoading, setWaterLoading] = useState(false);
```

水源 effect 的 `load()` 内：两个 fetch 分支各自在发起前 `setWaterLoading(true)`；在 `then`/`catch` 里、通过 `if (!alive || mySeq !== seq) return` 守卫**之后**再 `setWaterLoading(false)`（过期响应不得误关 loading）。zoom<13 提前清空的分支也要 `setWaterLoading(false)`。effect 清理函数不动。返回值加 `waterLoading`。

- [ ] **Step 2: RealGisMap 指示区**

从 useGisData 解构 `waterLoading`，加推导与 JSX（放 tilesFailed 提示块附近）：

```tsx
const waterEmpty =
  !waterLoading && shouldShowWater(zoom) && water.length === 0 && waterClusters.length === 0;
```

```tsx
{showWater && (waterLoading || waterEmpty) && (
  <div className="absolute bottom-3 right-14 z-[500] flex items-center rounded border border-line bg-bg-panel/90 px-2.5 py-1 text-[11px] text-text-2">
    {waterLoading ? (
      <>
        <span className="gis-loading-dot" />
        水源加载中…
      </>
    ) : (
      '当前区域无水源数据'
    )}
  </div>
)}
```

import 侧：`shouldShowWater` 从 `@/lib/map-icons` 加进现有 import（若未引）。

- [ ] **Step 3: globals.css 加载点动画**

```css
/* 水源加载指示点 */
.gis-loading-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #22d3ee;
  margin-right: 6px;
  animation: gis-loading-pulse 1s ease-in-out infinite;
}
@keyframes gis-loading-pulse {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 1; }
}
```

- [ ] **Step 4: 验证 + Commit**

Run: `source ~/.nvm/nvm.sh && npm run typecheck && npx vitest run && npm run build`

```bash
git add src/components/gis/hooks/use-gis-data.ts src/components/RealGisMap.tsx app/globals.css
git commit -m "feat(gis): 水源加载/空态轻量指示 + marker 淡入已在 Task3 落地

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: 全量验证 + 视觉验收

**Files:**
- 无新文件；若有视觉调参迭代则 Modify: `app/globals.css`

- [ ] **Step 1: 全量验证**

Run: `source ~/.nvm/nvm.sh && npm run typecheck && npx vitest run && npm run build`
Expected: 全绿（除已知 2 套件）

- [ ] **Step 2: 起 dev server 确认编译与页面可访问**

Run: `source ~/.nvm/nvm.sh && npm run dev`，curl 首页 200 后停掉。

- [ ] **Step 3: 输出用户视觉验收清单（报告给用户人工执行）**

```
□ 底图:绿地/水系/道路无明显偏色,地名注记可读(对比 master 旧滤镜)
□ popup:点站/水/单位/建筑/警情——深色卡片+青边+青标题,关闭按钮可见
□ tooltip:聚合气泡 hover、周边水源高亮 tooltip 深色化
□ marker:发光自然;hover 提亮;popup 打开时 marker 有青色外圈,关闭消失
□ 警情:单位红色圆环=静态底环+脉冲环;独立警情脉冲正常
□ 淡入:缩放切换水源层级时点位淡入不突兀
□ 加载:平移触发水源加载时右下角"水源加载中…";空白区域显示"无水源数据"
□ 底图切换:卫星无滤镜,矢量有滤镜
```

- [ ] **Step 4: Commit（若有调参迭代）**

```bash
git add app/globals.css
git commit -m "style(gis): 视觉验收调参定稿

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## 附：风险

1. Task 1 滤镜值是基线非定稿，视觉验收可迭代（只动 globals.css 一行）
2. Task 3 的选中态钩子是 renderers 里唯一新增的 JS（popupopen/close 切 class），popup 恢复 openId 的水源重建路径需确认 class 恢复——`openPopup()` 会触发 popupopen，class 自然恢复，无需额外处理
3. 禁止 transform 动画的约束已在 Task 3 注释中显式化
