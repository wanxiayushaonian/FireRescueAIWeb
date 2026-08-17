# 决赛演示走查清单(2026-08-17 基线)

> 用途:决赛演示前逐条走查,标注每项依赖(是否需要平台 app/环境变量),防止演示翻车。
> 状态图例:✅ 已验证可演示 | 🔶 待 app(平台建后即可) | ⚠️ 有风险点。

## 环境基线

- 生产:http://111.75.149.221:3000 (web/bff/mcp :8787/znya backend :9100/8788)
- 本地 dev:localhost:3000(验证/排练用)
- 两仓库均已推送 GitHub,生产 git 与 origin 同步

## 模块走查

### 1. 态势总揽(地图 + AI 研判)✅
- [ ] 底图/图层/水源/队站/重点单位渲染
- [ ] 多站派遣路线(DeployPanel → 路线渲染 + ETA)
- [ ] 作战要素四卡片(周边水源/设施完好/物质理化/被困位置)
- [ ] **AI 风险研判**:对话「九江学院附近发生火灾,周边什么情况?」
      → agent 调 geocode/analyze_response + `gis_fly_to`(带 layer)→ 地图飞 + 脉冲标记 + 图层自动开
- [ ] **AI 确认执行**:agent 调 get_scene_command_status 说"已定位"
- 依赖:overview app 已配(提示词+工具);**提示词需重贴一次**(layer 纪律 2026-08-17 更新)

### 2. 对象总览(3D 建筑 + 作战参谋)🔶
- [ ] 场景加载/楼层聚焦(档案卡片)/hover 拾取/搜索/书签
- [ ] 场内导航(导航至此/两点导航/车辆巡线)
- [ ] 场景包内容面板/显隐模态
- [ ] **AI 作战参谋**:对话「这栋楼怎么打?」→ 档案 + focus_floors + focus_objects + fly_to(ack 确认)
- 依赖:**🔶 建「对象总览·作战参谋」app**(plan/2026-08-17-objects-agent.md)
       → `NEXT_PUBLIC_OBJECTS_APP_ID` 注入 + 重建 bff

### 3. 熟悉考核(六熟悉 + 教练)🔶
- [ ] 六熟悉 AI 引导步进(声明式联动:楼层聚焦/飞向/设备高亮)
- [ ] 「问智能体」按钮 → 面板自动展开 + 引导请求发出 ✅(代码已通,agent 回复质量待 app)
- [ ] 岗位考核 + 薄弱画像注入(上下文 B 方案)
- [ ] **AI 教练**:「帮我练练」→ 引用上下文薄弱点位出题
- 依赖:**🔶 建「熟悉考核·教练」app**(plan/2026-08-17-training-agent.md,含六熟悉引导段)
       → `NEXT_PUBLIC_TRAINING_APP_ID` 注入

### 4. 实战指挥(GIS + 调派)🔶
- [ ] 实时警情/灾情变量/推荐流(演示数据)
- [ ] 预案库(归档库/正式预案双页签)/战后评估(mock 兜底)
- [ ] **AI 调派方案**:plan_dispatch(8788)+ show_route 渲染
- 依赖:🔶 command 业务 app(提示词骨架已有,未成稿);评估 app 可后置(mock 兜底能演示)

### 5. 演练对抗(决策 + 3D)✅/🔶
- [ ] 启动剧本 → 推演引擎运行(T+ 时钟/火势/到场力量)
- [ ] **AI 指挥官**:每轮 report_decision → 事件树决策节点(带 rationale)✅(已实测)
- [ ] **AI 3D 联动**:focus_floors + fly_to(ack 确认)✅(通道已通,是否触发取决于 agent 决策)
- [ ] 预案评估(PlanOutputPanel.handleEvaluate,agent 优先 mock 兜底)
- [ ] **对抗特情**:🔶 建对抗 app → `NEXT_PUBLIC_ADVERSARY_APP_ID`(注入后每 5 tick 特情)
- 依赖:指挥官 app 已配(2089348733554843649);对抗 app 待建

### 6. 全局助手(双 tab)🔶
- [ ] AgentSidebar 出现「全局助手」tab(五模块共享)
- 依赖:🔶 建全局助手 app → `NEXT_PUBLIC_GLOBAL_AGENT_APP_ID`

## 平台侧待建清单(一次建齐,按序)

| # | app | 提示词文档 | 环境变量 |
|---|---|---|---|
| 1 | 熟悉考核·教练 | plan/2026-08-17-training-agent.md | NEXT_PUBLIC_TRAINING_APP_ID |
| 2 | 对象总览·作战参谋 | plan/2026-08-17-objects-agent.md | NEXT_PUBLIC_OBJECTS_APP_ID |
| 3 | 对抗 agent | plan/2026-08-17-drill-commander-agent.md(特情注入说明) | NEXT_PUBLIC_ADVERSARY_APP_ID |
| 4 | 全局助手 | (全局只读 query_knowledge) | NEXT_PUBLIC_GLOBAL_AGENT_APP_ID |
| 5 | 评估 agent | (评估只输出 JSON) | NEXT_PUBLIC_EVALUATE_APP_ID |

> 注入后需重建 bff(`cd deploy && docker compose build bff && docker compose rm -f bff && docker rm -f deploy-bff-1 && docker compose up -d bff`)。

## 演示风险点(已知)

1. **概述 app 提示词需重贴**:layer 纪律(2026-08-17 更新)未上平台前 agent 可能不带 layer,脉冲标记仍有兜底但图层不自动开。
2. **演练 3D 联动触发不确定**:指挥官决策是否调 focus_floors 取决于 LLM 判断,演示前建议台词引导("聚焦火点楼层")。
3. **本体功能勿勾给 agent**(平台内网执行 FAIL,提示词已禁)。
4. **评估/教练 app 未配时走 mock**:演示可降级,但"真评估"需 app。
5. 生产 rebuild 后首屏加载约 10-20s(Next 冷启动),演示前预热页面。
