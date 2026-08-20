# 实战指挥·处置流程演示编排 — 设计文档

> 日期:2026-08-20 | 分支:当前 `feature/drill-confrontation`(待确认是否切新分支)
> 范围:实战指挥(`CommandView`)新增「一键新警情处置流程演示」——接警→出动→到场→控制→熄灭 的 GIS 动画 + 面板数据 + Toast 推送时序编排
> 原则:纯逻辑层可单测 / liveChannel 仍是状态权威 / 剧本只在 mock 演示掌舵 / 用户操作优先

---

## 一、背景与已确认决策

`CommandView` 现状已具备:警情状态机(`liveChannel`)、新警情接入、选中聚焦(fitBounds 1.5km 案域)、AI 多站派遣路线、车辆行进动画(RAF + ETA 压缩,与"到场"状态翻转对齐)、Toast、时间轴、推荐流。但这些能力**散落在 handleSelect / 多个 useEffect 里**,时序相互依赖却无统一编排,导致:
- 视角请求多处竞争(面板 fitBounds vs 桥 flyTo 拉回 z14)
- 无车辆跟随能力
- Toast/推荐推送节奏不可控,推荐为采样驱动(5-10s 随机抖动)时序不稳

用户诉求:一次「新警情接入」点击后,**一键全自动**演示完整处置流程,处理好"各种事件的处置动画与信息推送时序问题",且"到场后视角不要乱动"。

### 已确认决策

| # | 决策 | 内容 |
|---|---|---|
| 1 | 演示形态 | **一键全自动剧本**:点一次 → 接警→出动→到场→控制→熄灭 自动推进,仅车辆跟随等少数交互可打断 |
| 2 | 时间节奏 | **保持现状节奏**(1min 真实=6s 演示,车辆 ETA 压缩 20-50s,全场约 90-100s) |
| 3 | 视角仲裁 | **用户操作优先**:自动聚焦在用户拖图/点击后让位;点击车辆进入跟随;空白/Esc 退出 |
| 4 | 架构方案 | **A:编排器指挥状态机**(FlowDirector 在 mock 演示中经受控接口掌舵 liveChannel) |
| 5 | 数据源 | **mock 主线演示**(2026-08-20 裁定,不对接业务库);真实模式不受影响、演示按钮隐藏 |
| 6 | 文档落位 | `web/plan/2026-08-20-disposal-flow-demo-design.md` |

---

## 二、总体架构与模块划分

```
lib/command-flow/                    ← 新增纯逻辑层(全部可 vitest 单测,无 React/DOM 依赖)
├── stages.ts            StageMachine 阶段清单:状态→{视角意图, 推送, 退出条件}
├── script.ts            剧本构建器:一次新警情 → 相对时间轴动作序列(依据真实 ETA 生成)
├── flow-director.ts     FlowDirector 编排器:按时间轴执行动作,可取消
├── view-director.ts     ViewDirector 视角仲裁器:优先级仲裁 + 车辆跟随
└── vehicle-convoy.ts    VehicleConvoy 多车行进动画(自 CommandView L227-295 抽取)

src/hooks/
└── useDisposalFlow.ts                React 接线:FlowDirector ↔ liveChannel/gisMap/面板/Toast

src/components/command/
└── DisposalFlowBar.tsx               顶部演示控制条:一键演示 / 阶段徽标 / 跟随提示 / 中止

src/mock/liveChannel.ts              新增受控接口(仅 mock):forceStatus / pushScriptRec / setScripted
```

**核心架构决策**:`liveChannel` 仍是**唯一状态权威**(真实/手动模式照常自由推进);`FlowDirector` 只在 mock 演示剧本中通过新受控接口掌舵。剧本用 `forceStatus()` 精确控制状态翻转时机,绕开固定 dwell(接警20s/出动40s/到场60s/控制40s)。现有面板/时间轴/Toast 对 `{kind:'status'}` 事件的响应逻辑**零改动**复用。

**视角争夺收敛**:演示运行时,SceneCommandBridge 的自动 flyTo 消费被门控,全部改走 ViewDirector 仲裁。演示结束后恢复原行为。

---

## 三、阶段模型(StageMachine)

处置流程映射 5 阶段,与 liveChannel 状态机同名同步。StageMachine 是**声明式编排清单**——不掌权,只描述"每个阶段该展示什么":

```ts
// stages.ts
export type FlowStage = '接警' | '出动' | '到场' | '控制' | '熄灭';

interface StageManifest {
  stage: FlowStage;
  /** 本阶段视角意图(交给 ViewDirector 执行,含仲裁) */
  view?: ViewSpec;
  /** 进入本阶段时的有序推送(Toast/推荐/时间轴/面板开关) */
  pushes: PushSpec[];
  /** 退出条件:'statusFlip'(等状态机翻转) | {afterMs}(剧本驻留后进入下一段) */
  exit: 'statusFlip' | { afterMs: number };
}
```

