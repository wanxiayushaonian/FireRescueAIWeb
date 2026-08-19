# 演练对抗·对抗舱 — 设计文档

> 日期:2026-08-19 | 分支:待建(`feature/drill-confrontation`)
> 范围:演练对抗模块对抗舱重构——照抄原型 `消防救援前端原型/app/src/components/drill/ConfrontationPanel.tsx`,接真实 agent,弃 tick 推演
> 原则:UI 照抄 / 数据层替换 / agent 接真 / 只做对抗舱

---

## 一、背景与决策

当前 web 的演练对抗(`DrillView` + `src/drill/` + `lib/drill/`)是 **AI 自动推演**形态:多 agent 按 tick 自动决策、事件树生长、人只是观众。用户对形态不满意。

原型 `消防救援前端原型/app/src/components/drill/ConfrontationPanel.tsx` 是 **人机对抗**形态:对抗智能体出招 → 指挥员(人)点「采纳调整/人工改派」响应 → 评估归档。用户确认「这就是想要的」。

### 已确认决策

| # | 决策 | 内容 |
|---|---|---|
| 1 | 交互形态 | **人机对抗**(对抗 agent 出招,真人指挥员响应) |
| 2 | 引擎 | **弃 tick 用秒**(秒级真实时钟 + 事件流;DisasterState 不参与对抗演化) |
| 3 | 范围 | **只做对抗舱**(熟悉考核/实战指挥/旧推演暂不动) |
| 4 | agent 接线 | **新增预案输出 agent**(分工对齐原型三智能体:预案输出/对抗/评估) |
| 5 | 旧引擎 | **移除引用,文件保留**(DrillView 不再用 DisasterState/Timeline/EventBus/Recorder,但文件不删,防影响其他模块) |

---

## 二、原型形态还原(对抗舱要长成的样子)

```
┌─────────────────────── 全屏对抗舱 (Portal 覆盖) ───────────────────────┐
│ 返回演练设置 │ 演练对抗·对抗模式 │ [对抗中/已结束/待机]                    │
├───────────────┬──────────────────────────────┬───────────────────────────┤
│ 左栏 280px    │ 中央                         │ 右栏 300px                │
│ • 对抗态势卡   │ • 灾情摘要条(建筑/楼层/趋势)   │ • 对抗过程时间轴           │
│   (随机灾情    │ • 3D 缩略区(web 接真实场景)   │   (TimelineNode 可点跳转)  │
│    生成/重随机)│ • 特情-调整卡对流(新卡在上)    │ • 评估卡                   │
│ • 对抗智能体卡 │   ⚠ 突发特情#N (橙色)         │   (ScoreRing 环形分数)     │
│   (思考中发光) │   ↳ 部署调整卡(青色,带       │   结论/comments/outcomes   │
│ • 结束对抗并   │     「采纳调整/人工改派」按钮) │   已归档章                 │
│   评估         │                              │                           │
└───────────────┴──────────────────────────────┴───────────────────────────┘
```

核心交互流(照抄原型 `drillStore.ts` 对抗扩展):
1. 进入对抗 → 抽取灾情 → 展示初步部署(预案输出智能体)
2. 对抗智能体按 15-25s 节奏注入特情(thinking 骨架 → 特情卡橙色)
3. 特情后 2.5s 预案输出智能体给动态调整(调整卡青色)
4. **指挥员点「采纳调整」/「人工改派」**(记录响应用时)
5. 结束 → 评估智能体打分 → 归档进预案库(≥85 已归档)

---

## 三、目标架构

### 3.1 目录结构

```
web/src/drill/confrontation/
├── ConfrontationPanel.tsx    # 全屏对抗舱(照抄原型三栏布局 + Portal)
├── confrontation-uis.tsx     # ShuffleText / Dots / ScoreRing / TimelineNode 等小组件(照抄)
├── confront-store.ts         # ConfrontationState 数据层(照抄原型契约,注入 adapter)
├── confront-adapter.ts       # ★ agent 接入层(新写,核心逻辑)
└── __tests__/
    └── confront-adapter.test.ts   # adapter 纯逻辑单测
```

`DrillView.tsx`:保留外壳(场景/模块挂载),新增「进入对抗模式」入口 → 挂载 ConfrontationPanel 全屏覆盖。移除 tick 编排 effect 与引擎引用。

### 3.2 数据模型(照抄原型契约)

`ConfrontationState` 原样保留(原型 `drillStore.ts` 对抗扩展):

```ts
interface ConfrontationState {
  active: boolean;
  status: 'idle' | 'running' | 'finished';
  seedLoading: boolean;          // 灾情抽取骨架
  seedError: string | null;
  thinking: boolean;             // 对抗智能体「正在研判…」
  seedScenario: {
    building: string; floor: string; material: string; trapped: number; seed: string;
  } | null;
  events: ConfrontationEvent[];  // inject/adjust/manual/evaluate
  review: ConfrontationReview | null;
  evaluating: boolean;
  generation: number;
  startedAt: number;             // 秒级计时起点
  plannedTotal: number;          // 本局计划特情数(3-5)
  lastRound: { score: number; archived: boolean } | null;
}
```

`ConfrontationEvent`:`{ id, seq, kind: 'inject'|'adjust'|'manual'|'evaluate', emergency, adjustments?, adopted?, respondedWithinSec?, tSec }`
`ConfrontationReview`:`{ score, conclusion, comments, outcomes: ['timely'|'delayed'|'ignored'], archived }`

