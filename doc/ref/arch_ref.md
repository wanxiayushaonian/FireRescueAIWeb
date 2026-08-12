# 3D 场景显隐架构参考（arch_ref）

> 日期：2026-08-12  
> 定位：与 `doc/ref/ref.md`（产品需求）并列的**技术架构参考**。  
> 范围：以"模型显隐编排"为主线，覆盖与之强耦合的部分（场景生命周期、聚焦视角、用户/agent 双驱动、命令归一），不覆盖无关能力（视频弹窗、POI 标注绘制、GIS 叠加）。  
> 关联：`doc/ref/ref.md` · `AGENTS.md` · `plan/2026-08-09-drill-simulation-design.md`

---

## 1. 背景与目标

### 1.1 一句话目标

**把"不同演示场景该显示哪些模型"做成一套统一、可复用、可测的 Recipe 编排机制；显隐做对了，完整包场景就能在任何演示下保持高 FPS。**

### 1.2 为什么"显隐 = 高 FPS"

完整场景包（`scene_id=477397460120662016`，137MB zip，约 69k mesh）全量渲染时帧耗时高、操作卡顿。**根本解在平台侧**（精简包 / 按楼层加载 / InstancedMesh），但在前端，**任何一个演示时刻只渲染该演示需要的楼层/楼栋**，就能把活跃 mesh 从 69k 砍到几千，帧率随之回升。这正是 `ref.md` 各模块"飞向某楼层时其他隐藏""熟悉某部位时聚焦"的业务诉求——**业务聚焦与性能优化在同一根管道上统一**。

### 1.3 关键边界：本架构 ≠ 已否决的"丰度分级"

| 维度 | 已否决（`richness-tier-dropped` 记忆） | 本架构 |
|---|---|---|
| 做法 | 全局 `scene.traverse`，按 `userData.renderType` 白名单只留骨架，隐藏墙/门/房间/3D设备/管线 | 按"演示场景/聚焦对象"调用 **SDK 原生显隐方法**（`setViewMode`/`setScene`） |
| 目的 | 纯粹降质提帧 | 业务聚焦（看哪层/哪栋/哪个部位），高 FPS 是副产物 |
| 粒度 | 渲染类别（WALL/DOOR/...） | 楼层 / 楼栋 / 空间关系（可达性·连通性） |
| 评价 | 用户明确否决 | 复用 SDK 公开能力，符合 `AGENTS.md` 约束 |

> **禁区**：本架构**绝不**走前端 `scene.traverse` 设 `visible` 的路。所有显隐必须落到 SDK 方法。

### 1.4 技术现实约束（决定字段设计）

- **显隐有效粒度 = 楼层 / 楼栋**。SDK `setViewMode` 只认 story/building 的 `out_instance_id`。
- **设施级显隐不可用**。SDK `hide/show` 对完整包无效（仅 1 个 twins 节点）。故 `ref.md` 模块二"查看某固定设施时其他隐藏"在技术上**降级**为：飞向该设施 + 只显示其所在楼层 + 高亮该设施。
- **显隐动作必须走 SDK 方法**（`AGENTS.md` 强制），不允许直接操作 soonspace/three 对象。
- **楼层显隐是独立有效能力**（现有 `FloorDisplayPanel` + `setViewMode` 已验证），是本架构的主干。

---

## 2. 设计原则

1. **SDK 原生优先** — 任何显隐/聚焦都映射到一个现有 SDK 方法，不自写渲染、不 traverse。
2. **不前端 traverse** — `richness-tier-dropped` 的硬约束。
3. **单一真相源** — 场景"该显示成什么样"只有一个权威状态（`RecipeStore`），消除现存双体系（`SceneCommandBridge` vs `RealSceneView`）的总线空转风险。
4. **结构层 / 观察层正交** — "显示哪些"（持久，模块/agent 管控）与"看哪里/突出谁"（临时，用户/agent 可随时叠加）分两层，天然消解冲突。
5. **幂等** — 相同 Recipe 重复投递 = 零 SDK 调用；显隐是幂等的，失败 best-effort 不回滚。
6. **纯逻辑可测** — diff/apply/store 是框架无关的纯函数/纯类，全部在 `lib/` 下单测，延续本项目 358 测试的既有风格。

