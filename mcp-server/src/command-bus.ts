import type { SceneCommand } from './types.js';

type Listener = (cmd: SceneCommand) => void;
const listeners = new Set<Listener>();

export function publishCommand(cmd: SceneCommand): void {
  // 隔离每个订阅者:单个 listener 抛错(如客户端已断开 res.write 失败)不能中断其他订阅者收到命令。
  for (const l of listeners) {
    try {
      l(cmd);
    } catch (err) {
      console.error('[command-bus] listener threw:', err);
    }
  }
}

export function subscribeCommands(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
