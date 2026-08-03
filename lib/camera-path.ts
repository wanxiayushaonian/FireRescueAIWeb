'use client';

import type { CameraViewpoint } from './soonspace-runtime';

export type CameraPathPoint = CameraViewpoint & {
  id: string;
  createdAt: number;
};

export type CameraPathToolApi = {
  list: () => CameraPathPoint[];
  add: (viewpoint?: CameraViewpoint | null) => CameraPathPoint | null;
  remove: (id: string) => boolean;
  clear: () => void;
  play: () => void;
  stop: () => void;
  jumpTo: (id: string) => Promise<boolean>;
  getPlaying: () => boolean;
};

const STORAGE_PREFIX = 'jarvis:ustudio:camera-path:';

let sceneId = '';
let activeRuntime: { getCameraViewpoint(): CameraViewpoint | null; setCameraViewpoint(v: CameraViewpoint, t?: boolean): Promise<void> } | null = null;

let points: CameraPathPoint[] = [];
let playing = false;
let playToken = 0;
const listeners = new Set<() => void>();

function notify(): void {
  for (const fn of listeners) fn();
}

function persist(): void {
  if (typeof window === 'undefined' || !sceneId) return;
  try {
    window.localStorage.setItem(STORAGE_PREFIX + sceneId, JSON.stringify(points));
  } catch {
    // ignore storage quota/privacy errors
  }
}

function load(sceneIdValue: string): CameraPathPoint[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + sceneIdValue);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return (parsed as CameraPathPoint[]).filter(
      (p) => p && typeof p.id === 'string' && p.position && p.target && typeof p.zoom === 'number',
    );
  } catch {
    return [];
  }
}

function makeId(): string {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

/** 绑定当前场景的镜头路径工具（场景加载完成后调用）。 */
export function initCameraPathTool(
  sceneIdValue: string,
  runtime: { getCameraViewpoint(): CameraViewpoint | null; setCameraViewpoint(v: CameraViewpoint, t?: boolean): Promise<void> },
): void {
  sceneId = sceneIdValue;
  activeRuntime = runtime;
  points = load(sceneIdValue);
  playing = false;
  notify();
  if (typeof window !== 'undefined') {
    window.__cameraPathTool = createApi();
  }
}

/** 场景卸载时清理（保留已保存的路径点，仅断开工具引用）。 */
export function disposeCameraPathTool(): void {
  sceneId = '';
  activeRuntime = null;
  playing = false;
  playToken += 1;
  notify();
  if (typeof window !== 'undefined') {
    delete window.__cameraPathTool;
  }
}

export function subscribeCameraPath(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getCameraPathPoints(): CameraPathPoint[] {
  return points;
}

export function getCameraPathPlaying(): boolean {
  return playing;
}

function addPoint(viewpoint?: CameraViewpoint | null): CameraPathPoint | null {
  const source = viewpoint ?? activeRuntime?.getCameraViewpoint();
  if (!source) return null;
  const point: CameraPathPoint = {
    id: makeId(),
    position: { x: source.position.x, y: source.position.y, z: source.position.z },
    target: { x: source.target.x, y: source.target.y, z: source.target.z },
    zoom: source.zoom,
    createdAt: Date.now(),
  };
  points = [...points, point];
  persist();
  notify();
  return point;
}

function removePoint(id: string): boolean {
  const before = points.length;
  points = points.filter((p) => p.id !== id);
  const removed = points.length !== before;
  if (removed) {
    persist();
    notify();
  }
  return removed;
}

function clearPoints(): void {
  if (points.length === 0) return;
  points = [];
  persist();
  notify();
}

async function jumpToPoint(id: string): Promise<boolean> {
  const runtime = activeRuntime;
  const point = points.find((p) => p.id === id);
  if (!runtime || !point) return false;
  await runtime.setCameraViewpoint(point, true);
  return true;
}

/** 播放：按顺序带过渡飞到每个路径点，停顿后继续；stop / 再次 play 会打断。 */
async function playPath(): Promise<void> {
  if (!activeRuntime || points.length === 0) return;
  const token = ++playToken;
  playing = true;
  notify();
  const DWELL_MS = 1600;
  try {
    for (const point of points) {
      if (token !== playToken) return;
      await activeRuntime.setCameraViewpoint(point, true);
      await new Promise((resolve) => setTimeout(resolve, DWELL_MS));
    }
  } finally {
    if (token === playToken) {
      playing = false;
      notify();
    }
  }
}

function stopPlay(): void {
  if (!playing) return;
  playToken += 1;
  playing = false;
  notify();
}

function createApi(): CameraPathToolApi {
  return {
    list: () => getCameraPathPoints(),
    add: (viewpoint?: CameraViewpoint | null) => addPoint(viewpoint ?? null),
    remove: (id: string) => removePoint(id),
    clear: () => clearPoints(),
    play: () => void playPath(),
    stop: () => stopPlay(),
    jumpTo: (id: string) => jumpToPoint(id),
    getPlaying: () => getCameraPathPlaying(),
  };
}

declare global {
  interface Window {
    __cameraPathTool?: CameraPathToolApi;
  }
}