---

## 3. 架构总览

```
┌────────────── 驱动层（只产 Recipe patch，不碰 SDK）──────────────────┐
│ FloorDisplayPanel(用户)  模块预设/子流程(进入态)  AgentRunner(agent) │
│                              （兼容：scene-action-executor）          │
└───────┬────────────────────────┬───────────────────────┬────────────┘
        │ 结构层 patch            │ 结构层(+观察层)        │ 观察层 patch
        ▼                         ▼                        ▼
┌──────────────────── recipe-store（单一真相源）──────────────────────┐
│  current: SceneRecipe │ 结构层持久态 + 观察层临时态 │ subscribe()    │
└───────┬──────────────────────────────────────────────┬──────────────┘
        │ 订阅变更（带 changeset）                        │ 订阅(审计)
        ▼                                               ▼
┌────────────── RecipeEngine（纯函数，可单测）─────────────┐  ┌ sceneLog ┐
│ diffRecipe(prev,next) → Changeset                       │  │ 降级审计 │
│ applyRecipe(runtime, changeset) → 顺序化+幂等 SDK 调用   │  └──────────┘
└───────┬──────────────────────────────────────────────────┘
        ▼
┌────────────── SoonspaceRuntime（现有，不改）─────────────────────────┐
│ setViewMode / flyToObject / setCameraViewpoint / setGisVisible / ... │
└───────┬──────────────────────────────────────────────────────────────┘
        ▼ SDK 原生方法
   uStudio / Soonspace 引擎
```

### 3.1 模块清单（新增 `lib/scene-recipe/`，每文件 < 200 行）

| 文件 | 职责 | 依赖 |
|---|---|---|
| `types.ts` | `SceneRecipe`（结构层+观察层）、`Changeset`、`RecipeRuntime` 接口 | 无 |
| `diff.ts` | `diffRecipe(prev,next): Changeset` 纯函数 | types |
| `engine.ts` | `applyRecipe(runtime, tree, changeset): Promise<ApplyResult>` 顺序化+幂等 | types, diff |
| `store.ts` | `RecipeStore`：持 current、subscribe、结构/观察分层 dispatch | types, diff |
| `react.ts` | `useRecipe()`/`useStructural()`/`useRecipeDispatch()` 绑定 | store |
| `presets.ts` | 模块/子流程 Recipe 预设常量 | types |
| `__tests__/` | diff 幂等、apply 顺序、store 分层、presets 快照 | — |

### 3.2 单向依赖

```
presets.ts ─► types.ts ◄─ diff.ts
                          engine.ts ──┐
                          store.ts ───┼──► react.ts ──► 驱动层组件
                                      └──► (绑定层 in SceneProvider)
```

- `lib/` 不反向依赖 `src/`（修正现有 `scene-action-executor` 引 `@/mock/sceneLog` 的不纯）。
- `engine.ts` 只依赖 `RecipeRuntime`（`SoonspaceRuntime` 的最小子集接口），便于 mock 测试。
- `SoonspaceRuntime`（922 行）**不改**，是 engine 的执行后端。

---

## 4. 数据模型：SceneViewRecipe