**弃 tick 的体现**:时间用 `Date.now()` 秒级(`startedAt`/`tSec`),无 `clock`/`DisasterState` 参与对抗演化。

### 3.3 三智能体接线(★ 核心)

| 原型身份 | 原型 mock | 替换为 web 真实 | app_id 来源 |
|---|---|---|---|
| 预案输出智能体(初步部署+调整) | 预置文案 | **新增预案输出 agent**(新平台应用) | `NEXT_PUBLIC_DRILL_PLANNER_APP_ID`,未配回退 `DRILL_COMMANDER_APP_ID` |
| 对抗智能体(注入特情) | 特情池随机 | **对抗 agent**(已有注入链路) | `NEXT_PUBLIC_ADVERSARY_APP_ID` |
| 评估(结束打分) | 规则公式 | **评估 agent** | `NEXT_PUBLIC_EVALUATE_APP_ID`,未配降级 mock |

`confront-adapter.ts` 职责(纯逻辑,可单测):
- `startConfrontation()`:触发预案输出 agent 生成初步部署 → seedScenario + 部署卡
- `scheduleNextInject()`:15-25s 后触发对抗 agent → 流式收 SSE → 解析 `inject_event` → 特情卡 + `addSceneAction`
- `triggerAdjustment()`:特情后 2.5s 触发预案输出 agent → 解析 `report_decision` → 调整卡
- `finishConfrontation()`:调 `evaluateViaAgent`(复用 `lib/agent-evaluate.ts`)→ 评估卡 + 归档 `addLibraryItem`
- 复用 `postAgentChat` / `parseAgentChatSSE`(`lib/agent-chat-client.ts`);契约解析集中一处

**契约对齐(前置)**:动手前抓一次真实 agent 返回的 `inject_event`/`report_decision` 结构,把 adapter 解析对齐真实字段。这是旧推演「特情空壳、决策无效果」的根因,新舱不能再犯。

### 3.4 3D 联动

原型 3D 区是占位缩略图。web 侧:
- 中央 3D 缩略区 **接真实场景**(背景常驻的 RealSceneView 已是真实 3D),对抗舱全屏时保留真实 3D 作背景
- 特情注入 → `addSceneAction` → 现有 `scene-action-executor` → SoonspaceRuntime 飞向/高亮特情位置
- 复用已有能力,不新造

### 3.5 与旧引擎的关系

- `DrillView.tsx` **移除** `DisasterState`/`TimelineEngine`/`EventBus`/`DrillRecorder` 的引用与 tick effect
- 文件(`lib/drill/*`、`src/drill/hooks/*`)**保留**,不动——防影响熟悉考核/实战指挥等潜在引用
- 若后续确认无引用,再走 `refactor-clean` 清理

---

## 四、错误处理与降级

| 场景 | 处理 |
|---|---|
| agent 请求失败 | seedError 态显示重试按钮(照抄原型);adapter 内 try/catch + logger.warn 不崩 UI |
| 评估 agent 未配/失败 | `evaluateViaAgent` 已内置 null → 降级 mock(复用) |
| 对抗 agent 未配 app_id | `NEXT_PUBLIC_ADVERSARY_APP_ID` 空 → 本轮不注入特情(adapter no-op) |
| 特情契约解析失败 | 告警 + 该特情不入事件流(不产生空壳节点) |

---

## 五、测试策略

- `confront-adapter.test.ts`:注入 fake `postChat`,断言 `inject_event`/`report_decision` 解析 → 特情卡/调整卡数据结构;失败路径
- 现有 `agent-chat-client` / `agent-evaluate` 测试保持绿
- UI 组件测试推迟(项目无 RTL 惯例);纯逻辑由 adapter 单测覆盖
- 验收:`tsc --noEmit` 全绿 + `vitest` 通过 + 手动跑一局对抗(真 agent)

---

## 六、实施顺序

1. **Task 0 契约实测**:抓真实 `inject_event`/`report_decision` 结构(对照 `plan/drill-agent-chat-sse-format.md`)
2. **Task 1 数据层**:`confront-store.ts` + 类型(照抄契约)
3. **Task 2 adapter**:`confront-adapter.ts` + 单测(注入 fake postChat)
4. **Task 3 UI 照抄**:`ConfrontationPanel.tsx` + `confrontation-uis.tsx`(三栏 + 动画 + Portal)
5. **Task 4 集成**:`DrillView` 挂载入口 + 移除旧引擎引用 + 3D 联动接线
6. **Task 5 评估归档**:`evaluateViaAgent` 接线 + `addLibraryItem` 归档
7. **Task 6 验证**:tsc / vitest / 真 agent 一局

---

## 七、风险

| # | 风险 | 应对 |
|---|---|---|
| 1 | 契约不齐导致特情空壳重现 | Task 0 前置实测;adapter 解析失败不入流 |
| 2 | 新增预案输出 agent 需平台建应用 | 未配回退 `DRILL_COMMANDER_APP_ID`,不阻塞 |
| 3 | 弃 tick 影响其他模块引用 | 只移除 DrillView 引用,文件保留 |
| 4 | 15-25s 节奏在真 agent(30-100s 响应)下体验差异 | thinking 骨架兜底;必要时调长间隔 |
