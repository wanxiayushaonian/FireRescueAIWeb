# 演练对抗 v2 黄金演示链三连验收（含 BUG-A 修复回归）

> 时间: 2026-08-25 19:10–20:40（Asia/Shanghai）｜ 环境: **生产**（http://111.75.149.221:3000）
> 验收人: 浏览器自动化（真实 GUI 操作，生产真实四角色 agent）
> 结论: **修复后三连通过，`demo-baseline` 标签移动至本记录提交**

## 1. 过程摘要

验收第一局（在旧构建上）发现阻断级缺陷 **BUG-A：双通道重复入库**——同一 tool-call 沿
adapter（聊天流解析）与场景总线（MCP 命令）各入库一次，调整事件双倍落库：
时间轴每条调整出现两次；评估「各特情应对结果」按 adjust 计行，4 条特情评出 9 行幻影
（见 `assets/demo-validation-2026-08-25/t0-bugA-phantom-9-rows.png`）；Planner 初始部署
上报以 seq=1 与首轮调整撞配对，特情#1 卡片误显示部署原文；且总线通道的第二份特情被
质量门误拒，给对抗 agent 回与事实不符的 error ack。

修复（`fa8926f`）：store 30s 窗口内容去重（adapter 两行/总线合并行收敛同 key）；
handler 幂等短路（同内容已在库直接 ok）；outcomes 改为按特情配对（行数恒等于特情数）；
Planner 初始部署上报 seq=0 并标注「初始部署上报」。新增 10 个测试（主项目 437→447）。

## 2. 三连验收结果（修复后构建，逐局记录）

| 局 | 特情(类型全不同,均有态势增量) | 时间轴 | 人响应 | 评估 | 结果 |
|---|---|---|---|---|---|
| 1 | 5 条：smoke_spread(火势+1) / wind_shift(火势+1,损伤+1) / 等 3 条 | 无重复调整；特情↔调整配对正确 | #1 采纳、#2 人工改派 | REAL 72 分；5 行结果=5 特情；七维+证据链(t=74/116/148…) | ✅ |
| 2 | 3 条(互不相同) | 无重复 | #1 采纳、#2 改派 | REAL；3 行 | ✅ |
| 3 | 3 条(互不相同) | 无重复 | #1 采纳、#2 改派 | REAL；3 行 | ✅ |

三局连续运行，中途无页面刷新、无场景卡死、无需修改数据。3D 楼层聚焦随特情命中
（5F-13F 楼梯间/4F 东侧办公区等）。态势演化正确（火势 1→2→3 级、被困 5→7、风向西北）。

态势总览风险研判（第 1 局前）：agent 依次调 resolve_operational_context→geocode_address
→gis_fly_to(layer=water, cmd_id 回执)→query_water_sources(500m 内 29 栓+1 天然水源)
→query_units→analyze_response，地图精确飞抵乐盈广场 21 号楼并自动开水源图层+脉冲标记
（`assets/demo-validation-2026-08-25/t1-overview-agent-gis-flyto.png`）。

## 3. DEMO.md §5 硬性标准逐项

| 标准 | 结果 |
|---|---|
| 同一案例 3 连完整运行 | ✅ |
| ≥2 特情且每条有调整/明确失败态 | ✅ |
| 特情类型不重复、非轻微改写、有态势增量 | ✅(程序去重+增量校验生效) |
| 四角色各司其职(Planner/Adversary/Commander/Evaluator) | ✅ |
| Evaluator 收到初始部署+最终态势+完整 timeline | ✅(评估意见引用具体 tSec/adopted 状态) |
| 场景动作有 cmd_id/最终回执 | ✅(机制在,agent 可 get_scene_command_status) |
| 3D 特情联动命中楼层 | ✅ |
| 评估区分 REAL/FALLBACK | ✅(REAL EVALUATOR 徽标) |
| 失败可见不静默 | ✅(知识库 500 被 agent 如实写入"数据依据") |
| `npm run verify` 通过 | ✅(CI quality-gate 绿;主 447 + MCP 97) |

## 4. 遗留问题（不阻断验收，按优先级记录）

1. **query_knowledge 生产 500**：znya 检索服务 embedding 连接失败
   （`httpcore.ConnectError: All connection attempts failed`，knowledge.py retrieve）。
   agent 已优雅降级并显式声明。→ 查生产 embedding 端点配置。
2. **预案文本与档案口径冲突**：预案安全提示写"建筑高度258米"(plan_safety_tips 原文)，
   档案=150m（用户 08-25 裁定以 150m 为准）。agent 引用预案时会说 258 米。
   → 需用户裁定是否清洗预案文本（生产库内容）。
3. **对抗评估正式归档仍是 P2**：评估与改进措施已写入浏览器持久化预案库，
   DrillSession 服务端快照也包含 review，可在刷新/离线查询时恢复；正式 znya 评估档案与报告附件仍待后端模型支持。
4. **1280×720 预案库入口遮挡已修复**：入口提高层级，面板改为安全高度和底部锚定，仍需现场投影回归。
5. **演练结束 3D 复位已修复**：评估完成和返回演练设置都会恢复全楼 3D 视角，仍需生产回归确认 SDK 状态同步。
6. **特情类型-描述一致性已加门禁**：`evaluateSpecialQuality` 现在拒绝声明类型和描述
   语义冲突的事件，并返回可见拒绝原因；仍需在生产三连回归中确认 Agent 能正确重试。

## 5. 证据

- `assets/demo-validation-2026-08-25/t0-confrontation-cabin-buggy.png`(修复前:调整重复)
- `assets/demo-validation-2026-08-25/t0-bugA-phantom-9-rows.png`(修复前:9 行幻影特情)
- `assets/demo-validation-2026-08-25/r1-evaluation-5-rows.png`(修复后:5 特情=5 行)
- `assets/demo-validation-2026-08-25/t1-overview-agent-gis-flyto.png`(态势研判 GIS 联动)
