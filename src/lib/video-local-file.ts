// 本地视频文件接入:文件选择器(File System Access API,Chromium)让页面获得沙箱内合法的
// 文件访问权——浏览器不允许 src 直指磁盘路径,但允许用户显式选择后读取。
// 持久化:FileSystemFileHandle 可存 IndexedDB,刷新后仍能 getFile;权限为 prompt 时
// 在播放点击的手势内 requestPermission 重连,无需重新选文件。
// 降级:无 showOpenFilePicker 的浏览器回退 <input type=file>,仅会话内有效(blob URL)。
// 配置值约定:本地方案存 `localfile:<文件名>`(而非会话易死的 blob: URL),播放侧经
// resolveLocalVideoUrl 解析为新鲜 object URL。
import type { VideoSlotId } from './video-source-config';

type FsPermissionState = 'granted' | 'denied' | 'prompt';

interface FsFileHandleLike {
  kind: string;
  name: string;
  queryPermission?(d: { mode: 'read' }): Promise<FsPermissionState>;
  requestPermission?(d: { mode: 'read' }): Promise<FsPermissionState>;
  getFile(): Promise<File>;
}

// ── IndexedDB(handle 存取) ──────────────────────────────────────────────

const DB_NAME = 'fira-video-handles';
const STORE = 'handles';

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

async function idbPut(slot: VideoSlotId, handle: FsFileHandleLike): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(handle, slot);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // 存取失败不阻断选择流程,仅失去刷新后免重选能力
  } finally {
    db.close();
  }
}

async function idbGet(slot: VideoSlotId): Promise<FsFileHandleLike | null> {
  const db = await openDb();
  if (!db) return null;
  try {
    const handle = await new Promise<FsFileHandleLike | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(slot);
      req.onsuccess = () => resolve(req.result as FsFileHandleLike | undefined);
      req.onerror = () => reject(req.error);
    });
    return handle ?? null;
  } catch {
    return null;
  } finally {
    db.close();
  }
}

// ── 选择与解析 ────────────────────────────────────────────────────────

/** 打开本地视频选择器;成功返回写入配置槽位的值(`localfile:<文件名>`)。取消返回 null。 */
export async function pickLocalVideo(
  slot: VideoSlotId,
): Promise<{ value: string; name: string } | null> {
  const picker = (window as unknown as {
    showOpenFilePicker?: (opts?: unknown) => Promise<FsFileHandleLike[]>;
  }).showOpenFilePicker;

  if (picker) {
    let handles: FsFileHandleLike[];
    try {
      handles = await picker({
        types: [{ description: '视频文件', accept: { 'video/*': ['.mp4', '.webm', '.ogg', '.mov', '.m4v'] } }],
      });
    } catch (e) {
      // 用户取消(DOMException AbortError)静默;其余失败也按未选择处理
      return null;
    }
    const handle = handles[0];
    if (!handle) return null;
    await idbPut(slot, handle);
    return { value: `localfile:${handle.name}`, name: handle.name };
  }

  // 降级:<input type=file> 仅会话内可用(无 handle 无法跨刷新),直接以 blob URL 作为配置值
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*';
    input.onchange = () => {
      const file = input.files?.[0];
      resolve(file ? { value: URL.createObjectURL(file), name: file.name } : null);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

const lastUrls = new Map<VideoSlotId, string>();

/**
 * 把槽位上保存的本地方案解析为可播放的 object URL。
 * 必须在用户手势(点击)调用链内使用:授权为 prompt 时会在此次点击内弹授权。
 * 无法访问(未选过/拒绝授权/文件已移动)返回 null。
 */
export async function resolveLocalVideoUrl(slot: VideoSlotId): Promise<string | null> {
  const handle = await idbGet(slot);
  if (!handle) return null;
  try {
    const query = handle.queryPermission
      ? await handle.queryPermission({ mode: 'read' })
      : 'prompt';
    if (query !== 'granted') {
      const granted = handle.requestPermission
        ? await handle.requestPermission({ mode: 'read' })
        : 'denied';
      if (granted !== 'granted') return null;
    }
    const file = await handle.getFile();
    const prev = lastUrls.get(slot);
    if (prev) URL.revokeObjectURL(prev);
    const url = URL.createObjectURL(file);
    lastUrls.set(slot, url);
    return url;
  } catch {
    return null;
  }
}
