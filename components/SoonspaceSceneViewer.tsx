'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { EmptySceneBootstrap, SceneBootstrap, SceneBootstrapResponse } from '@/lib/ustudio';
import { createDefaultPlugins, localStoragePersistence, PluginManager } from '@/lib/scene-plugins';
import { SoonspaceRuntime } from '@/lib/soonspace-runtime';
import { sceneSdk } from '@/lib/scene-sdk';
import { i18n } from '@/lib/i18n';
import { PluginPanel } from './PluginPanel';
import { SceneLauncher, type SceneSummary } from './SceneLauncher';
import { AlarmCenter } from './AlarmCenter';
import { DeviceSearch } from './DeviceSearch';
import { KeyHintOverlay } from './KeyHintOverlay';
import { CameraSettingsPopup } from './CameraSettingsPopup';
import { CameraPathPanel } from './CameraPathPanel';
import { SceneObjectInfoCard, type ClickInfo } from './SceneObjectInfoCard';
import { disposeCameraPathTool, initCameraPathTool } from '@/lib/camera-path';
import { buildStoryNameMap, type SceneTreeNode } from '@/lib/device-tree';

type View = 'launcher' | 'loading' | 'ready' | 'error';
type LoadStage = 'setup' | 'loading';

async function fetchJson<T>(url: string, logContext: Record<string, unknown> = {}): Promise<T> {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await fetch(url, { cache: 'no-store' });
    const contentType = response.headers.get('content-type') ?? '';
    const isJson = contentType.includes('application/json');
    if (response.ok && isJson) return (await response.json()) as T;

    const text = await response.text().catch(() => '');
    const looksLikeHtml = /^\s*</.test(text);
    if (looksLikeHtml && attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 600 * attempt));
      continue;
    }

    if (isJson) {
      const payload = JSON.parse(text || '{}') as {
        message?: string;
        upstreamUrl?: string;
        upstreamMethod?: string;
        upstreamParams?: unknown;
        xAppKey?: string;
        [key: string]: unknown;
      };
      const originalUrl = typeof payload.upstreamUrl === 'string' && payload.upstreamUrl ? payload.upstreamUrl : url;
      console.error('[soonspace-viewer] fetch failed', {
        url: originalUrl,
        nextUrl: url,
        method: payload.upstreamMethod ?? 'GET',
        params: payload.upstreamParams ?? logContext.params,
        xAppKey: payload.xAppKey,
        status: response.status,
        statusText: response.statusText,
        contentType,
        response: payload,
      });
      throw new Error(payload.message ?? '请求失败: ' + originalUrl);
    }
    const summary = looksLikeHtml ? '接口返回了 HTML 页面，可能是预览正在编译或接口异常' : text.slice(0, 180);
    console.error('[soonspace-viewer] fetch failed', {
      url,
      method: 'GET',
      status: response.status,
      statusText: response.statusText,
      contentType,
      response: summary,
      ...logContext,
    });
    throw new Error(summary + ': ' + url);
  }
  throw new Error('请求失败: ' + url);
}

function isEmptySceneBootstrap(bootstrap: SceneBootstrapResponse): bootstrap is EmptySceneBootstrap {
  return (bootstrap as EmptySceneBootstrap).empty === true;
}

const SELECTED_SCENE_STORAGE_PREFIX = 'jarvis:ustudio:selected-scene:';

const CAMERA_CONTROLS_KEY = 'jarvis:ustudio:camera-controls';

function readCameraControlsSettings(): { keyHints: boolean; resetEnabled: boolean } {
  if (typeof window === 'undefined') return { keyHints: true, resetEnabled: true };
  try {
    const raw = window.localStorage.getItem(CAMERA_CONTROLS_KEY);
    if (!raw) return { keyHints: true, resetEnabled: true };
    const parsed = JSON.parse(raw) as { keyHints?: boolean; resetEnabled?: boolean };
    return {
      keyHints: parsed.keyHints ?? true,
      resetEnabled: parsed.resetEnabled ?? true,
    };
  } catch {
    return { keyHints: true, resetEnabled: true };
  }
}

