import { registerSceneTool } from './registry';
import type { SceneSdkLike } from './types';

// 聚焦高亮色:与 FIRE_TYPE_COLORS 告警色一致,agent 不操心配色。
const FOCUS_HIGHLIGHT_COLOR = '#f87171';

export function registerDefaultTools(_sdk: SceneSdkLike): void {
  registerSceneTool('fly_to', async (args, sdk) => {
    const target = String(args.target ?? '');
    if (!target) {
      console.warn('[scene-bus] fly_to missing target');
      return;
    }
    await sdk.fly(target);
  });

  registerSceneTool('focus_objects', async (args, sdk) => {
    const ids = Array.isArray(args.ids) ? (args.ids as unknown[]).map(String) : [];
    if (ids.length === 0) {
      sdk.cancelHeighLight();
      return;
    }
    // MVP:高亮全部 + 飞向首个。精确框住多对象需底层 ssp(包围盒),留作后续。
    for (const id of ids) sdk.heighLight(id, FOCUS_HIGHLIGHT_COLOR);
    await sdk.fly(ids[0]);
  });
}
