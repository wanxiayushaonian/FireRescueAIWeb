import { getSceneOverview, getFireDeviceList, getFloorList } from './bff-client.js';
import { publishCommand } from './command-bus.js';
import type { SceneCommand } from './types.js';

export const TOOLS = [
  {
    name: 'list_fire_devices',
    description: '查询当前场景的消防设备清单(含 id/name/type,id 供 fly_to 使用)',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'list_floors',
    description: '查询当前场景的楼层清单(含 id/name,id 供 focus_floors 使用)',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'focus_objects',
    description: '高亮聚焦一组场景对象(设备 id 来自 list_fire_devices),并飞向首个;空数组清除高亮',
    inputSchema: {
      type: 'object',
      properties: { ids: { type: 'array', items: { type: 'string' }, description: '对象 id 列表' } },
      required: ['ids'],
    },
  },
  {
    name: 'focus_floors',
    description: '隔离显示选中的楼层(其余层隐藏);楼层 id 来自 list_floors;空数组恢复全楼层',
    inputSchema: {
      type: 'object',
      properties: { story_ids: { type: 'array', items: { type: 'string' }, description: '楼层 id 列表' } },
      required: ['story_ids'],
    },
  },
  {
    name: 'fly_to',
    description: '让 3D 场景镜头飞向指定对象(target 为对象 id)',
    inputSchema: {
      type: 'object',
      properties: { target: { type: 'string', description: '场景对象 id(来自 list_fire_devices)' } },
      required: ['target'],
    },
  },
  {
    name: 'show_route',
    description: '在 2D 态势总览渲染多站派遣路线(routes: 路线数组,每项含 stationName/polyline[[lat,lng]]/distance/duration/trafficLights;业务查询/规划走 Python MCP,本工具只负责场景渲染)',
    inputSchema: {
      type: 'object',
      properties: {
        routes: { type: 'array', items: { type: 'object' } },
        target: { type: 'string', description: '目标名称(可选)' },
      },
      required: ['routes'],
    },
  },
] as const;

export async function handleToolCall(
  name: string,
  args: Record<string, unknown>,
): Promise<{ content: { type: 'text'; text: string }[]; isError?: boolean }> {
  const sceneId = process.env.SCENE_ID || '';

  if (name === 'list_fire_devices') {
    const [devices, overview] = await Promise.all([
      getFireDeviceList({ sceneId }),
      getSceneOverview({ sceneId }).catch(() => null),
    ]);
    // 全量清单可能很大(tree 14MB),只给 agent 前 50 条 + 统计,避免 token 爆炸
    const shown = devices.slice(0, 50).map((d) => ({ id: d.id, name: d.name, type: d.type }));
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          total: devices.length,
          devices: shown,
          truncated: devices.length > 50,
          overview,
        }, null, 2),
      }],
    };
  }

  if (name === 'list_floors') {
    const floors = await getFloorList({ sceneId });
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ total: floors.length, floors }, null, 2),
      }],
    };
  }

  if (name === 'focus_objects') {
    const ids = Array.isArray(args.ids) ? (args.ids as unknown[]).map(String) : [];
    const cmd: SceneCommand = {
      id: `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      tool: 'focus_objects',
      args: { ids },
      ts: Date.now(),
    };
    publishCommand(cmd);
    const action = ids.length === 0 ? '已清除聚焦高亮' : `已聚焦 ${ids.length} 个对象`;
    return {
      content: [{
        type: 'text',
        text: `已下发 focus_objects:${action}。命令经 /scene-events 推送;仅当页面在线且场景 SDK 就绪时生效,通道为单向无回执。`,
      }],
    };
  }

  if (name === 'focus_floors') {
    const storyIds = Array.isArray(args.story_ids) ? (args.story_ids as unknown[]).map(String) : [];
    const cmd: SceneCommand = {
      id: `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      tool: 'focus_floors',
      args: { story_ids: storyIds },
      ts: Date.now(),
    };
    publishCommand(cmd);
    const floorAction = storyIds.length === 0 ? '已恢复全楼层' : `已隔离 ${storyIds.length} 层`;
    return {
      content: [{
        type: 'text',
        text: `已下发 focus_floors:${floorAction}。命令经 /scene-events 推送;仅当页面在线且场景 SDK 就绪时生效,通道为单向无回执。`,
      }],
    };
  }

  if (name === 'fly_to') {
    const target = String(args.target ?? '').trim();
    if (!target) {
      return {
        isError: true,
        content: [{ type: 'text', text: 'fly_to 缺少 target:需提供场景对象 id(可用 list_fire_devices 查询)' }],
      };
    }
    const cmd: SceneCommand = {
      id: `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      tool: 'fly_to',
      args: { target },
      ts: Date.now(),
    };
    publishCommand(cmd);
    // 命令通道是单向 fire-and-forget:这里只表示「已下发」,不代表场景已执行。
    // 场景页面离线 / SDK 未就绪 / EventSource 重连窗口都会导致命令丢失且无回执。
    return {
      content: [{
        type: 'text',
        text: `已下发 fly_to -> ${target}:命令经 /scene-events 推送至场景页面。仅当页面在线且场景 SDK 就绪时才会执行;命令通道为单向,无执行回执,实际效果需另行确认。`,
      }],
    };
  }

  if (name === 'show_route') {
    const routes = Array.isArray(args.routes) ? (args.routes as unknown[]) : [];
    if (routes.length === 0) {
      return {
        isError: true,
        content: [{ type: 'text', text: 'show_route 缺少 routes:需提供路线数组(可先经业务 Python MCP 规划)' }],
      };
    }
    const cmd: SceneCommand = {
      id: `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      tool: 'show_route',
      args: { routes, target: String(args.target ?? '') },
      ts: Date.now(),
    };
    publishCommand(cmd);
    return {
      content: [{
        type: 'text',
        text: `已下发 show_route(${routes.length} 站):命令经 /scene-events 推送至 2D 态势总览渲染。仅当页面在线且地图就绪时生效,通道为单向无回执。`,
      }],
    };
  }

  throw new Error(`unknown tool: ${name}`);
}
