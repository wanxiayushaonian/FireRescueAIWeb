import type { SceneCommand } from './types.js';

type Listener = (cmd: SceneCommand) => void;
const listeners = new Set<Listener>();

export function publishCommand(cmd: SceneCommand): void {
  for (const l of listeners) l(cmd);
}

export function subscribeCommands(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
