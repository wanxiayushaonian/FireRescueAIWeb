# GIS 底座视觉与体验设计（子项目 2 / 策略 A）

> 2026-08-08 brainstorming 结论。依赖子项目 1（结构重构，已完成）的模块归属。
> 用户裁决：底图=精调滤镜；marker=精致化微调；反馈=轻量反馈。四项痛点全做。

## 范围与原则

- 只动表现层（CSS / SVG 模板 / 一个 loading 状态导出），**不碰交互逻辑与数据流**
- 沿用现有设计 token：`rgba(10,20,32,.94)` 深色卡片底、青色 `#22d3ee` 强调、`#e6edf3`/`#9db4c8` 文字层级（与路线贴线卡、boundary-label-tip 同款）
- 落点集中在：`app/globals.css`、`lib/map-icons.ts`、`src/components/gis/hooks/use-gis-data.ts`（仅加 loading 状态导出）、`RealGisMap.tsx`（仅加指示区 JSX）

## 一、暗色底图滤镜精调

现状 `invert(1) hue-rotate(180deg) brightness(.85) contrast(.9)` 一刀反色，绿地/水系偏色、注记发灰。

改为保色相多滤镜组合（初值，浏览器实测迭代定稿）：

```css
.gis-dark-filter {
  filter: invert(1) hue-rotate(180deg) sepia(0.15) saturate(0.7) brightness(0.82) contrast(0.95);
}
```

- 仅矢量瓦片套滤镜；卫星底图不套（保持现状）
- 验收：绿地/水系/道路/注记截图对比，无明显偏色、注记可读
- 改动仅 `app/globals.css` 一处

## 二、popup / 信息卡深色化

新增 `.gis-popup` 皮肤（globals.css），覆盖 Leaflet 默认白底：

- `.leaflet-popup-content-wrapper` / `-tip` / 关闭按钮 → 深色卡片 + 青边
- `<b>` 标题青色、坐标行 `#9db4c8` 弱化
- 警情行（红）/已建模标记（金）强调色保持
- tooltip（水源气泡、区域 hover）统一进同套皮肤
- `lib/gis/popup-html.ts` 模板结构不动（内容与皮肤分离），仅可能加容器 class

## 三、marker 精致化微调

`lib/map-icons.ts` 字形体系不变（消/重/建/水滴），只做：

1. 发光/投影替代死黑描边（SVG 内发光或 CSS drop-shadow）
2. 统一视觉重量（描边粗细、内部留白；尺寸层级 24/24/22/18 保持）
3. hover 态：`brightness(1.2)` + 1.1 倍放大（CSS，`.leaflet-marker-icon` 钩子）；popup 打开中的选中态加青色外圈
4. 警情单位圆环加静态底环，减少视觉漂浮
5. 聚合气泡：半透明发光描边 + 数字文字阴影

现有 `map-icons` 单测继续保护结构断言；样式细节改动如需更新断言则同步更新。

## 四、轻量加载反馈

1. `use-gis-data` 导出 `waterLoading: boolean`（水源 bbox/clusters 请求开始/结束翻转，沿用 seq 守卫）
2. 右下角指示区（RealGisMap JSX）：加载中显示"水源加载中…"+ 细进度条动画；视口 0 条时显示"当前区域无水源数据"
3. `.leaflet-marker-icon` 加 `marker-fade-in .25s ease-out` 淡入
4. 不做全屏骨架、不做聚合气泡过渡动画

## 验证

- typecheck + vitest 全绿（map-icons/marker-html 等断言同步更新）
- 人工视觉验收：四节各一张前后对比截图（底图偏色、popup 皮肤、marker 发光/hover、加载指示）
- 冒烟沿用子项目 1 清单中涉及视觉的项（popup、聚合气泡、警情脉冲）

## 非目标

- 不换图标语言、不引入高德自定义样式（后续可选升级）
- 不做性能改动（子项目 3）、不加新分析能力（子项目 4）
