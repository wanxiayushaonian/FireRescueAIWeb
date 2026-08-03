import { getSceneOverview, getFireDeviceList } from './bff-client.js';
import { publishCommand } from './command-bus.js';
import type { SceneCommand } from './types.js';

export const TOOLS = [
  {
    name: 'list_fire_devices',
    description: '查询当前场景的消防设备清单(含 id/name/type,id 供 fly_to 使用)',
    inputSchema: { type: 'object', properties: {} },
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
] as const;

export async function handleToolCall(
  name: string,
  args: Record<string, unknown>,
): Promise<{ content: { type: 'text'; text: string }[] }> {
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

  if (name === 'fly_to') {
    const target = String(args.target ?? '');
    const cmd: SceneCommand = {
      id: `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      tool: 'fly_to',
      args: { target },
      ts: Date.now(),
    };
    publishCommand(cmd);
    return { content: [{ type: 'text', text: `ack: fly_to -> ${target}` }] };
  }

  throw new Error(`unknown tool: ${name}`);
}
