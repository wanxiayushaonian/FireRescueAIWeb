# @dt-uagent/multi-agent-sdk

> 多智能体对话浮窗 SDK（`@dt-uagent/multi-agent-sdk@1.0.12`）

开箱即用的多智能体聊天窗口组件，支持多智能体协作、会话管理、流式响应、工具调用审批、多模态输入、多语言与主题切换，可悬浮或嵌入页面指定区域。模板右下角的多智能体浮窗即由它驱动。

## 核心 API

### `init(config, options?)`

创建并挂载多智能体聊天窗口。

```ts
const instance = await init(
  {
    // IMultiAgentChatWindowConfig
  },
  {
    // IMultiAgentChatWindowOptions（可选）
  }
)
```

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `config` | `IMultiAgentChatWindowConfig` | 聊天窗口配置（应用列表、场景上下文等） |
| `options` | `IMultiAgentChatWindowOptions` | 选项（容器、语言、主题等） |

**返回值**：`IMultiAgentChatWindowInstance`（实例，含控制方法）。

### 使用方式

- **ES Module**：`import { init } from '@dt-uagent/multi-agent-sdk'`
- **浏览器 Script 标签**：通过 UMD 包 `dist/multi-agent-sdk.umd.js` 全局引入

## 参数说明

### 两层模型（forwardedProps / passthroughProps）

- `forwardedProps`：**Agent 感知**的注入数据（如场景信息、上下文），智能体可以看到并使用。
- `passthroughProps`：**MCP 工具透传**数据，供工具调用使用，不直接暴露给智能体对话。

### 常见注入场景

| 场景 | 方式 |
| --- | --- |
| 注入场景 ID / 上下文 | `forwardedProps` |
| 透传工具参数 | `passthroughProps` |

## 功能特性

- **多智能体协作** — 自动加载多智能体应用列表，支持切换不同主智能体
- **会话管理** — 对话历史持久化，支持切换、删除、清空历史对话
- **流式响应** — SSE 流式输出，实时展示 Agent 思考和回复内容
- **工具调用审批** — 支持人工审批 / 拒绝 / 修改工具调用参数
- **多模态输入** — 支持上传图片（vision），让智能体理解图像内容
- **多语言** — 内置中文 / 英文，支持自动检测浏览器语言
- **主题切换** — 支持浅色 / 深色 / 跟随系统
- **悬浮模式** — 不传 `container` 时自动以悬浮按钮 + 面板形式展示
- **嵌入模式** — 传入 `container` 时面板填满指定 DOM 节点

## 导出类型

| 类型 | 说明 |
| --- | --- |
| `IMultiAgentChatWindowConfig` | `init()` 第一个参数的配置类型 |
| `IMultiAgentChatWindowOptions` | `init()` 第二个参数的选项类型 |
| `IMultiAgentChatWindowInstance` | `init()` 返回的实例类型 |
| `SdkThemeMode` | 主题模式联合类型 `'light' \| 'dark' \| 'auto'` |

## 在模板中的使用

- `components/MultiAgentWidget.tsx`：右下角多智能体浮窗组件，动态加载本 SDK。
- 通过 `X_APP_KEY` 与 `/uagent-service` 代理（`app/uagent-service/api/agent/v1/apps/agent-chat/route.ts`）与智能体平台通信。
- `sceneId` 由 `useSceneId()` 自动跟随当前场景。