```ts
// lib/scene-recipe/types.ts

/** 结构层 — 决定"场景里显示哪些"，由模块预设 + agent 管控；持久 */
export interface StructuralRecipe {
  visibleStories: string[];            // 楼层 out_instance_id 集合 → setViewMode
  visibleBuildings: string[];          // 楼栋 out_instance_id 集合 → setViewMode
  mode: '2D' | '3D';                   // → setViewMode params.type
  yExtend: boolean;                    // 楼层炸开 → setViewMode YExtend
  gisVisible: boolean;                 // GIS 底图 → gisSetVisible
  labels: { visible: boolean; ids?: string[] }; // 标注 → showLabels/hideLabels
  reachable?: { nodeId: string };      // 可达性过滤 → setScene({reachable,nodeId})
  connectivity?: { spaceId: string };  // 连通性过滤 → setScene({connectivity,spaceId})
}

/** 观察层 — 决定"看哪里/突出谁/叠加什么"，用户随时可调、agent 可覆盖；临时 */
export interface ObservationalRecipe {
  focus?: { objectId: string; highlightColor?: string }; // 飞向+高亮（设施级"聚焦"的唯一实现）
  viewpoint?: CameraViewpoint;        // 直接设视角（与 focus 二选一）
  routes: { id: string; visible: boolean }[];        // 路线显隐 → setVirtualRouteVisible
  polygons: { id: string; visible: boolean }[];      // 多边形显隐 → setVirtualPolygonVisible
}

export interface SceneRecipe {
  structural: StructuralRecipe;
  observational: ObservationalRecipe;
}

/** diff 产物：只含发生变化的字段；__touched 标记该层是否有任何变更 */
export interface Changeset {
  structural: Partial<StructuralRecipe> & { __touched: boolean };
  observational: Partial<ObservationalRecipe> & { __touched: boolean };
}
```

### 4.1 字段 → SDK 调用映射

| 字段 | SDK 调用 | 备注 |
|---|---|---|
| `visibleStories/Buildings + mode + yExtend` | `runtime.setViewMode(params, tree, storyIds, buildingIds)` | 一次调用合并；`params = [{type:mode,ids:storyIds}, ...(yExtend?{type:'YExtend',ids:storyIds})]` |
| `gisVisible` | `runtime.setGisVisible(v)` | — |
| `labels` | `runtime.showLabels(tree, ids, storyIds)` / `hideLabels()` | — |
| `reachable` / `connectivity` | `runtime.setScene({reachable:true,nodeId})` | SDK 高层 setScene |
| `focus` | `runtime.flyToObject(id)` → `runtime.highlightObject(id,color)` | **设施级聚焦降级**：飞向+高亮，不 hide 同层 |
| `viewpoint` | `runtime.setCameraViewpoint(vp, true)` | focus 存在时跳过 |
| `routes/polygons` | `runtime.setVirtualRouteVisible(id,v)` / `setVirtualPolygonVisible(id,v)` | 逐项，仅变化项 |

### 4.2 默认值语义

`defaultStructural()`：`visibleStories/Buildings = 全集`、`mode='3D'`、`yExtend=false`、`gisVisible=true`、`labels.visible=false`、无 reachable/connectivity —— 等价"不裁剪、引擎默认"。观察层字段 `focus/viewpoint` 为 `undefined`（不触碰），`routes/polygons = []`。

---

## 5. RecipeEngine：diff、apply、幂等、错误

### 5.1 RecipeRuntime 接口（依赖倒置）

engine 只依赖 `SoonspaceRuntime` 的最小子集，测试用 mock：

```ts
export interface RecipeRuntime {
  setViewMode(params: unknown, tree: SceneTreeNode, storyIds: string[], buildingIds: string[]): Promise<void>;
  setGisVisible(v: boolean): Promise<void>;
  showLabels(tree: SceneTreeNode, ids?: string[], storyIds?: string[]): void;
  hideLabels(): void;
  setScene(params: unknown): Promise<unknown>;
  flyToObject(id: string): Promise<void>;
  highlightObject(id: string, color?: string): boolean;
  setCameraViewpoint(vp: CameraViewpoint, transition?: boolean): Promise<void>;
  setVirtualRouteVisible(id: string, v: boolean): unknown;
  setVirtualPolygonVisible(id: string, v: boolean): unknown;
}
```

### 5.2 diffRecipe 算法

结构层、观察层**独立 diff**（正交保证）：

