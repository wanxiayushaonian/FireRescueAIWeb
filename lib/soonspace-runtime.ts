'use client';

import type {
  CustomFunctionUStudioSdk,
  LayerApplyParams,
  LayerCommandState,
  LayerState,
  Semantic2dClickInfo,
  UStudioSdk,
  ViewModeParams,
} from 'ustudio-sdk';
import { X_APP_KEY } from './app-key';
import { i18n } from './i18n';
import { panelList, panelSetVisible, type PanelSetVisibleParams } from './generated-panel-runtime';
import { showUStudioVideo } from './video-runtime';
import type { SceneTreeNode } from './ustudio';
import type { PluginHost } from './scene-plugins/types';

type AnyObject = Record<string, any>;
type SceneSdk = CustomFunctionUStudioSdk<UStudioSdk>;
type RenderOrigin = { longitude: number; latitude: number; altitude: number };

/** 镜头视角：位置、目标点、缩放（与 soonspacejs CameraViewpointData 对齐）。 */
export type CameraViewpoint = {
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
  zoom: number;
};

export type SoonspaceInitProgress = {
  stage: 'setup' | 'loading' | 'ready';
  message: string;
  percent?: number;
};

export type SoonspaceSemanticClickInfo = Semantic2dClickInfo & Record<string, unknown>;

export type ScriptMethods = {
  fly: (id: unknown) => unknown;
  heighLight: (id: unknown, color?: string | number) => unknown;
  highlight: (id: unknown, color?: string | number) => unknown;
  cancelHeighLight: (id: unknown) => unknown;
  clearHighlight: (id: unknown) => unknown;
  hide: (id: unknown) => unknown;
  show: (id: unknown) => unknown;
  setOpacity: (id: unknown, opacity: unknown) => unknown;
  unSetOpacity: (id: unknown) => unknown;
  drawRoute: (...args: unknown[]) => unknown;
  deleteRoute: (id: unknown) => unknown;
  pathMove: (id: unknown, path: unknown) => unknown;
  pathRestore: (id: unknown) => unknown;
  setScene: (params?: LayerApplyParams) => Promise<LayerState>;
  getSceneSetState: () => LayerCommandState;
  gisSetVisible: (visible: boolean) => Promise<{ visible: boolean }>;
  virtualRouteSetVisible: (routeIds: string | string[], visible: boolean) => Promise<unknown>;
  polygonSetVisible: (polygonIds: string | string[], visible: boolean) => Promise<unknown>;
  panelList: typeof panelList;
  panelSetVisible: (params: PanelSetVisibleParams) => ReturnType<typeof panelSetVisible>;
  showVideo: (params?: unknown) => unknown;
};

function sdkHostUrl(): string {
  return (process.env.NEXT_PUBLIC_USTUDIO_BASE || process.env.NEXT_PUBLIC_WS_URL || 'https://fc.xwbuilders.com')
    .trim()
    .replace(/\/+$/, '');
}

function sdkLocale(): string {
  return process.env.NEXT_PUBLIC_LOCALE === 'en' ? 'en-US' : 'zh-CN';
}

const showVideo = showUStudioVideo;

function normalizeTree(treeData: unknown): SceneTreeNode[] {
  if (Array.isArray(treeData)) return treeData as SceneTreeNode[];
  if (treeData && typeof treeData === 'object') return [treeData as SceneTreeNode];
  return [];
}

function progressStage(progress: { status?: string; percent?: number; message?: string }): SoonspaceInitProgress['stage'] {
  if (progress.status === 'complete') return 'ready';
  if (progress.status === 'loading') return 'loading';
  return 'setup';
}

function mapProgress(progress: { status?: string; percent?: number; message?: string }): SoonspaceInitProgress {
  const stage = progressStage(progress);
  const message = stage === 'ready'
    ? i18n('viewer.loading.done')
    : stage === 'loading'
      ? i18n('viewer.loading.scene')
      : i18n('viewer.loading.soonspace');
  return { stage, message, percent: progress.percent };
}

