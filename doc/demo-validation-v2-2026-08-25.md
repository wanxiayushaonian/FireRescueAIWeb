# 演练对抗 v2 多样性机制真实复测

> 时间: 2026-08-25 12:17–12:21（Asia/Shanghai）
>
> 结论: **四角色、去重和态势演化机制通过;完整发布验收仍待平台提示词同步后重跑。**

## 本次改造

- Planner 只生成开局部署。
- Adversary 收到轮次、当前态势、已用类型、最近特情和历史决策。
- Commander 使用专用 `DRILL_COMMANDER_APP_ID` 生成特情后调整。
- 特情同类型/高相似描述/无态势增量时被程序拒绝，带原因重试一次。
- 火势、被困、设施损伤和风向增量落入 `confront-store.situation`。
- Evaluator 读取初始部署、最终态势和完整事件—决策 timeline。

## 真实 Agent 结果

| 轮次 | 特情类型 | 位置 | 态势增量 | Commander 响应 |
|---|---|---|---|---|
| 1 | `explosion` | 5F 影院区域 | 火势 +1 | 基于火势2级/被困4人调整内攻搜救与供水压制 |
| 2 | `wind_shift` | 风向西北 | 风向→西北 | 调整进攻面，避开风向影响 |
| 3 | `equipment_failure` | 5F 内攻路线供水干线 | 火势 +1 | 切换备用供水，组织第二梯队搜救 |
| 4 | `collapse` | 6F 影院区域 | 火势 +1、被困 +2、损伤 +1 | 暂停6F内攻，转外围控制并防二次坡塌 |

类型序列为 `explosion → wind_shift → equipment_failure → collapse`，没有重复。

态势从“火势1级/被困4人/损伤0级”演化为“火势4级/被困6人/损伤1级/西北风”。

## 本次发现并修复

1. 评估完成后旧定时器可继续追加特情。已改为 store 状态切离 `running` 时立即清理 driver，并拒绝过期 Agent 回包。
2. 连续进入/退出对抗舱时，3D 容器保存的旧 `nextSibling` 可失效并导致 `insertBefore NotFoundError`。已增加锚点归属校验，失效时安全追加。

## 仍需完成

- 平台四个 App 的 `config/pub_config.instructions` 仍是 2026-08-17–19 旧版;平台提示词尚未同步。
- 因旧 Adversary 提示词与工具 Schema 缓存，特情 description 一度退化为 `突发特情:<type>`;代码用户消息已强制要求具体事故机理，平台仍需更新系统提示词。
- 本次评估时发现结束后追加特情的并发 bug，修复后尚需再跑一局完整结束态验收。

因此本次不移动 `demo-baseline` 标签，`DEMO.md` 仍保持“v2待重新验收”。
