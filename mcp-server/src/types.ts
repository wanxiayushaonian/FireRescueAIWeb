export type SceneCommand = {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  sessionId?: string;
  ts: number;
};