export class SoonspaceRuntime {
  private sdk: SceneSdk | null = null;
  private sceneId = '';
  private sceneClickHandlers = new Set<(info: SoonspaceSemanticClickInfo | null, event?: unknown) => void>();
  private sceneClickBridgeInstalled = false;
  private sceneClick2dBound: ((info: unknown, event: unknown) => void) | null = null;
  private sceneClickModelBound: ((param: AnyObject) => void) | null = null;
  private sceneClickSceneBound: ((param: AnyObject) => void) | null = null;
  private pendingRenderOrigin: RenderOrigin | null = null;
  private cps: AnyObject | null = null;
  private ssp: AnyObject | null = null;
  private ownsSsp = false;
  private originalCpsPresetGis?: () => Promise<void>;
  private wasdKeys = new Set<string>();
  private wasdRaf = 0;
  private wasdLast = 0;
  private wasdCleanup: (() => void) | null = null;
  private wasdSpeed = 30;
  private wasdShiftDown = false;
  private resetEnabled = true;

  async init(container: HTMLElement, sceneId: string, onProgress?: (progress: SoonspaceInitProgress) => void): Promise<void> {
    this.sceneId = sceneId;
    const { createUStudioSdk } = await import('ustudio-sdk');
    const sdk = createUStudioSdk();
    this.sdk = sdk;
    await sdk.init({
      config: { hostUrl: sdkHostUrl(), appKey: X_APP_KEY },
      locale: { lang: sdkLocale() },
      commandBridge: { panelList, panelSetVisible, showVideo },
    });

    // 外部创建 SoonSpace 实例并配置 Draco 解码路径，避免 SDK 内部创建时缺少 Draco 配置导致模型加载失败。
    const SoonSpace = (await import('soonspacejs')).default;
    const ssp = new SoonSpace({
      el: container,
      options: {
        background: { color: '#0b1120', alpha: false },
        showGrid: false,
        showInfo: true,
        hoverEnabled: false,
        showViewHelper: true,
      },
    });
    ssp.setModelDracoDecoderPath('/draco/');
    // 相机控制手感：SDK 未暴露相机控制 API，通过 soonspacejs 公开的 setControlsOptions 调整
    // （透传 camera-controls 参数，仅影响操控手感，不改场景/渲染逻辑）
    ;(ssp as unknown as { setControlsOptions?: (options: Record<string, unknown>) => unknown }).setControlsOptions?.({
      dollySpeed: 0.55, // 滚轮缩放灵敏度（默认 0.2，偏慢）
      azimuthRotateSpeed: 1.2, // 水平旋转速度
      polarRotateSpeed: 1.0, // 垂直旋转速度
      smoothTime: 0.12, // 阻尼平滑（默认 0.25，松手后更跟手）
      maxPolarAngle: Math.PI / 2 + (10 * Math.PI) / 180, // 俯仰角上限 ≈100°，避免转到地下
      minDistance: 0.5, // 最小缩放距离，防止穿模
      maxDistance: 2000, // 最大缩放距离，防止无限拉远
      restThreshold: 0.01, // 更快判定相机静止
    });
    this.ssp = ssp as unknown as AnyObject;
    this.ownsSsp = true;

    await sdk.initScene(this.sceneId, {
      ssp: ssp as unknown as NonNullable<import('ustudio-sdk').InitSceneOptions['ssp']>,
      onProgress(progress: { status?: string; percent?: number; message?: string }) {
        onProgress?.(mapProgress(progress));
      },
      onSemantic2dClick: (info: unknown, event: unknown) => {
        const normalized = info as SoonspaceSemanticClickInfo | null;
        for (const fn of this.sceneClickHandlers) {
          try {
            fn(normalized, event);
          } catch (error) {
            console.error('[soonspace-runtime] scene click handler threw', error);
          }
        }
      },
    });
    this.ssp = this.safeGetSoonSpace();
    this.cps = this.resolveCpsManager();
    this.installWindowSceneBridge();
    this.enableWASDCameraControls();
  }

