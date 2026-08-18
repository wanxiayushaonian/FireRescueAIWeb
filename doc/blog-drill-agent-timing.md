# 让慢 agent 驱动快推演:演练系统中多智能体时序的设计

> 当一个大模型 agent 的响应需要 30~100 秒,而你的推演引擎每秒都在前进,
> 你怎么保证"指挥官的决策"和"导调的特情"在正确的时间落到正确的位置?
> 本文记录我们在消防演练对抗系统中给出的答案:**把异步的 agent 世界,
> 裁剪成确定性事件流**。

## 问题:两个时钟,两个世界

我们的演练对抗模块里有这样几个角色:

- **推演引擎**:确定性状态机。按 tick 前进,每个 tick 消费一批事件
  (灾情/力量到场/战术决策/特情),推进火势、力量、被困、建筑损伤四维态势。
  相同想定 + 相同事件序列,必然得到相同演化。
- **指挥官 agent**:大模型。周期性收到态势简报,输出战术决策
  (report_decision:出水压制/泡沫/搜救/排烟)。
- **导调(对抗)agent**:大模型。每 5 tick 被触发一次,给指挥官"加戏"
  (inject_event:风向突变/爆炸/二次被困)。

矛盾显而易见:**引擎以秒计,agent 以分钟计**。一次 agent POST 走 SSE 流式
返回要 30~100 秒,期间引擎可能已经走过十几个 tick。如果处理不好,会出现:

- 决策"回填"——第 3 tick 该下的命令,第 8 tick 才到,把历史改写;
- 请求堆积——每 5 tick 触发一次对抗,上一个还没回来就触发下一个,队列爆炸;
- 顺序颠倒——同一 agent 的两个请求并发在途,后发的先回来;
- 引擎卡顿——最蠢的方案:等 agent。推演节奏完全被网络延迟绑架。

我们的答案是四条机制。核心思想一句话:**异步的 agent 世界在外面,
确定性的 tick 世界在里面,交界处做裁剪**。

## 机制一:引擎永不等待

tick 循环里,所有 agent 触发都是 fire-and-forget:

```ts
// DrillView.tsx —— 启动指挥官,不 await
void runner.triggerCommander(effectiveBriefing);

// agent-runner.ts —— 每 tick 检查对抗触发,同样不 await
void this.triggerAdversary().finally(() => {
  this.adversaryInFlight = false;
});
```

时间轴绝不停下来等任何一个 agent。推演节奏只由引擎自己的时钟决定,
网络抖动、模型变慢、平台超时,统统不影响世界的运转。

这是所有时序保证的**前提**:世界的演进不依赖任何不确定的外部输入。

## 机制二:角色内串行队列

同一个 agent 的多次触发,排进一条 promise 链:

```ts
triggerCommander(triggerText: string, causeEventId?: string): Promise<void> {
  const run = this.commanderChain.then(() =>
    this.runAgent(this.options.commanderAppId, triggerText, 'commander', causeEventId),
  );
  // 吞错防断链:一次失败不影响后续触发
  this.commanderChain = run.catch(() => {});
  return run;
}
```

指挥官一条链(`commanderChain`),导调一条链(`adversaryChain`)。
**同一 agent 的在途请求永远只有一个**,它的决策严格按触发顺序依次返回——
后发不可能先至。链尾挂 `.catch`,单次失败只损失这一次决策,不会毒化队列。

注意队列是**按角色**而不是按全局建的:指挥官和导调是两条独立的链。
为什么不做全局串行?因为他们的语义本来就是并行的——真实演练里,
指挥员下达决策和导调台注入特情互不等待。

## 机制三:互斥跳过——宁可少一次,不让队列爆炸

串行队列解决了顺序,但解决不了**堆积**。导调 agent 每 5 tick 触发一次,
一次调用 30~100 秒;如果 5 tick 只要 25 秒,触发速度就是消费速度的两倍,
队列只会越来越长——而且队列里的特情回来得越晚,越"时过境迁":
第 10 tick 触发的"爆炸"特情,第 40 tick 才回来,那时火都灭了。

对这种"生产快于消费"的触发源,排队反而是错的。我们的做法是互斥跳过:

```ts
onTick(clock: number): void {
  if (clock <= 0) return;
  const n = this.options.adversaryEveryNTicks ?? 0;
  if (n <= 0 || clock % n !== 0) return;
  // 上一个对抗调用还没回来?本次触发直接丢弃
  if (this.adversaryInFlight) return;
  this.adversaryInFlight = true;
  void this.triggerAdversary().finally(() => {
    this.adversaryInFlight = false;
  });
}
```

