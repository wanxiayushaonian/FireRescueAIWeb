export type SceneCommand = {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  sessionId?: string;
  ts: number;
};

// sceneSdk() 的最小可用子集(按需扩展)
export type SceneSdkLike = {
  fly: (target: string | number) => unknown;
  heighLight: (id: string, color?: string | number) => unknown;
  cancelHeighLight: () => unknown;
  [k: string]: unknown;
};

export type SceneToolHandler = (
  args: Record<string, unknown>,
  sdk: SceneSdkLike,
) => void | Promise<void>;