  async dispose(): Promise<void> {
    const sdk = this.sdk;
    const ssp = this.ownsSsp ? this.ssp : null;
    const sceneId = this.sceneId;
    this.disableWASDCameraControls();
    this.sdk = null;
    this.ssp = null;
    this.ownsSsp = false;
    this.sceneId = '';
    if (typeof window !== 'undefined') {
      if (sdk && window.__scene === sdk) delete window.__scene;
      if (sceneId && window.__sceneId === sceneId) delete window.__sceneId;
      try {
        const topWin = window.top;
        if (topWin && topWin !== window) {
          if (sdk && topWin.__scene === sdk) delete topWin.__scene;
          if (sceneId && topWin.__sceneId === sceneId) delete topWin.__sceneId;
        }
      } catch {
        // ignore cross-origin top frame
      }
      window.dispatchEvent(new CustomEvent('ustudio:scene', { detail: { sceneId: '' } }));
    }
    await sdk?.destroy();
    try {
      await ssp?.dispose?.();
    } catch {
      // ignore ssp dispose errors
    }
  }

  getSdk(): SceneSdk | null {
    return this.sdk;
  }

  getSsp(): AnyObject | null {
    return this.ssp ?? this.safeGetSoonSpace();
  }

  getCps(): AnyObject | null {
    return this.cps ?? this.resolveCpsManager();
  }

  getPluginHost(): PluginHost {
    const ssp = this.getSsp();
    return {
      el: (ssp?.el ?? (typeof document !== 'undefined' ? document.body : null)) as HTMLElement,
      scene: ssp?.scene,
      render: () => this.render(),
      getObjectById: (id: string) => this.getObjectById(id),
    };
  }

  async loadUserAddedInstances(): Promise<unknown> {
    return this.sdk?.getPlacementState?.() ?? { placed: [], skipped: [], apiModelIds: [] };
  }

  clearUserAddedInstances(): void {}

  getUserPlacementResult(): unknown {
    return this.sdk?.getPlacementState?.() ?? { placed: [], skipped: [], apiModelIds: [] };
  }

  /**
   * 注册场景点击监听（多订阅）：多个调用方可以同时注册，互不覆盖。
   * 返回取消订阅函数。底层回调只注册一次，统一分发给所有监听者。
   *
   * 数据来源分两条：
   * - 2D 语义点击（SDK `setSemantic2dClickHandler`）：仅在 2D 重绘数据存在时触发；
   * - 3D 模型点击（soonspacejs `signals.modelClick` / `signals.sceneClick`）：
   *   纯 3D 模式下 SDK 语义点击不触发，这里直接订阅 soonspacejs 的 3D 拾取信号兜底。
   *   点击场景对象时 modelClick 参数 `target.sid` 即对象的 out_instance_id。
   */
  setSceneClickHandler(handler: (info: SoonspaceSemanticClickInfo | null, event?: unknown) => void): () => void {
    this.sceneClickHandlers.add(handler);
    if (!this.sceneClickBridgeInstalled) {
      this.sceneClickBridgeInstalled = true;
      this.sceneClick2dBound = (info: unknown, event: unknown) => {
        const normalized = info as SoonspaceSemanticClickInfo | null;
        for (const fn of this.sceneClickHandlers) {
          try {
            fn(normalized, event);
          } catch (error) {
            console.error('[soonspace-runtime] scene click handler threw', error);
          }
        }
      };
      this.sdk?.setSemantic2dClickHandler?.(this.sceneClick2dBound);

      // 3D 兜底：订阅 soonspacejs 自身拾取信号（不依赖 2D 重绘数据）
      const ssp = this.getSsp();
      if (ssp?.signals) {
        this.sceneClickModelBound = (param: AnyObject) => {
          const target = param?.target as AnyObject | undefined;
          const sid = typeof target?.sid === 'string' && target.sid ? target.sid : '';
          if (!sid) return;
          const info: SoonspaceSemanticClickInfo = {
            twins_identifier: typeof target?.stype === 'string' ? target.stype : 'Model',
            out_instance_id: sid,
            twins_instance_id: '',
            story_id: '',
          };
          for (const fn of this.sceneClickHandlers) {
            try {
              fn(info, param?.event);
            } catch (error) {
              console.error('[soonspace-runtime] scene click handler threw', error);
            }
          }
        };
        this.sceneClickSceneBound = (param: AnyObject) => {
          for (const fn of this.sceneClickHandlers) {
            try {
              fn(null, param?.event);
            } catch (error) {
              console.error('[soonspace-runtime] scene click handler threw', error);
            }
          }
        };
        ssp.signals.modelClick?.add?.(this.sceneClickModelBound);
        ssp.signals.sceneClick?.add?.(this.sceneClickSceneBound);
      }
    }
    return () => this.clearSceneClickHandler(handler);
  }