### 各阶段 manifest

| 阶段 | 视角意图 | 推送 | 退出 |
|---|---|---|---|
| 接警 | `focusIncident`(fitBounds 1.5km 案域,padding 让开左右面板,maxZoom 15) | toast「110 联动接入」、开灾情变量面板、时间轴「110 报警接入」 | `{afterMs: ~1500}` |
| 出动 | `fitRoutes`(包住 案点+多站路线,看清整盘) | AI 派遣 toast、派遣推荐入列、路线绘制 | `statusFlip` |
| 到场 | `settle`(稳定在场,不再移动) | 全部车组到场 toast(可合并一条)、时间轴到场节点 | `statusFlip` |
| 控制 | `settle`(视角不动,除非用户操作) | 控制类决策**分批**推送(内攻/排烟/水源/力量部署)、火势已控制 toast | `statusFlip` |
| 熄灭 | `reset`(复位城市全景,仅当选中案且用户未操作) | 处置完毕 toast、时间轴「处置完毕」 | 结束 |

**"视角不要乱动"落点**:`到场/控制` 两阶段 manifest 视角意图为 `settle`(无自动视角命令),机械保证在 ViewDirector;manifest 只声明意图。

**阶段与状态机关系**:`exit:'statusFlip'` = 等 liveChannel 翻到下一状态,翻转时机由剧本用 `forceStatus` 控制。StageMachine 描述**表现**,FlowDirector 决定**时机**,分工清晰。

---

## 四、视角仲裁(ViewDirector)

所有视角请求统一走**优先级仲裁**,收敛散落各处的相机争夺。

```ts
// view-director.ts(纯逻辑,经 MapAdapter 作用于 Leaflet)
type ViewOwner = 'none' | 'auto-flow' | 'follow' | 'user';

class ViewDirector {
  requestFocus(spec: ViewSpec): void  // 剧本聚焦命令 → 若 user/follow 占用则丢弃(不排队打架)
  startFollow(target: { latLng, tick })  // 点击车辆 → 进入跟随
  stopFollow(): void                    // 到车/空白点击/Esc
  notifyUserInteract(): void            // map dragstart/zoomstart → 取消待执行 auto 命令
}
```

**仲裁优先级**:`user`(用户拖图/缩放) > `follow`(车辆跟随) > `auto-flow`(剧本聚焦) > `none`

四条规则:

1. **用户操作优先**:`dragstart`/`zoomstart`(Leaflet 仅真实用户拖动触发,程序化 move 不触发)→ `notifyUserInteract()`,取消待执行 auto 聚焦,让用户自由
2. **点击车辆进入跟随**:每 rAF 帧 `map.panTo(车位置, {animate:false})`(只动中心不动缩放,避免抖动);拖动地图或点空白/Esc 退出
3. **到车自动释放**:车辆到达 → `stopFollow()`,视角自然落定案域(`settle`),不再移动
4. **剧本聚焦仅在空闲时生效**:`requestFocus` 在 user/follow 占用时直接丢弃——不积压、不打断、不打架,即"视角不乱动"的机械保证

---

## 五、编排器(FlowDirector)

`FlowDirector` 为**一次**新警情持有一条剧本,在时间轴上调度动作、协调 convoy 与状态机,可干净取消。

```
run(script, { map, liveChannel, convoy, push })
  → 时钟推进(rAF,演示秒级)
  → 按 t 顺序触发:view聚焦 / toast / status(出动) / convoy(start) / pushRec / status(到场) / settle / ...
  → 每步经 ViewDirector 仲裁后才真正动地图
  → 状态翻转经 liveChannel.forceStatus → 现有面板/时间轴照常响应
cancel()  → 清时钟/raf、移除车标、释放视角、复位 UI(换案/切模块时调用)
```

**时序对齐关键点**:
- 剧本**在派遣路线返回后生成**——车辆行进时长 = `compressDuration(真实ETA)`,时间轴不是硬编码,而是依据真实路线动态构建
- 车辆到达时刻 == `forceStatus(到场)` 时刻(消掉"状态:到场"与"车组到场"双时间线错位,把现有已修 bug 变成导演必然属性)
- 车辆动画用抽出的 `VehicleConvoy`(迁移 CommandView L227-295 的 RAF 逻辑,测试一起搬走)

**单一活跃演示**:演示进行中再点"一键演示" → 先 `cancel()` 旧演出再起新演出,绝不并发两场。

---

## 六、liveChannel 受控接口(仅 mock)

`src/mock/liveChannel.ts` 新增三个剧本专用接口,真实模式全部禁用(防御性 no-op + warn):