function writeCameraControlsSettings(settings: { keyHints: boolean; resetEnabled: boolean }): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CAMERA_CONTROLS_KEY, JSON.stringify(settings));
  } catch {
    // ignore storage quota/privacy errors
  }
}

function sceneSelectionScope(): string {
  const envScope = process.env.NEXT_PUBLIC_JARVIS_WORKSPACE_ID?.trim();
  if (envScope) return envScope;
  if (typeof window === 'undefined') return 'default';
  return window.location.origin + window.location.pathname;
}

function selectedSceneStorageKey(): string {
  return SELECTED_SCENE_STORAGE_PREFIX + sceneSelectionScope();
}

function sceneIdFromLocation(): string | null {
  if (typeof window === 'undefined') return null;
  const sceneId = new URLSearchParams(window.location.search).get('sceneId')?.trim();
  return sceneId || null;
}

function shouldResetSceneSelection(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('sceneReset') === 'config-change';
}

function readStoredSelectedSceneId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(selectedSceneStorageKey())?.trim() || null;
  } catch {
    return null;
  }
}

function updateSceneIdInLocation(sceneId: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    if (sceneId) url.searchParams.set('sceneId', sceneId);
    else url.searchParams.delete('sceneId');
    url.searchParams.delete('sceneReset');
    window.history.replaceState(null, '', url);
  } catch {
    // ignore readonly history
  }
}

function rememberSelectedSceneId(sceneId: string): void {
  if (!sceneId.trim() || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(selectedSceneStorageKey(), sceneId);
  } catch {
    // ignore storage quota/privacy errors
  }
  updateSceneIdInLocation(sceneId);
}

function clearSelectedSceneId(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(selectedSceneStorageKey());
  } catch {
    // ignore storage quota/privacy errors
  }
  updateSceneIdInLocation(null);
}

/**
 * 启动场景 ID：只认 URL 参数（预览 / 分享直连）。
 * 不再自动读取 localStorage —— 打开应用默认进入场景选择门厅，避免大场景未选择就被强制加载。
 * localStorage 仅作为门厅「最近使用」标记使用。
 */
function initialSceneId(): string | null {
  if (shouldResetSceneSelection()) {
    clearSelectedSceneId();
    return null;
  }
  return sceneIdFromLocation();
}

/**
 * 顶栏「当前楼层」：订阅 SDK 场景状态，并结合场景树把楼层 id 映射为名称。
 * 未选中楼层时展示「全部楼层」。
 */
function useCurrentStoriesLabel(sceneId: string): string {
  const [label, setLabel] = useState('全部楼层');
  useEffect(() => {
    if (!sceneId) return;
    let unsub: (() => void) | undefined;
    let nameMap: Record<string, string> = {};
    try {
      const sdk = sceneSdk();
      type LayerStateShape = { layer?: { stories?: string[] } };
      const apply = (storyIds: string[] | undefined): void => {
        if (storyIds && storyIds.length > 0) {
          const names = storyIds.map((id) => nameMap[id] ?? id);
          setLabel(`当前楼层：${names.join('、')}`);
        } else {
          setLabel('全部楼层');
        }
      };
      apply((sdk.getSceneSetState?.() as LayerStateShape | undefined)?.layer?.stories);
      unsub = sdk.subscribeSceneState?.((next: LayerStateShape) => apply(next.layer?.stories));
      void (async () => {
        try {
          const res = await fetch(`/api/ustudio/tree?sceneId=${encodeURIComponent(sceneId)}`);
          if (!res.ok) return;
          const tree = (await res.json()) as SceneTreeNode;
          nameMap = buildStoryNameMap(tree);
          apply((sdk.getSceneSetState?.() as LayerStateShape | undefined)?.layer?.stories);
        } catch {
          // 楼层名映射失败不影响主功能，继续用 id 展示
        }
      })();
    } catch {
      // SDK 未就绪时保持默认
    }
    return () => {
      unsub?.();
    };
  }, [sceneId]);
  return label;
}