  clearSceneClickHandler(handler?: (info: SoonspaceSemanticClickInfo | null, event?: unknown) => void): void {
    if (handler) {
      this.sceneClickHandlers.delete(handler);
    } else {
      this.sceneClickHandlers.clear();
    }
    if (this.sceneClickHandlers.size === 0 && this.sceneClickBridgeInstalled) {
      this.sceneClickBridgeInstalled = false;
      if (this.sceneClick2dBound) {
        this.sdk?.clearSemantic2dClickHandler?.();
        this.sceneClick2dBound = null;
      }
      const ssp = this.getSsp();
      if (ssp?.signals) {
        if (this.sceneClickModelBound) {
          ssp.signals.modelClick?.remove?.(this.sceneClickModelBound);
          this.sceneClickModelBound = null;
        }
        if (this.sceneClickSceneBound) {
          ssp.signals.sceneClick?.remove?.(this.sceneClickSceneBound);
          this.sceneClickSceneBound = null;
        }
      }
    }
  }

  /** 相机飞向指定物体（soonspacejs flyToObj，带过渡动画）。 */
  async flyToObject(objectId: string): Promise<void> {
    const ssp = this.getSsp();
    if (!ssp) throw new Error('当前引擎未就绪');
    const obj = ssp?.getObjectById?.(objectId);
    if (!obj) {
      throw new Error('未找到可飞行定位的对象');
    }
    if (typeof ssp.flyToObj === 'function') {
      await ssp.flyToObj(obj, undefined, { enableTransition: true });
      this.render();
      return;
    }
    if (typeof ssp.flyTo === 'function') {
      const box = obj.box3 ?? obj.geometry?.boundingBox;
      await ssp.flyTo(box?.center ?? obj.position, undefined, { enableTransition: true });
      this.render();
      return;
    }
    throw new Error('当前引擎不支持飞行定位');
  }

  syncUserAddedInstancesDisplay(patch: AnyObject = {}): unknown {
    return this.sdk?.syncUserInstancePlacementDisplay?.(patch) ?? { placed: [], skipped: [], apiModelIds: [] };
  }

  async setViewMode(params: unknown, treeData: SceneTreeNode | SceneTreeNode[], selectedStoryIds?: string[], selectedBuildingIds?: string[]): Promise<void> {
    await this.sdk?.setViewMode(params as ViewModeParams | ViewModeParams[], normalizeTree(treeData) as any, selectedStoryIds, selectedBuildingIds);
  }

  showGis(): void {
    void this.setGisVisible(true);
  }

  hideGis(): void {
    void this.setGisVisible(false);
  }

  isGisAvailable(): boolean {
    const state = this.sdk?.getSceneSetState?.();
    if (typeof state?.gis?.available === 'boolean') return state.gis.available;
    const ssp = this.getSsp();
    return !!(
      ssp?.setGisVisible ||
      ssp?.showGis ||
      ssp?.hideGis ||
      this.getCps()?.terrainTilesRenderer
    );
  }

