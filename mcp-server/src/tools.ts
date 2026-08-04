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

// 设备清单 TTL 缓存:tree 接口返回 14MB,agent 每次问都重拉极慢。5 分钟内复用。
const DEVICE_CACHE_TTL_MS = 5 * 60 * 1000;
const deviceCache = new Map<string, { at: number; devices: Awaited<ReturnType<typeof getFireDeviceList>> }>();

/** 仅测试用:清空设备缓存。*/
export function __resetDeviceCacheForTest(): void {
  deviceCache.clear();
}

async function getDevicesCached(sceneId: string): Promise<Awaited<ReturnType<typeof getFireDeviceList>>> {
  const hit = deviceCache.get(sceneId);
  if (hit && Date.now() - hit.at < DEVICE_CACHE_TTL_MS) return hit.devices;
  const devices = await getFireDeviceList({ sceneId });
  deviceCache.set(sceneId, { at: Date.now(), devices });
  return devices;
}

export async function handleToolCall(
  name: string,
  args: Record<string, unknown>,
): Promise<{ content: { type: 'text'; text: string }[] }> {
  const sceneId = process.env.SCENE_ID || '';

  if (name === 'list_fire_devices') {
    const [devices, overview] = await Promise.all([
      getDevicesCached(sceneId),
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
