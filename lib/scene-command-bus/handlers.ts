import { registerSceneTool } from './registry';
import type { SceneSdkLike } from './types';

export function registerDefaultTools(_sdk: SceneSdkLike): void {
  registerSceneTool('fly_to', async (args, sdk) => {
    const target = String(args.target ?? '');
    if (!target) {
      console.warn('[scene-bus] fly_to missing target');
      return;
    }
    await sdk.fly(target);
  });
  // Phase 1+ 再补 focus_objects / focus_floors / show_route / draw_zone / ...
}