  async setGisVisible(visible: boolean): Promise<void> {
    if (this.sdk) {
      try {
        await this.sdk.gisSetVisible(visible);
        this.applyPendingRenderOrigin();
        return;
      } catch (error) {
        if (!this.setGisVisibleOnCps(visible)) throw error;
        this.applyPendingRenderOrigin();
        return;
      }
    }
    if (visible && this.originalCpsPresetGis) await this.originalCpsPresetGis();
    this.setGisVisibleOnCps(visible);
    this.applyPendingRenderOrigin();
  }

  setRenderOrigin(longitude: number, latitude: number, altitude: number): void {
    this.pendingRenderOrigin = { longitude, latitude, altitude };
    this.applyPendingRenderOrigin();
  }

  showLabels(treeData?: SceneTreeNode | SceneTreeNode[], outInstanceIds?: string[], storyIds?: string[]): void {
    this.sdk?.showTwinsNameLabels?.(normalizeTree(treeData) as any, outInstanceIds, storyIds);
  }

  hideLabels(): void {
    this.sdk?.hideTwinsNameLabels?.();
  }

  drawReachableRoutes(edges: AnyObject[], treeData: SceneTreeNode | SceneTreeNode[], yExtend?: boolean, mode2d?: boolean): unknown {
    return this.sdk?.drawReachableRoutes?.(edges as any, normalizeTree(treeData) as any, !!yExtend, !!mode2d);
  }

  clearReachableRoutes(): void {
    this.sdk?.clearReachableRoutes?.();
  }

  drawConnectivityRoutes(edges: AnyObject[], treeData: SceneTreeNode | SceneTreeNode[], yExtend?: boolean): unknown {
    return this.sdk?.drawConnectivityRoutes?.(edges as any, normalizeTree(treeData) as any, !!yExtend);
  }

  clearConnectivityRoutes(): void {
    this.sdk?.clearConnectivityRoutes?.();
  }

  highlightObject(id: string, color?: string | number): boolean {
    this.sdk?.heighLight?.(id, color);
    return true;
  }

  clearObjectHighlight(id: string): void {
    this.sdk?.cancelHeighLight?.(id);
  }

  drawVirtualRoute(detail: AnyObject, options?: AnyObject): Promise<unknown> | undefined {
    return this.sdk?.drawVirtualRoute?.(detail as any, options as any);
  }

  setVirtualRouteVisible(routeId: string, visible: boolean): unknown {
    return this.sdk?.setVirtualRouteVisible?.(routeId, visible);
  }

  clearVirtualRoute(routeId: string): void {
    this.sdk?.clearVirtualRoute?.(routeId);
  }

  drawVirtualPolygon(detail: AnyObject, options?: AnyObject): Promise<unknown> | undefined {
    return this.sdk?.drawVirtualPolygon?.(detail as any, options as any);
  }

  setVirtualPolygonVisible(polygonId: string, visible: boolean): unknown {
    return this.sdk?.setVirtualPolygonVisible?.(polygonId, visible);
  }

  clearVirtualPolygon(polygonId: string): void {
    this.sdk?.clearVirtualPolygon?.(polygonId);
  }

  getObjectById(id: string): unknown {
    return this.sdk?.getObjectById?.(id) ?? this.getSsp()?.getObjectById?.(id) ?? null;
  }

  createScriptMethods(): ScriptMethods {
    const call = (name: keyof ScriptMethods) => (...args: unknown[]) => {
      const sdk = this.sdk as unknown as Record<string, (...values: unknown[]) => unknown> | null;
      return sdk?.[name]?.(...args);
    };
    return {
      fly: call('fly'),
      heighLight: call('heighLight'),
      highlight: call('heighLight'),
      cancelHeighLight: call('cancelHeighLight'),
      clearHighlight: call('cancelHeighLight'),
      hide: call('hide'),
      show: call('show'),
      setOpacity: call('setOpacity'),
      unSetOpacity: call('unSetOpacity'),
      drawRoute: call('drawRoute'),
      deleteRoute: call('deleteRoute'),
      pathMove: call('pathMove'),
      pathRestore: call('pathRestore'),
      setScene: (params = {}) => this.sdk!.setScene(params),
      getSceneSetState: () => this.sdk!.getSceneSetState(),
      gisSetVisible: (visible) => this.sdk!.gisSetVisible(visible),
      virtualRouteSetVisible: (routeIds, visible) => this.sdk!.virtualRouteSetVisible(routeIds, visible),
      polygonSetVisible: (polygonIds, visible) => this.sdk!.polygonSetVisible(polygonIds, visible),
      panelList,
      panelSetVisible,
      showVideo,
    };
  }