**跳过的代价是一次特情缺席,堆积的代价是整个演练节奏失真。**
两害相权,选缺席。

为什么指挥官不用互斥而用排队?因为指挥官的每次触发都携带**那一刻的
完整态势快照**,旧简报没有保留价值天然不成立——决策不能丢,只能排。
(况且指挥官周期触发是我们正在补的能力,触发频率远低于导调。)

## 机制四:到达时间戳——决策何时回来,何时生效

这是最关键的一条。agent 的 tool_call 经 SSE 流回来时,处理函数**现场
重读当前时钟**,而不是去查"这个请求是第几 tick 发出的":

```ts
private handleEvent(ev: AgentChatEvent, role: AgentRole, causeEventId?: string): void {
  const clock = this.options.state.getStatus().clock;  // 现在的 tick
  // ...
  this.options.bus.inject({
    id: genEventId('dec'),
    ts: clock,          // 落在"到达时",不是"触发时"
    type: 'decision',
    payload,
    cause: causeEventId,
  });
}
```

第 3 tick 触发的简报,第 8 tick 才等回"出水压制"——这个决策落在第 8 tick。
**历史不可改写,决策从生效那刻起影响未来。**

初看这是妥协,再看是拟真:真实指挥本来就有延迟。指挥员看到态势、思考、
下令,命令从下达的那一刻起改变世界,而不是回溯到他看到态势的那一刻。
LLM 的 30~100 秒延迟,恰好成了"指挥延迟"的天然模拟。

而因果关系不走时间戳走另一条通道:`causeEventId` 同时挂到事件树节点的
`parentId` 和事件的 `cause` 字段。事件树上"哪条决策由哪起特情引发"
清晰可见,**展示层的因果和时间轴的先后从此解耦**。

## 交界处之后:确定性收口

事件一旦进入 EventBus,世界就回到确定性:Bus 按 ts 存取,tick 编排每个
clock 做一轮同步的"取事件 → 推进状态 → 记录事件树 → 刷新面板",
`lastTickRef` 防止暂停恢复后同一 tick 被重复消费;DisasterState 是纯
函数式状态机,相同输入必然相同输出,495 个测试兜底。

整条链路可以这样画:

```
        异步世界(不确定)              │        确定性世界
─────────────────────────────────────┼──────────────────────────────
 指挥官 agent ──POST 30~100s──┐      │
                              ├─串行队列(角色内有序)
 导调 agent ────POST 30~100s──┘      │
        ▲ 互斥跳过(防堆积)           │
        │ 每 5 tick 触发              │
─────────────────────────────────────┼──────────────────────────────
        交界:tool_call 到达 → 现场重读 clock → ts=到达时 注入 EventBus
─────────────────────────────────────┼──────────────────────────────
                              │      │  EventBus(按 ts 有序)
                              │      │  tick 编排:取事件→推进→记录
                              │      │  DisasterState(确定性状态机)
                              │      │  事件树(cause 因果链展示)
```

## 我们接受的两个代价

设计没有银弹,这套机制有两个已知的、经过权衡的"乱":

1. **角色之间不互斥**。指挥官和导调的在途调用可以并发,谁先到谁先生效。
   语义上无害(事件都是原子注入当前 tick),拟真上反而正确——但如果你想
   做"导调必须等本轮指挥决策落地后再加戏"的强编排行,需要额外加屏障。
2. **失败静默**。agent 调用失败只写日志,UI 无感知。时序不会乱,但
   "没发生"和"失败了"在界面上分不出来。这是我们留着的一个 TODO:
   把 agent 触发的成功/失败也作为事件注入总线,让操作员看得见。

## 结语

大模型 agent 天然是慢、异步、不可靠的;仿真推演天然要求快、有序、确定。
把它们缝在一起,不要指望 agent 变快,也不要让引擎变钝——

**在交界处做裁剪:队列保证有序,互斥保证不积,到达时间戳保证历史不被改写,
然后让确定性在边界内侧收口。**

这套模式不只适用于消防演练。任何"LLM agent 驱动仿真/游戏/工作流引擎"
的系统,都会面对同样的两个时钟。希望我们的答案对你有用。

---

*代码位置:`web/lib/drill/agent-runner.ts`(队列/互斥/时间戳)、
`web/src/views/DrillView.tsx`(tick 编排)、`web/lib/drill/disaster-state.ts`(确定性状态机)。*