- `visibleStories/Buildings`：**集合相等**（排序后比较），切换顺序不算变更。
- `mode/yExtend/gisVisible/labels.visible`：基本类型浅比较。
- `reachable/connectivity`：`JSON.stringify` 比较；`undefined`（关闭）与有值视为变更。
- `focus`：对象相等比较；`undefined → undefined` 不触 touched。
- `routes/polygons`：按 `id` 对齐逐项比较 `visible`，仅变化的 id 进 changeset。
- 任层无变更 → 该层 `__touched: false`，apply 时整层跳过。**观察层 patch 永不触发结构层 SDK 调用。**

### 5.3 applyRecipe 调用顺序（有依赖，不能乱序）

```
阶段1  结构层（先降渲染量）
   ├─ setViewMode(story/building/mode/yExtend 合并一次)   ← 最关键，先做
   ├─ setGisVisible
   ├─ showLabels | hideLabels
   └─ setScene(reachable | connectivity)
阶段2  观察层（依赖结构层已应用，否则飞向对象可能被隐藏）
   ├─ focus 存在 → flyToObject → highlightObject        ← focus 优先于 viewpoint
   ├─ 否则 viewpoint 存在 → setCameraViewpoint
   └─ routes/polygons 逐项（最后，纯叠加）
```

> **硬约束**：结构层全部完成后才开始观察层。`flyToObject` 必须保证目标在可见楼层内，否则 SDK 报"未找到对象"。

### 5.4 幂等

- `RecipeStore` 持久化 `current`；每次 patch 先 `diff(current, next)`，只对 `__touched` 字段发调用。
- 相同 Recipe 重复 dispatch → changeset 全空 → **零 SDK 调用**。
- 数组类字段集合化比较，避免"同内容不同顺序"误触发。

### 5.5 错误处理：best-effort，不回滚

```ts
export interface ApplyResult {
  applied: string[];                            // 成功应用的字段名
  failed: { field: string; error: unknown }[];  // 失败项
}
```

- 单个 SDK 调用失败 → 记入 `failed`，**继续应用其余字段**。显隐幂等，下次 patch 自动修正，无需回滚。
- `setViewMode` 失败（关键）→ 仍继续，但 `failed` 非空时 store 标记 `desynced: true`，UI 可提示"场景状态可能不一致，已重试"。
- **不静默吞**：engine 内 `logger.warn` 每个失败项；`ApplyResult` 经 store 暴露给 React。

---

## 6. RecipeStore + 绑定层

### 6.1 职责分割

- **store**（`lib/scene-recipe/store.ts`，框架无关）：Recipe 状态 + diff + 通知。不持 `runtime/tree`。
- **绑定层**（`SceneProvider` 内 effect）：持 `runtime + tree`，订阅 store，调 `engine.applyRecipe`。SDK 调用集中于此。

### 6.2 RecipeStore API

```ts
export class RecipeStore {
  getCurrent(): SceneRecipe;
  subscribe(listener: (next: SceneRecipe, changeset: Changeset) => void): () => void;

  // 结构层：preset 用 set（整体替换），用户操作用 patch（部分更新）
  setStructural(full: StructuralRecipe): void;
  patchStructural(patch: Partial<StructuralRecipe>): void;

  // 观察层：focus/viewpoint 用 set，routes/polygons 用 patch
  setObservational(full: ObservationalRecipe): void;
  patchObservational(patch: Partial<ObservationalRecipe>): void;

  // 复合：子流程预设（如六熟悉某步 = 结构+观察整体）
  applyPreset(recipe: SceneRecipe): void;
}
```

dispatch 流程：`next → diff(current,next) → 任层 touched 才更新 current + 通知 listener`。

### 6.3 SceneProvider 集成（绑定层）

```ts
// runtime ready 后（view === 'ready'）:
const store = new RecipeStore(defaultStructural());
const unsub = store.subscribe((_next, changeset) => {
  void engine.applyRecipe(runtime, tree, changeset).then((r) => {
    if (r.failed.length) setDesynced(true);
  });
});
// 组件卸载 / sceneId 切换时 unsub
```