  render(): void {
    const ssp = this.getSsp();
    if (typeof ssp?.requestRender === 'function') ssp.requestRender();
    else ssp?.render?.();
  }

  private resolveCpsManager(): AnyObject | null {
    const sdkAny = this.sdk as unknown as AnyObject | null;
    const direct = sdkAny?.getCpsManager?.() ?? sdkAny?.cpsManager ?? sdkAny?.cps;
    if (direct) return direct as AnyObject;
    const ssp = this.getSsp() as AnyObject | null;
    const names = ['cpsSoonmanager', 'cpsSoonmanagerPlugin'];
    for (const name of names) {
      const existing = ssp?.getPlugin?.(name) ?? ssp?.plugins?.[name] ?? ssp?.pluginMap?.get?.(name);
      if (existing) return existing as AnyObject;
    }
    return null;
  }

  private setGisVisibleOnCps(visible: boolean): boolean {
    const terrain = this.getCps()?.terrainTilesRenderer;
    if (!terrain) return false;
    if (visible) terrain.enable?.();
    else terrain.disable?.();
    this.render();
    return true;
  }

  private safeGetSoonSpace(): AnyObject | null {
    try {
      return this.sdk?.getSoonSpace?.() as AnyObject;
    } catch {
      return this.ssp;
    }
  }

  private applyPendingRenderOrigin(): void {
    const origin = this.pendingRenderOrigin;
    if (!origin) return;
    const cps = this.getCps();
    const atmosphere = cps?.atmospherePlugin;
    if (atmosphere) {
      atmosphere.longitude = origin.longitude;
      atmosphere.latitude = origin.latitude;
      atmosphere.altitude = origin.altitude;
    }
    const gisSettings = cps?.metaData?.gisSettings;
    if (gisSettings) {
      gisSettings.longitude = origin.longitude;
      gisSettings.latitude = origin.latitude;
      gisSettings.altitude = origin.altitude;
    }
    cps?.terrainTilesRenderer?.invalidate?.(origin.longitude, origin.latitude, origin.altitude);
    this.render();
  }

  private installWindowSceneBridge(): void {
    if (typeof window === 'undefined' || !this.sdk) return;
    window.__scene = this.sdk;
    window.__sceneId = this.sceneId;
    try {
      const topWin = window.top;
      if (topWin && topWin !== window) {
        topWin.__scene = this.sdk;
        topWin.__sceneId = this.sceneId;
      }
    } catch {
      // ignore cross-origin top frame
    }
    window.dispatchEvent(new CustomEvent('ustudio:scene', { detail: { sceneId: this.sceneId } }));
  }

