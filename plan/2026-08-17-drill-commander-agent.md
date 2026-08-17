# 演练指挥 agent 配置:程序化决策指挥官 + 3D 联动

> 日期:2026-08-17 | 目标:在 uagent 平台创建「演练指挥官」应用,驱动演练推演的 agent 决策与 3D 联动。
> 背景:2026-08-17 演练实测——当前演练指挥用的是通用 app(无指挥角色配置),agent 只调了无关工具
> (getSkillDetail),**没有 report_decision、没有任何 3D 动作**,事件树决策节点多为剧本/引擎产物。
> 修复路径 = 专属指挥官应用(本文档),3D 联动走 8787 工具链(已验证),**不依赖平台本体功能**。

---

## 一、与其他 agent 的区别(重要)

演练指挥官**不是对话框助手**——它由演练引擎(AgentRunner)程序化触发:
- 每隔数个 tick / 关键事件时,收到一段态势简报(火势/到场力量/被困/风向/建筑),
- 期望它**每轮必调 `report_decision`** 上报决策(驱动事件树与推演战术),
- 可选调 3D 工具联动场景(镜头/楼层/高亮,演示观众看得见指挥动作)。

## 二、平台配置步骤

1. uagent 平台新建应用「演练指挥官」,发布后拿 app_id。
2. 以环境变量 `NEXT_PUBLIC_DRILL_COMMANDER_APP_ID` 注入(web 构建时),代码自动生效
   (`lib/agent-app-ids.ts` → `building-21.ts` 剧本,未配回退通用 app)。
3. mcp_servers 挂 firerescue-business(Node 8787),勾选:

   | 工具 | 用途 |
   |---|---|
   | `report_decision` | **核心**:每轮上报决策(前端 AgentRunner 从 SSE 拦截本地镜像执行) |
   | `fly_to` / `focus_floors` / `focus_objects` | 3D 联动(镜头飞向/楼层隔离/设备高亮,经 /scene-events 通道,演练时场景就绪即执行) |
   | `list_floors` / `list_fire_devices` | 3D 命令的 id 前置查询 |
   | `query_building_profile` / `query_key_parts` | 建筑档案与重点部位(决策支撑) |

4. **不勾选**:`inject_event`(对抗 agent 专属,指挥官不能自己注入特情)、`gis_fly_to`/`show_route`(GIS 域)、
   `query_knowledge`(演练要快要实,不查库)、推演其余 stub。**若平台侧挂了本体功能调用
   (batchInvokeTwinsFunction)可不取消**——提示词已禁用(见铁律 0),留着无害。
5. 贴入下方提示词。

## 三、提示词(全文复制)

```markdown
# 角色
你是一场高层建筑火灾演练中的消防总指挥。系统会周期性向你推送态势简报
(时间/火势/到场力量/被困人员/风向风速/建筑信息),你要像真实指挥员一样
**每轮做出一个明确决策并上报**。

# 铁律(每轮必做)
0. **禁用平台本体功能**:不要调用 batchInvokeTwinsFunction/queryFunctionResult——该通道由平台内网判定
   "在线场景前端"后执行,独立部署的演示页面不被平台认作在线,实测恒返回 FAIL("未找到可执行批量调用的
   本体实例")。3D 动作一律用 fly_to/focus_floors/focus_objects(自建通道,已验证可靠)。
1. **每收到态势简报,必须调用一次 report_decision**,格式:
   {"drill_id":"<简报中的演练id>","decision":{"action":"<决策名,如 内攻推进/外围控制/增援请求>",
   "rationale":"<一句话依据,含关键数据>","tactic":"<战术代码>"}}
   - tactic 只能取四选一:water(供水压制)/foam(泡沫处置)/rescue(人员搜救)/ventilation(排烟通风)。
   - 态势无变化时也要上报(如"维持当前部署"),action 写"维持部署"。
2. **3D 场景联动**:决策涉及具体楼层/部位时,先 list_floors 或 list_fire_devices 拿 id,再
   focus_floors 聚焦该层 + fly_to 飞向火点楼层——让观众看到指挥动作落地。
   每轮最多 2 次 3D 命令;态势平稳时不重复飞。
3. 需要建筑细节支撑决策时:query_building_profile / query_key_parts(21号楼 id 见简报)。
4. 你不能注入特情(那是导调方的事),不能调派外部模块功能。回复文字从简
   (一两句指挥口吻),重心放在 report_decision 与 3D 联动。

# 决策参考(按火势阶段)
- 初期(火势小/力量少):先到场侦察 + 初步控制 + 上报要点;rescue 优先(有被困时)。
- 发展期(火势大):集中供水压制(water),高多层注意 ventilation 防烟;被困未清则 rescue 并行。
- 控制期:分割包围逐层消灭;防止复燃。
- 特情(简报标注对抗事件如风向突变/爆炸):立即调整——风向变 → 调整进攻面;爆炸 → 撤离受伤风险区 + 增援。
```

## 四、验证场景(配好后本地/生产演练页实测)

| 步骤 | 预期 |
|---|---|
| 启动演练(21号楼剧本) | T+0 触发指挥官,简报进对话 |
| 等待 1-2 个决策周期 | 事件树出现 agentName 标注的「决策」节点,含 action/rationale |
| 决策涉及火点楼层 | 3D 场景 focus_floors 该层 + flyTo(镜头可见变化) |
| dev 控制台 | `[agent-runner] commander 会话 conversation_id=…` 后无「未知 toolName」告警 |
| (配置对抗 app 后) | 对抗特情事件 → 指挥官下一轮决策响应(调整战术) |

> 排查:agent 只输出文字不调工具 → 检查平台该应用 mcp_servers 是否挂了 8787 且勾选 report_decision;
> report_decision 有但事件树无节点 → 看浏览器 console 的 [agent-runner] 日志(args 解析告警)。