context 暴露 `{ store }`，下游经 `useRecipe()` 订阅、`useRecipeDispatch()` 拿 dispatch。

---

## 7. 三路驱动接入

| 驱动源 | 现状 | 迁移后 |
|---|---|---|
| **用户 · `FloorDisplayPanel`** | 直调 `runtime.setViewMode` | `toggleStory → store.patchStructural({visibleStories, yExtend})` |
| **模块预设** | `App.tsx` 切模块不碰场景 | `handleSelect('objects') → store.setStructural(presets.objectsOverview)` |
| **子流程** | 六熟悉步进未接场景 | 步进 → `store.applyPreset(presets.familiarize[k])`（含 focus） |
| **agent · `AgentRunner`** | 决策未接场景 | 决策 → `store.patchObservational({focus:{objectId}})`；到场路线 → `patchObservational({routes})` |
| **兼容 · `scene-action-executor`** | `addSceneAction → runtime` | 退化为适配器：`switchFloor action → store.patchStructural`，其余 action 透传不变 |

### 7.1 默认不套预设（保持现有语义）

`SceneProvider` 在 runtime ready 时以 `defaultStructural()` 初始化 store，**不主动套模块预设**——只有用户切模块/步进才套。这与现有 `FloorDisplayPanel` 的 `dirtyRef`（挂载不重置场景）谨慎策略一致，避免进入模块即打断用户观察。

---

## 8. 预设体系（presets.ts）

纯数据常量，描述各模块/子流程的"场景视图配方"：

```ts
export const presets = {
  objectsOverview: {                          // 对象总览：全楼层 3D + 标注
    structural: { visibleStories: ALL, visibleBuildings: ALL, mode: '3D',
                  yExtend: false, gisVisible: false, labels: {visible:true} },
    observational: { routes: [], polygons: [] },
  },
  drillConfront: {                            // 演练对抗：着火建筑 + GIS
    structural: { visibleStories: ALL, visibleBuildings: [FIRE_BLD], mode: '3D',
                  yExtend: false, gisVisible: true, labels: {visible:true} },
    observational: { routes: [], polygons: [] },
  },
  familiarize: [                              // 六熟悉六步：每步聚焦不同部位
    { structural: {/*只显示1F*/}, observational: { focus: {objectId:'出口A'} } },
    // ...
  ],
};
```

### 8.1 ref.md 五模块 → Recipe 显隐诉求映射

| 模块 | 显隐诉求（ref.md） | Recipe 落点 |
|---|---|---|
| 一·态势总览 | GIS 显隐水源/队站/单位 | 该模块不加载 3D（`SceneContainer` hidden）；3D Recipe 不适用，GIS 图层走 `RealGisMap` |
| 二·对象总览 | 飞向楼层时其他楼层隐藏；设施/部位聚焦 | `visibleStories` + `focus`（设施级降级） |
| 三·熟悉考核 | 六熟悉六步逐步聚焦不同对象 | `familiarize[k]` 预设（结构层 + focus） |
| 四·演练对抗 | 灾情建筑显隐、到场路线、特情高亮 | 结构层（着火楼）+ 观察层（routes/focus） |
| 五·实战指挥 | 灾情变量变化触发模型交互 | 同四，agent 实时 patch 观察层 |

---

## 9. 边界与禁区

### 9.1 vs `richness-tier-dropped`（已否决）

见 §1.3。**本架构不引入 `scene.traverse` 设 `visible`、不引入 renderType 白名单、不做全局降质分级。**

### 9.2 设施级显隐降级

`ref.md` 模块二"查看某固定设施/重点部位时其他隐藏" → SDK `hide/show` 对完整包无效，**降级为**：`focus`（飞向该设施）+ 该设施所在楼层 `visibleStories`（只显示该层）+ `highlightObject`（高亮该设施）。不在文档/代码里承诺"设施级 hide"。

### 9.3 AGENTS.md SDK 约束