  /**
   * WASD 键盘相机操控：W/S 前后、A/D 左右平移、E/Q 上升下降。
   * 通过 soonspacejs 公开的 camera-controls 实例的 forward / truck / elevate 方法实现，
   * 不直接操作 three 对象，也不改动 SDK 场景状态。
   * 输入框 / 文本域 / 下拉框聚焦时不触发，避免打字时相机乱动。
   */
  enableWASDCameraControls(): void {
    if (typeof window === 'undefined' || this.wasdRaf) return;
    this.wasdKeys.clear();

    const isEditableTarget = (target: EventTarget | null): boolean => {
      const el = target as HTMLElement | null;
      if (!el || !el.tagName) return false;
      return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
    };

    const onKeyDown = (e: KeyboardEvent): void => {
      if (isEditableTarget(e.target)) return;
      const key = e.key.toLowerCase();
      if (key === 'shift') {
        this.wasdShiftDown = true;
        return;
      }
      if (['w', 'a', 's', 'd', 'e', 'q'].includes(key)) {
        this.wasdKeys.add(key);
        if (!e.ctrlKey && !e.metaKey && !e.altKey) e.preventDefault();
      } else if (key === 'r' && this.resetEnabled) {
        if (e.repeat) return; // 忽略按住连发，避免反复重置
        const controls = this.getSsp()?.controls as { reset?: (enableTransition?: boolean) => unknown } | undefined;
        void controls?.reset?.();
        e.preventDefault();
      }
    };
    const onKeyUp = (e: KeyboardEvent): void => {
      const key = e.key.toLowerCase();
      if (key === 'shift') {
        this.wasdShiftDown = false;
        return;
      }
      this.wasdKeys.delete(key);
    };
    const onBlur = (): void => {
      this.wasdKeys.clear();
      this.wasdShiftDown = false;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    this.wasdCleanup = () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };

    // 记录场景加载完成时的初始视角，供 R 键重置使用
    (this.getSsp()?.controls as { saveState?: () => void } | undefined)?.saveState?.();

    this.wasdLast = performance.now();
    const loop = (now: number): void => {
      this.wasdRaf = requestAnimationFrame(loop);
      if (this.wasdKeys.size === 0) {
        this.wasdLast = now;
        return;
      }
      const dt = Math.min(0.1, (now - this.wasdLast) / 1000);
      this.wasdLast = now;
      const controls = this.getSsp()?.controls as
        | { forward: (d: number) => unknown; truck: (x: number, y: number) => unknown; elevate: (h: number) => unknown }
        | undefined;
      if (!controls) return;
      // 按住 Shift 时降速（约 1/3），方便精细定位镜头
      const speed = this.wasdSpeed * dt * (this.wasdShiftDown ? 0.34 : 1);
      if (this.wasdKeys.has('w')) void controls.forward(speed);
      if (this.wasdKeys.has('s')) void controls.forward(-speed);
      if (this.wasdKeys.has('d')) void controls.truck(speed, 0);
      if (this.wasdKeys.has('a')) void controls.truck(-speed, 0);
      if (this.wasdKeys.has('e')) void controls.elevate(speed);
      if (this.wasdKeys.has('q')) void controls.elevate(-speed);
    };
    this.wasdRaf = requestAnimationFrame(loop);
  }

  /** 开关镜头重置快捷键（R 键回初始视角）。 */
  setCameraResetEnabled(enabled: boolean): void {
    this.resetEnabled = enabled;
  }

  /** 读取当前镜头视角（位置/目标点/缩放）。SDK 未就绪或引擎无此能力时返回 null。 */
  getCameraViewpoint(): CameraViewpoint | null {
    try {
      const vp = this.getSsp()?.getCameraViewpoint?.() as
        | { position?: { x: number; y: number; z: number }; target?: { x: number; y: number; z: number }; zoom?: number }
        | undefined;
      if (!vp?.position || !vp.target) return null;
      return {
        position: { x: vp.position.x, y: vp.position.y, z: vp.position.z },
        target: { x: vp.target.x, y: vp.target.y, z: vp.target.z },
        zoom: typeof vp.zoom === 'number' && Number.isFinite(vp.zoom) ? vp.zoom : 1,
      };
    } catch {
      return null;
    }
  }

  /** 设置镜头视角（带平滑过渡动画）。 */
  async setCameraViewpoint(viewpoint: CameraViewpoint, enableTransition = true): Promise<void> {
    const ssp = this.getSsp();
    if (!ssp?.setCameraViewpoint) throw new Error('当前引擎不支持镜头视角控制');
    await ssp.setCameraViewpoint(
      { position: viewpoint.position, target: viewpoint.target, zoom: viewpoint.zoom },
      enableTransition,
    );
    this.render();
  }

  disableWASDCameraControls(): void {
    if (this.wasdRaf) {
      cancelAnimationFrame(this.wasdRaf);
      this.wasdRaf = 0;
    }
    this.wasdKeys.clear();
    this.wasdCleanup?.();
    this.wasdCleanup = null;
  }
}
