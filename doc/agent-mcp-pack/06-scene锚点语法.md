# scene:// 场景锚点语法（agent 正文联动 3D）

> 源文件：`web/plan/2026-08-24-agent-scene-links.md`。关联实现：`lib/scene-facilities.ts`、`lib/scene-command-bus/`、`src/components/assistant-ui/scene-link.tsx`、`markdown-text.tsx`、`lib/location-linkify.ts`。

智能体在正文回复中用 markdown 链接输出可点击锚点，用户点击触发 3D 联动（楼层聚焦/设备飞向/类型高亮）。渲染层全部 agent 聊天面板已接入（markdown `a` 组件统一拦截 `scene://` 前缀）。

## 1. 语法（三种）

| 类型 | 语法 | 示例 | 点击效果 |
|---|---|---|---|
| 楼层 | `[文本](scene://floor/<楼层段>)` | `[13F 避难层](scene://floor/13F)`、`[3-4F 餐饮](scene://floor/3-4F)` | 独显该楼层段并飞向整体中心 |
| 设备 | `[文本](scene://device/<对象id>)` | `[5F 3号消火栓](scene://device/<outId>)` | 飞向该设备并高亮 |
| 类型 | `[文本](scene://type/<类型>?floor=<F>)` | `[本层消火栓](scene://type/室内消火栓?floor=5F)` | 高亮该类型设备(前12个)并飞向所在楼层 |

## 2. 提示词约定（各 agent 通用）

1. 楼层锚点**最常用**：凡提到具体楼层/楼层段（如"起火层 5F""避难层 13F/25F""餐饮层 3-4F"），一律包成 `[名称](scene://floor/楼层段)`。楼层段写法与 `focus_floors`/`list_floors` 一致（`B1`/`5F`/`3-4F`/`13F/25F` 均可）。
2. 提到设备类型时用 `scene://type/中文类型名`（类型名见 `query_scene_facilities` 返回的 `fireByTypeLabel` 键），可加 `?floor=` 限定楼层。
3. 设备级锚点（`scene://device/<id>`）只有拿到 `list_fire_devices` 的具体 id 时才用，不要臆造 id。
4. 一个回答里锚点不超过 3-4 个，避免刷屏；锚点文本要能独立读懂（不要只写"这里"）。
5. 锚点语法是 markdown 链接：`[展示文本](scene://...)`，必须写完整，不要留空文本。

## 3. 演示示例

> 起火点在 **5F 餐饮层**，人员密集。本楼设 **13F/25F 两处避难层**，其中 **25F 避难层** 净面积 580㎡，可容纳约 1100 人。高区客房层（26-40F）疏散中转依托 25F。
> - [5F 餐饮层](scene://floor/5F) ← 火点
> - [25F 避难层](scene://floor/25F) ← 疏散中转
> - [本层感烟探测器](scene://type/感烟探测器?floor=5F)

## 4. 客户端确定性链接化（不依赖模型自觉）

实测模型从不主动输出锚点，故另有客户端确定性分词方案（2026-08-27 上线）：

- `lib/location-linkify.ts`：纯分词器——楼层（5F/B1F/3-4F/13层/2-12F，归一 focus_floors 语汇）+ 设施类型静态词表 + GIS 实体；重叠取长跨者。
- `lib/gazetteer.ts`：地名簿懒加载缓存（key-buildings/key-units/stations 名称→GCJ02）。
- `src/components/RichLocationText.tsx`：LocationVocabProvider（App 根挂一次）+ RichInline（行内子树递归转换）；聊天 markdown 的 p/li/td/th/strong 等统一包裹，流式期间天然生效。
- GIS 实体点击 → 地图飞行 + 落点标记（8s）。
- 接线面：对抗舱决策卡/人工卡/时间轴、复盘工作区、预案面板等。

## 5. 已接入模块与状态

- 链接渲染：全部 agent 聊天面板。
- 查询工具：8787 已注册 `query_scene_facilities`。
- **当前状态：四角色提示词已含 scene 纪律；各业务 agent 提示词待铺开该语法（平台侧待办）。**
