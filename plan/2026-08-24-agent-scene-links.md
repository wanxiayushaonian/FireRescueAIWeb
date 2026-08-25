# 智能体场景链接 + 内部消防设施查询（2026-08-24）

让智能体（各模块 agent）具备两项新能力：**查询建筑内部消防设施数量**、**输出可点击的场景锚点**。

## 一、内部消防设施查询：`query_scene_facilities`（8787 新工具）

- **用途**：数据库（znya key_floors / fire_facilities）没有"内部设施数量"这一粒度；本工具从 **3D 场景包**（浏览器在线解析场景树）统计消防设施数量。
- **调用方式**：`query_scene_facilities`（可选 `floor`/`type` 过滤）→ 返回 `cmd_id` → **必须再调 `get_scene_command_status(cmd_id)`** 获取结果（浏览器解析后经 ack 回传；`not_found` = 浏览器未加载场景/未在线）。
- **返回结构**：
  ```json
  {
    "total": 2140,                        // 场景全部非结构节点(含门/空间,对账用)
    "fireByTypeLabel": { "室内消火栓": 128, "感烟探测器": 286, "喷淋嘴": 3200, ... },
    "fireByFloor": { "1F": 41, "B1": 26, ... },
    "floors": ["B1", "1F", "2F", "...", "40F"]
  }
  ```
- **提示词写法**：需要引用设施数量时，先调 `query_scene_facilities`（建议带 `floor` 过滤到具体楼层，返回更聚焦），再调 `get_scene_command_status` 取结果，用结果回答，**不要编造数量**。

## 二、输出场景锚点（点击联动 3D）

智能体在**正文回复**中，用 markdown 链接把楼层/设施/设备做成可点击锚点，用户在聊天里点击即触发 3D 联动（楼层聚焦/设备飞向/类型高亮）。

### 语法（三种）

| 类型 | 语法 | 示例 | 点击效果 |
|---|---|---|---|
| 楼层 | `[文本](scene://floor/<楼层段>)` | `[13F 避难层](scene://floor/13F)`、`[3-4F 餐饮](scene://floor/3-4F)` | 独显该楼层段并飞向整体中心 |
| 设备 | `[文本](scene://device/<对象id>)` | `[5F 3号消火栓](scene://device/<outId>)` | 飞向该设备并高亮 |
| 类型 | `[文本](scene://type/<类型>?floor=<F>)` | `[本层消火栓](scene://type/室内消火栓?floor=5F)` | 高亮该类型设备(前12个)并飞向所在楼层 |

### 提示词约定（各 agent 通用）

1. 楼层锚点**最常用**：凡提到具体楼层/楼层段（如"起火层 5F""避难层 13F/25F""餐饮层 3-4F"），一律包成 `[名称](scene://floor/楼层段)`。楼层段写法与 `focus_floors`/`list_floors` 一致（`B1`/`5F`/`3-4F`/`13F/25F` 均可）。
2. 提到设备类型时用 `scene://type/中文类型名`（类型名见 `query_scene_facilities` 返回的 `fireByTypeLabel` 键），可加 `?floor=` 限定楼层。
3. 设备级锚点（`scene://device/<id>`）只有拿到 `list_fire_devices` 的具体 id 时才用，不要臆造 id。
4. 一个回答里锚点不超过 3-4 个，避免刷屏；锚点文本要能独立读懂（不要只写"这里"）。
5. 锚点语法是 markdown 链接：`[展示文本](scene://...)`，必须写完整，不要留空文本。

### 演示示例

> 起火点在 **5F 餐饮层**，人员密集。本楼设 **13F/25F 两处避难层**，其中 **25F 避难层** 净面积 580㎡，可容纳约 1100 人。高区客房层（26-40F）疏散中转依托 25F。
> - [5F 餐饮层](scene://floor/5F) ← 火点
> - [25F 避难层](scene://floor/25F) ← 疏散中转
> - [本层感烟探测器](scene://type/感烟探测器?floor=5F)

（注：示例中"5F 餐饮层"锚点指向 `scene://floor/5F`——楼层锚点按实际楼层写，若涉及多楼层段用 `scene://floor/3-4F` 写法。）

## 三、已接入模块

- 链接渲染：全部 agent 聊天面板（markdown 的 `a` 组件统一拦截 `scene://` 前缀）。
- 查询工具：8787 已注册 `query_scene_facilities`，需在平台各 agent 的 mcp_servers 勾选该工具（若此前已勾选 8787 全量工具则自动生效，无需改配置）。

## 四、关联文件

- `lib/scene-facilities.ts`（统计纯函数）/ `lib/scene-command-bus/`（命令通道 + result 回传）/ `mcp-server/src/tools.ts`（工具定义）
- `src/components/assistant-ui/scene-link.tsx`（锚点组件）/ `markdown-text.tsx`（a 组件拦截）