- 楼栋/楼层隐藏、2D/3D、炸开、可达性、连通性等动作**必须落到 SDK 方法**（`setViewMode`/`setScene`）。
- 不直接操作 soonspace/three 对象，不自写渲染逻辑。
- `hide/show` 仅对用户手画标注层（`listTwinsInstances`）有效，不用于完整包模型。

---

## 10. 双体系并归方向

### 10.1 现状

- 根 `components/SceneCommandBridge.tsx` → `lib/scene-command-bus/`（registry/handlers/transport/bridge）+ `lib/scene-plugins/`（PluginManager）：**模板原始体系**。
- `src/components/RealSceneView.tsx` → `SceneProvider` + `SoonspaceRuntime`：**迁移后体系**。
- `App.tsx` 同时挂载两者。是否共一个 SDK 实例、`SceneCommandBridge` 是否在做显隐，**未确认**（迁移阶段 0 实测）。

### 10.2 裁定规则（实测驱动）

| 实测结果 | 处理 |
|---|---|
| `SceneCommandBridge` 在做显隐/聚焦 | 职责并入 Recipe 层，删除 bridge（其调用方迁到 store） |
| 只做插件面板命令（与显隐无关） | 保留，文档明确划界"不碰显隐" |
| 根模板组件树（`SoonspaceSceneViewer`/`PluginPanel`/`MultiAgentWidget` 等 18 个）确无运行链路 | 标记可弃用 |

### 10.3 本次范围

实测出结论 + 文档写并归目标；动手并归放实施计划阶段 7（可选），避免一次铺太大。

---

## 11. 迁移阶段

每阶段独立可验证（`npm run typecheck` + `npm run test` + 浏览器冒烟），不破坏现有功能：

```
阶段0  实测双体系（SceneCommandBridge 是否共 SDK / 做显隐）
阶段1  新建 lib/scene-recipe/ 全套 + 测试            ← 不动现有代码
阶段2  SceneProvider 绑定 store+engine（默认不套预设，零行为变化）
阶段3  FloorDisplayPanel 迁移到 store（行为等价）
阶段4  模块预设接入（handleSelect 触发）
阶段5  AgentRunner 接观察层（focus/routes）
阶段6  scene-action-executor 退化为适配器
阶段7  （可选）双体系并归
```

---

## 12. 测试策略

延续本项目 `lib/` 纯函数 + 单测风格（现有 40 文件 / 358 用例）：

- `lib/scene-recipe/__tests__/`：
  - **`diff.test.ts`** — 集合相等（顺序无关）、结构/观察正交、相同 Recipe 产空 changeset、reachable 开关切换。
  - **`engine.test.ts`** — 用 mock `RecipeRuntime`（记录调用序列）断言：apply 顺序、focus 先于 viewpoint、结构层先于观察层、幂等（重复 patch 零调用）、best-effort（一调用失败不阻断其余）。
  - **`store.test.ts`** — `setStructural/patchStructural` 分层、subscribe 通知、默认值、观察层 patch 不触结构层 changeset。
  - **`presets.test.ts`** — 字段完整性 + 快照。
- mock `RecipeRuntime` 记录所有调用，零真实 SDK 依赖；目标覆盖率与现有 lib 一致（80%+）。
- React 绑定层（`SceneProvider`）暂不强制测（与"lib 优先"现状一致）。

---

## 13. 关联文档

| 文档 | 关系 |
|---|---|
| `doc/ref/ref.md` | 产品需求（五模块），本文档为其 3D 显隐部分提供技术架构 |
| `AGENTS.md` | SDK 能力边界与强制约束（本文档 §9.3 遵守） |
| `plan/2026-08-09-drill-simulation-design.md` | 演练推演设计，其 agent 决策经本 Recipe 观察层落地 |
| 记忆 `richness-tier-dropped` | 已否决路径（本文档 §1.3、§9.1 为其划界） |
| `PROJECT_OVERVIEW.md` | 项目总览，本文档细化其"3D 渲染优化"方向 |

---

**文档维护**：本架构随迁移阶段推进更新；阶段 0 实测结论出来后，回填 §10 的裁定结果。