export function SoonspaceSceneViewer() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const runtimeRef = useRef<SoonspaceRuntime | null>(null);
  const clickUnsubscribeRef = useRef<(() => void) | null>(null);
  const [view, setView] = useState<View>('launcher');
  const [message, setMessage] = useState(() => i18n('viewer.loading.initial'));
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadStage, setLoadStage] = useState<LoadStage>('setup');
  const [pluginManager, setPluginManager] = useState<PluginManager | null>(null);
  const [scenes, setScenes] = useState<SceneSummary[]>([]);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(() => initialSceneId());
  const [currentSceneName, setCurrentSceneName] = useState('');
  const [currentSceneId, setCurrentSceneId] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [showPanel, setShowPanel] = useState(false);
  const [lastSceneId, setLastSceneId] = useState<string | null>(() => readStoredSelectedSceneId());
  const [showSettings, setShowSettings] = useState(false);
  const [showCameraPath, setShowCameraPath] = useState(false);
  const [clickedObject, setClickedObject] = useState<ClickInfo | null>(null);
  const [keyHintsEnabled, setKeyHintsEnabled] = useState<boolean>(() => readCameraControlsSettings().keyHints);
  const [resetEnabled, setResetEnabled] = useState<boolean>(() => readCameraControlsSettings().resetEnabled);

  const currentStoriesLabel = useCurrentStoriesLabel(currentSceneId);

  // 相机操控设置持久化 + 同步到运行时（镜头重置开关即时生效）
  useEffect(() => {
    writeCameraControlsSettings({ keyHints: keyHintsEnabled, resetEnabled });
  }, [keyHintsEnabled, resetEnabled]);

  useEffect(() => {
    runtimeRef.current?.setCameraResetEnabled(resetEnabled);
  }, [resetEnabled]);

  useEffect(() => {
    document.getElementById('jarvis-preview-fallback')?.remove();
  }, []);

  useEffect(() => {
    let disposed = false;
    let runtime: SoonspaceRuntime | null = null;
    let manager: PluginManager | null = null;

    async function run() {
      const container = containerRef.current;
      setPluginManager(null);
      setShowPanel(false);
      container?.replaceChildren();

      // 1. 读取场景列表（轻量，不加载 3D 资源）
      setView('loading');
      setMessage(i18n('viewer.loading.bootstrap'));
      setLoadProgress(2);
      setLoadStage('setup');
      const qs = selectedSceneId ? '?sceneId=' + encodeURIComponent(selectedSceneId) : '';
      const bootstrapUrl = '/api/ustudio/bootstrap' + qs;
      const bootstrapParams = { sceneId: selectedSceneId || undefined };
      console.info('[soonspace-viewer] request bootstrap', { url: bootstrapUrl, method: 'GET', params: bootstrapParams });
      const bootstrap = await fetchJson<SceneBootstrapResponse>(bootstrapUrl, { params: bootstrapParams });
      if (disposed) return;

      setScenes(
        Array.isArray(bootstrap.scenes)
          ? (bootstrap.scenes as SceneBootstrap['scenes']).map((s) => ({ scene_id: s.scene_id, scene_name: s.scene_name ?? '' }))
          : [],
      );

      // 未指定场景 → 进入门厅，不加载任何 3D
      if (!selectedSceneId) {
        setView('launcher');
        return;
      }

      if (isEmptySceneBootstrap(bootstrap)) {
        setErrorMessage(bootstrap.message || '场景不存在');
        setView('error');
        return;
      }

      // 2. 加载指定场景
      const scene = bootstrap.scene;
      setCurrentSceneName(scene.scene_name || scene.scene_id);
      rememberSelectedSceneId(scene.scene_id);
      setMessage(i18n('viewer.loading.soonspace'));
      setLoadProgress(5);
      setLoadStage('setup');

      runtime = new SoonspaceRuntime();
      runtimeRef.current = runtime;
      await runtime.init(container!, scene.scene_id, (progress) => {
        if (disposed) return;
        if (progress.stage !== 'ready') setLoadStage(progress.stage);
        setMessage(progress.message || i18n('viewer.loading.soonspace'));
        if (typeof progress.percent === 'number') setLoadProgress(Math.max(5, Math.min(100, progress.percent)));
      });
      if (disposed) {
        await runtime.dispose();
        return;
      }

      manager = new PluginManager({
        viewer: runtime.getPluginHost(),
        persistence: localStoragePersistence(scene.scene_id),
        resources: {
          runtime,
          sceneId: scene.scene_id,
        },
      });
      for (const plugin of createDefaultPlugins()) {
        await manager.register(plugin);
      }
      if (disposed) {
        manager.disposeAll();
        await runtime.dispose();
        return;
      }

      setPluginManager(manager);
      setView('ready');
      setLoadProgress(100);
      setCurrentSceneId(scene.scene_id);
      setMessage(i18n('viewer.loading.done'));

      // 绑定镜头路径工具：读取/写入镜头视角 + 恢复该场景已保存的路径点
      initCameraPathTool(scene.scene_id, {
        getCameraViewpoint: () => runtimeRef.current?.getCameraViewpoint() ?? null,
        setCameraViewpoint: (viewpoint, enableTransition = true) =>
          runtimeRef.current?.setCameraViewpoint(viewpoint, enableTransition) ?? Promise.resolve(),
      });

      // 点击场景物体 → 显示信息卡；点击空白处关闭（多订阅，不影响可达性/连通性插件）
      setClickedObject(null);
      const unsubscribeClick = runtime.setSceneClickHandler((info) => {
        if (disposed) return;
        setClickedObject(info ? (info as ClickInfo) : null);
      });
      clickUnsubscribeRef.current = unsubscribeClick;
    }

    run().catch((error) => {
      if (!disposed) {
        setErrorMessage(error instanceof Error ? error.message : '场景加载失败');
        setView('error');
      }
    });

    return () => {
      disposed = true;
      clickUnsubscribeRef.current?.();
      clickUnsubscribeRef.current = null;
      disposeCameraPathTool();
      manager?.disposeAll();
      void runtime?.dispose();
      runtimeRef.current = null;
      setPluginManager(null);
      setCurrentSceneId('');
      containerRef.current?.replaceChildren();
    };
  }, [selectedSceneId, reloadKey]);

  const handleEnterScene = useCallback((sceneId: string) => {
    setLastSceneId(sceneId);
    setSelectedSceneId(sceneId);
  }, []);

  const handleExitToLauncher = useCallback(() => {
    // 保留 localStorage（门厅「最近使用」徽章），仅清除 URL 参数，避免刷新后强制重进场景
    updateSceneIdInLocation(null);
    setSelectedSceneId(null);
  }, []);

  const handleRetry = useCallback(() => {
    setReloadKey((k) => k + 1);
  }, []);

  /** 添加为镜头路径点：先飞向该物体，等过渡动画结束后读取当前视角存入路径点。 */
  const handleAddPathPoint = useCallback(async (info: ClickInfo): Promise<void> => {
    const runtime = runtimeRef.current;
    if (!runtime) throw new Error('场景未加载');
    const outId = info.out_instance_id ?? info.twins_instance_id;
    if (outId) {
      await runtime.flyToObject(outId);
      // 等待 flyToObj 过渡动画完成（约 1.5s），再读取稳定视角
      await new Promise((resolve) => setTimeout(resolve, 1600));
    }
    const added = window.__cameraPathTool?.add();
    if (!added) throw new Error('添加镜头路径点失败');
  }, []);

  const handleReloadList = useCallback(() => {
    setScenes([]);
    handleRetry();
  }, [handleRetry]);

  const showProgress = view === 'loading';

  return (
    <main className="viewerShell">
      <div ref={containerRef} className="viewerCanvas" />

      {/* 顶部应用栏：场景名 + 当前楼层 + 设备搜索 + 告警中心 + 切换 + 插件开关 */}
      {view === 'ready' && (
        <header className="appTopBar">
          <div className="appTopBar-left">
            <span className="appTopBar-dot" aria-hidden />
            <span className="appTopBar-name" title={currentSceneName}>
              {currentSceneName}
            </span>
            <span className="appTopBar-floor" title={currentStoriesLabel}>
              {currentStoriesLabel}
            </span>
            <span className="appTopBar-state">场景已就绪</span>
          </div>
          <div className="appTopBar-right">
            <DeviceSearch sceneId={currentSceneId} />
            <AlarmCenter sceneId={currentSceneId} />
            <button
              type="button"
              className={'appTopBar-btn' + (showSettings ? ' on' : '')}
              onClick={() => setShowSettings((v) => !v)}
              aria-pressed={showSettings}
              title="相机操控设置"
            >
              设置
            </button>
            <button
              type="button"
              className={'appTopBar-btn' + (showCameraPath ? ' on' : '')}
              onClick={() => setShowCameraPath((v) => !v)}
              aria-pressed={showCameraPath}
              title="镜头路径标注工具：保存视角、播放镜头动画"
            >
              镜头路径
            </button>
            <button
              type="button"
              className={'appTopBar-btn' + (showPanel ? ' on' : '')}
              disabled={!pluginManager}
              onClick={() => setShowPanel((v) => !v)}
              aria-pressed={showPanel}
              title={i18n('viewer.plugin.title')}
            >
              {i18n('viewer.plugin.button')}
            </button>
            <button type="button" className="appTopBar-btn appTopBar-btn--primary" onClick={handleExitToLauncher}>
              切换场景
            </button>
          </div>
        </header>
      )}

      {pluginManager && showPanel && view === 'ready' && <PluginPanel manager={pluginManager} />}

      {view === 'ready' && keyHintsEnabled && <KeyHintOverlay enabled={keyHintsEnabled} resetEnabled={resetEnabled} />}

      {view === 'ready' && showCameraPath && <CameraPathPanel />}

      {view === 'ready' && clickedObject && (
        <SceneObjectInfoCard
          sceneId={currentSceneId}
          info={clickedObject}
          onClose={() => setClickedObject(null)}
          onAddPathPoint={(info) => void handleAddPathPoint(info)}
        />
      )}

      {view === 'ready' && (
        <CameraSettingsPopup
          open={showSettings}
          keyHintsEnabled={keyHintsEnabled}
          resetEnabled={resetEnabled}
          onKeyHintsChange={setKeyHintsEnabled}
          onResetEnabledChange={setResetEnabled}
          onClose={() => setShowSettings(false)}
        />
      )}

      {view === 'launcher' && (
        <SceneLauncher
          scenes={scenes}
          lastSceneId={lastSceneId}
          error={null}
          loading={false}
          onEnter={handleEnterScene}
          onRetry={handleReloadList}
        />
      )}

      {view === 'loading' && (
        <div className="status loading">
          <div className="statusTitle">{message}</div>
          {showProgress && (
            <>
              <div className="statusMeta">
                <span>{loadStage === 'loading' ? i18n('viewer.stage.loading') : i18n('viewer.stage.setup')}</span>
                <span>{Math.max(0, Math.min(100, loadProgress)) + '%'}</span>
              </div>
              <div className="statusProgress" aria-hidden>
                <span style={{ width: Math.max(0, Math.min(100, loadProgress)) + '%' }} />
              </div>
            </>
          )}
          <button type="button" className="statusCancel" onClick={handleExitToLauncher}>
            返回场景列表
          </button>
        </div>
      )}

      {view === 'error' && (
        <div className="status error">
          <div className="statusTitle">加载失败</div>
          <div className="statusDetail">{errorMessage}</div>
          <div className="statusActions">
            <button type="button" className="statusActionBtn statusActionBtn--primary" onClick={handleRetry}>
              重试
            </button>
            {(selectedSceneId || scenes.length > 0) && (
              <button type="button" className="statusActionBtn" onClick={handleExitToLauncher}>
                返回场景列表
              </button>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
