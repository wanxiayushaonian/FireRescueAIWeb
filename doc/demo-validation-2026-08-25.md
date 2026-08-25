# 21 号楼黄金演示链验收记录

> 时间: 2026-08-25 11:45–11:56（Asia/Shanghai）
>
> 验收对象: `DEMO.md` v1
>
> 结论: **连续 3 轮通过，可标记为 `demo-baseline`**

## 验收环境

| 组件 | 环境 | 结果 |
|---|---|---|
| Web/BFF | 本地 Next.js 16.2.10，`:3000` | 通过 |
| 3D/uStudio | 赛事平台真实 21D 完整包 | 加载 100% |
| znya | 本地 FastAPI + PostgreSQL/Redis，`:9100` | `/health` healthy，业务列表 HTTP 200 |
| MCP | 本地 Streamable HTTP/SSE，`:8787` | 命令流与 ACK/result 通过 |
| Agent | 已配置赛事平台规划/对抗/评估 Agent | 真实 SSE 回包，未使用规则评估降级 |

## 固定输入

- 建筑: 乐盈广场 21 号楼
- 起火楼层: 5F
- 着火物质: 电气
- 被困人数: 5 人
- 演练 ID: `drill-building-21-001`

## 三轮结果

| 轮次 | 初步部署 | 特情/调整 | 人在回路 | 3D 联动 | 评估 | 结论 |
|---|---|---|---|---|---|---|
| 1 | Agent 成功 | 3 / 3 | 采纳 + 人工改派 + 采纳 | 特情位置命中 5F，单层聚焦 | 45/100，`source=agent` | 通过 |
| 2 | Agent 成功 | 3 / 3 | 采纳 + 人工改派 | 稳定保持 5F 联动 | 62/100，Agent 评估 | 通过 |
| 3 | Agent 成功 | 2 / 2 | 采纳 + 人工改派 | 稳定保持 5F 联动 | 62/100，Agent 评估 | 通过 |

## 闭环证据

### 实时态势查询

MCP `query_scene_state` 在对抗运行中返回:

- `online=true`
- `status=running`
- 真实灾情种子: 21 号楼 / 5F / 电气 / 5 人
- 特情、动态调整、采纳/人工改派、响应用时

第 1 轮结束后再次查询返回:

- `online=true`
- `status=finished`
- `review.source=agent`
- 评分、结论和归档状态

### 场景与回执

- 特情 `location` 为 5F 影院区域/放映厅时，楼层解析命中，场景切换到 5F 单层视图。
- 浏览器查询 handler 的结果经 `/api/scene-events/ack` 回传 MCP。
- 三轮均无页面刷新、场景卡死、对抗中断或 Agent 降级评估。

## 自动化基线

- 主项目: 62 个测试文件 / 423 用例通过
- MCP: 8 个测试文件 / 87 用例通过
- TypeScript 主项目/MCP 构建通过
- Next.js 生产构建通过

## 已知非阻塞项

1. 场景数据中有若干非标准短十六进制颜色，Three.js 会输出 `Invalid hex color` warning，本次未影响渲染和对抗。
2. 场景显隐时有 1 个对象和 `SITE_ROOT` 无法命中，当前为 best-effort warning，未影响 5F 聚焦。
3. 评估对“调整滞后”阈值较严，人工演示响应时间会显著影响分数；这是真实 Agent 结论，非链路失败。

## 后续处理

- 保留本记录作为比赛前回归比较基准。
- 本地启动的 Web/MCP 测试进程已停止；未终止测试前已存在的 znya 服务。
- 推送远端前复核 CI secrets 和生产 `.env`，不在验收文档中记录任何密钥。