```ts
/** 强制把某案状态翻到 next(校验合法迁移链),绕开 dwell 等待。仅 source==='mock'。 */
forceStatus(incidentId, next: IncidentStatus): void
/** 剧本按时刻推送推荐(复用 recommendations 存储 + 事件通知)。 */
pushScriptRec(rec: Recommendation): void
/** 演示期间暂停某案的自动 dwell 推进,避免状态机与剧本抢时间。 */
setScripted(id: string | null): void   // 置 null 恢复自由推进
```

`forceStatus` 复用现有 `{kind:'status'}` 事件协议 → CommandView 的 handleEvents、时间轴、Toast 逻辑零改动继续工作。

---

## 七、React 接线

```ts
// useDisposalFlow.ts —— 极薄接线层
const { startDemo, stopDemo, stage, followState, demoActive } = useDisposalFlow({ gisMap });

startDemo():
  1. injectIncident()                     // 新警情入列 + toast(现有)
  2. fetchAiDispatch(案点) → routes       // 现有;失败则降级(见八)
  3. buildScript(incident, routes)        // 依真实 ETA 生成时间轴
  4. director.run(script)                 // 开演
```

```tsx
// DisposalFlowBar.tsx —— 顶部控制条(模式切换条下方,z-30)
[ 一键新警情演示 ]  [ 阶段:接警▸出动▸到场▸控制▸熄灭 ]  [ 跟随中·点击车辆跟随 · 空白/Esc退出 ]  [ 中止 ]
```

- 未运行:主按钮 + 阶段灰显
- 运行中:主按钮禁用、阶段徽标随剧本点亮、跟随提示出现、中止可用
- 结束:自动收起,阶段徽标归位
- 真实模式:演示按钮隐藏(mock 演示主线)

---

## 八、数据流与错误处理

```
点[一键演示] → useDisposalFlow.startDemo()
  ├ injectIncident() → 警情入列 + toast「110联动接入」
  ├ fetchAiDispatch → routes/ETA
  │   └ 失败(网络/无站): toast「路线获取失败,仅视角演示」
  │     → 跳过车辆动画,直接推 到场/控制 剧本(演示不中断)
  ├ buildScript → 时间轴(聚焦→派遣→convoy→到场→控制→熄灭→复位)
  ├ director.run → ViewDirector仲裁 → Leaflet 实动
  │              → forceStatus → liveChannel → 面板/时间轴/Toast 照常响应
```

| 异常场景 | 处理 |
|---|---|
| 路线获取失败 | 降级演示:toast 提示 + 跳过 convoy,其余照常 |
| 地图未就绪 | startDemo 等 `onMapReady`;未就绪时按钮禁用 |
| 演示中再点 | 先 `cancel()` 旧演出,再起新演出 |
| 切模块/卸载 | `useEffect` cleanup → `director.cancel()`(沿用现有 timersRef 模式) |
| forceStatus 非法迁移 | 脚本保证只走合法链;liveChannel 侧防御性 no-op + warn |
| 真实模式误点演示 | 演示按钮在 real 模式隐藏 |

---

## 九、测试策略(纯逻辑层全覆盖)

| 测试文件 | 覆盖 |
|---|---|
| `stages.test.ts` | 剧本构建:给定 mock routes/ETA,断言时间轴顺序与各阶段 manifest 完整性 |
| `script.test.ts` | 依据真实 ETA 生成相对时间轴的数学正确性 |
| `view-director.test.ts` | 仲裁矩阵:用户操作中 auto-focus 被丢弃 / 跟随中拖图退出 / 到车释放 / 优先级 |
| `vehicle-convoy.test.ts` | 迁移现有 RAF 逻辑,注入假时钟验证推进/到达/取消 |
| `flow-director.test.ts` | 注入假时钟跑完整剧本,断言事件序列与 cancel 清理 |
| `liveChannel` 扩展 | forceStatus 合法/非法迁移、setScripted 暂停自动推进、pushScriptRec 入列 |

React 层(useDisposalFlow / DisposalFlowBar)组件级验证或人工演示,沿用"lib 单测为主"惯例。

---

## 十、实施顺序建议

1. `stages.ts` + `script.ts`(纯逻辑,先行,可单测)
2. `liveChannel.ts` 受控接口(forceStatus/pushScriptRec/setScripted + 单测)
3. `view-director.ts` + `vehicle-convoy.ts`(纯逻辑 + 单测)
4. `flow-director.ts`(编排器 + 假时钟单测)
5. `useDisposalFlow.ts` + `DisposalFlowBar.tsx`(React 接线 + 组件验证)
6. 桥 flyTo 门控 + 演示按钮入口
7. `tsc` / `vitest` 全绿 + 人工演示验证
