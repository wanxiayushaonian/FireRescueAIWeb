// 视频源配置:预案输出面板三分组讲解视频 + 实战指挥现场回传,统一 URL 映射。
// localStorage 持久化(设置菜单写入,播放侧只读);SSR/测试环境降级内存 Map
// (agent-context.ts 同款 window 守卫);订阅为纯回调,不依赖 CustomEvent。

export type VideoSlotId = 'plan-forces' | 'plan-tactics' | 'plan-routes' | 'command-live';

export interface VideoSlotMeta {
  id: VideoSlotId;
  title: string;
  description: string;
}

/** 展示顺序即设置界面顺序 */
export const VIDEO_SLOTS: VideoSlotMeta[] = [
  { id: 'plan-forces', title: '力量编成视频', description: '演练对抗 · 预案输出面板「力量编成」分组点击播放' },
  { id: 'plan-tactics', title: '战术战法视频', description: '演练对抗 · 预案输出面板「战术战法」分组点击播放' },
  { id: 'plan-routes', title: '进攻疏散路线视频', description: '演练对抗 · 预案输出面板「进攻疏散路线」分组点击播放' },
  { id: 'command-live', title: '现场视频回传', description: '实战指挥「现场视频回传」面板的画面源；未配置时保留演示占位画面' },
];

const SLOT_IDS = VIDEO_SLOTS.map((s) => s.id);
const STORAGE_KEY = 'fira.video-sources.v1';

/** 本地文件方案的配置值前缀(值=`localfile:<文件名>`,播放侧经 video-local-file 解析) */
export const LOCALFILE_PREFIX = 'localfile:';

export function isLocalFileSource(value: string): boolean {
  return value.startsWith(LOCALFILE_PREFIX);
}

const memoryStore = new Map<VideoSlotId, string>();
const listeners = new Set<(sources: Record<VideoSlotId, string>) => void>();

function readStore(): Record<VideoSlotId, string> {
  const out = {} as Record<VideoSlotId, string>;
  for (const id of SLOT_IDS) out[id] = '';
  if (typeof window === 'undefined') {
    for (const id of SLOT_IDS) out[id] = memoryStore.get(id) ?? '';
    return out;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return out;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const id of SLOT_IDS) {
      const v = parsed[id];
      if (typeof v === 'string') out[id] = v;
    }
  } catch {
    // 损坏数据按空配置处理,下次保存即覆盖
  }
  return out;
}

export function getVideoSources(): Record<VideoSlotId, string> {
  return readStore();
}

export function getVideoSource(id: VideoSlotId): string {
  return readStore()[id];
}

/** 合并写入(未提供的槽位保持原值),持久化并通知订阅方;返回合并后的完整配置 */
export function saveVideoSources(next: Partial<Record<VideoSlotId, string>>): Record<VideoSlotId, string> {
  const merged = { ...readStore(), ...next };
  for (const id of SLOT_IDS) {
    const v = (merged[id] ?? '').trim();
    merged[id] = v;
    memoryStore.set(id, v);
  }
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    } catch {
      // 隐私模式等写入失败不阻断 UI,本次会话内内存仍生效
    }
  }
  for (const cb of listeners) cb({ ...merged });
  return merged;
}

export function clearVideoSource(id: VideoSlotId): void {
  void saveVideoSources({ [id]: '' });
}

/** 订阅配置变化(设置保存后播放侧即时感知);返回取消订阅函数 */
export function subscribeVideoSources(cb: (sources: Record<VideoSlotId, string>) => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
