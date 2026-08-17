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
import type { SceneTreeNode } from './ustudio';

type AnyObject = Record<string, any>;
type SceneSdk = CustomFunctionUStudioSdk<UStudioSdk>;
type RenderOrigin = { longitude: number; latitude: number; altitude: number };
type SceneCounts = { objects: number; meshes: number; vertices: number };

/** 性能统计数据 */
export type PerfStats = {
  /** 场景加载耗时（毫秒） */
  loadMs: number | null;
  /** 当前帧 draw calls */
  drawCalls: number;
  /** 当前帧三角形数量 */
  triangles: number;
  /** 场景顶点总数 */
  vertices: number;
  /** 场景物体总数 */
  objects: number;
  /** 场景网格总数 */
  meshes: number;
  /** 当前像素比 */
  pixelRatio: number;
  /** 阴影是否开启 */
  shadowOn: boolean;
  /** SMAA 是否开启 */
  smaaOn: boolean;
  /** BVH 是否就绪 */
  bvhReady: boolean;
  /** BVH 是否正在计算 */
  bvhRunning: boolean;
  /** 是否空闲(>1s 无真实渲染,由 postRender 信号判断;fps 本身由前端 rAF 测) */
  idle: boolean;
};

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

/**
 * hover 拾取结果。由 mouseMove + 自管 raycast 产出(不依赖 soonspacejs 的 modelHover 信号,
 * 因为该信号只在命中对象 stype==="Model" 时触发,CPS 的墙/Space 等不会触发)。
 *
 * sids:命中对象父链上的 sid 序列(最近优先)。最近的通常是构件(Model)叶子,其祖先 Group
 * 才对应语义树里的 Wall/Story。组件按序在反向索引里找第一个命中的 → 得到楼层。
 */
export type HoverPickInfo = {
  sids: string[];
  clientX: number;
  clientY: number;
  /** 按距离排序的前几个命中各自的父链 sid(最近优先)。点击信息卡用它跨过纯结构遮挡
   *  (墙/楼板挡在设备前时,靠后的链才是被点的设备);兼容旧消费方,sids = hitChains[0]。 */
  hitChains?: string[][];
} | null;

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
  // 模板遗留 stub:迁壳后业务面板/视频改走 src 的 DraggablePanel/VideoPlaybackPanel,
  // 平台 WS 推送的面板/视频命令暂为 stub(避免调失效函数)。
  panelList: () => unknown[];
  panelSetVisible: (params?: { id?: unknown; name?: unknown; visible?: unknown }) => Promise<unknown>;
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

// 模板遗留 stub:平台 WS 推送的面板/视频命令暂为空实现(迁壳后改走 src 的 DraggablePanel/VideoPlaybackPanel)。
const stubPanelList = () => [] as unknown[];
const stubPanelSetVisible = async () => ({}) as never;
const stubShowVideo = () => undefined;

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

/**
 * 生成天空渐变 PNG dataURL(垂直:顶→地平线 + 右上太阳光晕)。
 * 512×256 一次性生成;渲染时 scene.background 全屏贴图仅一次采样,零逐像素散射开销。
 * 非浏览器环境(SSR/测试)返回空串,调用方忽略。
 */
function buildSkyGradientDataUrl(top: string, horizon: string, sunColor: string): string {
  if (typeof document === 'undefined') return '';
  const W = 512;
  const H = 256;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, top);
  grad.addColorStop(0.55, '#60a5fa');
  grad.addColorStop(1, horizon);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  // 太阳光晕(右上;径向渐变,0 成本逐帧,只有一次绘制)
  const sunX = W * 0.72;
  const sunY = H * 0.2;
  const sun = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, H * 0.45);
  sun.addColorStop(0, sunColor);
  sun.addColorStop(0.35, 'rgba(253, 230, 138, 0.35)');
  sun.addColorStop(1, 'rgba(253, 230, 138, 0)');
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, W, H);
  return canvas.toDataURL('image/png');
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
  private hoverPickHandlers = new Set<(info: HoverPickInfo) => void>();
  private hoverPickInstalled = false;
  /** 拾取门控:上次已处理坐标(NaN=无)。微动(<6px)跳过全场景 raycast。 */
  private hoverPickLastX = Number.NaN;
  private hoverPickLastY = Number.NaN;
  private hoverPickBound: ((event: AnyObject) => void) | null = null;
  private hoverPickRaf = 0;
  private hoverPickLastEvent: AnyObject | null = null;
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

  // 性能优化相关
  private initStartedAt = 0;
  private loadMs: number | null = null;
  private sceneCounts: SceneCounts = { objects: 0, meshes: 0, vertices: 0 };
  private bvhReady = false;
  private bvhRunning = false;
  private perfPollCount = 0;
  /** 最近真实渲染帧间隔窗口(ms,供 postRender 统计渲染帧率,区别于 rAF 空转) */
  private renderIntervals: number[] = [];
  private lastRenderAt = 0;
  private warnedNoScene = false;

  async init(container: HTMLElement, sceneId: string, onProgress?: (progress: SoonspaceInitProgress) => void): Promise<void> {
    this.sceneId = sceneId;
    const { createUStudioSdk } = await import('ustudio-sdk');
    const sdk = createUStudioSdk();
    this.sdk = sdk;
    await sdk.init({
      config: { hostUrl: sdkHostUrl(), appKey: X_APP_KEY, timeoutMs: 60000, maxAttempts: 3 },
      locale: { lang: sdkLocale() },
      // TODO(增量后续):重接到原型 UI——panelList/panelSetVisible → 原型 DraggablePanel 系统,
      // showVideo → 原型 VideoPlaybackPanel。迁壳后旧 UI(generated-panel-runtime / UStudioVideoDialog)
      // 已不挂载,先 stub 避免平台推送这些命令时调失效函数。
      commandBridge: {
        panelList: () => [],
        panelSetVisible: async () => ({}) as never,
        showVideo: () => {},
      },
    });

    // 外部创建 SoonSpace 实例并配置 Draco 解码路径，避免 SDK 内部创建时缺少 Draco 配置导致模型加载失败。
    const SoonSpace = (await import('soonspacejs')).default;
    const ssp = new SoonSpace({
      el: container,
      options: {
        background: { color: '#0b1120', alpha: false },
        showGrid: false,
        showInfo: false, // 关闭 canvas 性能叠加(objects/meshes/frametable),改由 ScenePerfWidget DOM 面板显示,避免位置重叠遮挡
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
    this.applyPerfDefaults();
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

  /**
   * 天空背景 — 轻量方案:canvas 渐变贴图作为 scene.background。
   *
   * 对比 three.js Sky(逐像素大气散射 Shader + 场景大网格):
   * - 渲染成本:仅一次全屏背景贴图绘制(纹理 512×256,一次性生成),无逐像素散射着色器;
   * - 无场景对象:不占 BVH/不参与拾取/悬停 raycast(three Sky 盒体会被 raycast 命中,干扰点选);
   * - 不动场景灯光,不增加 draw call 级负担。
   *
   * enabled=true 生成「顶→地平线」渐变 + 右上太阳光晕;enabled=false 恢复原深色背景(#0b1120)。
   * 场景重建(runtime 重 init)后需重新调用,调用方在 view ready 时回放。
   */
  setSceneSky(enabled: boolean, options?: { top?: string; horizon?: string; sunColor?: string }): unknown {
    const ssp = this.getSsp() as unknown as {
      setBackgroundImage?: (file: string) => unknown;
      setBackgroundColor?: (color: string) => unknown;
    } | null;
    if (!ssp?.setBackgroundImage || !ssp?.setBackgroundColor) return null;
    if (!enabled) return ssp.setBackgroundColor('#0b1120'); // 恢复原深色背景
    const { top = '#2563eb', horizon = '#bfdbfe', sunColor = '#fef3c7' } = options ?? {};
    return ssp.setBackgroundImage(buildSkyGradientDataUrl(top, horizon, sunColor));
  }

  getCps(): AnyObject | null {
    return this.cps ?? this.resolveCpsManager();
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

  /**
   * 注册 hover 拾取监听(多订阅)。整体建筑视角下由调用方按需开启。
   *
   * 不走 soonspacejs 的 modelHover 信号:该信号由 _triggerSceneEventInAllObject("hover") 动态分发
   * signals[`${stype}Hover`],只在命中对象 stype==="Model" 时触发 modelHover;CPS 的墙/Space/门等
   * stype 不是 "Model",modelHover 永远不触发。所以这里直接订阅 signals.mouseMove(任何鼠标移动都触发),
   * rAF 节流后用 viewport.getIntersects 做 BVH 拾取,沿父链向上找到带 sid 的 BaseObject3D
   * (其 sid 即 out_instance_id),分发给所有订阅者。不需要 hoverEnabled,不需要知道 stype。
   */
  setHoverPickHandler(handler: (info: HoverPickInfo) => void): () => void {
    this.hoverPickHandlers.add(handler);
    if (!this.hoverPickInstalled) {
      this.hoverPickInstalled = true;
      const ssp = this.getSsp();
      this.hoverPickBound = (event: AnyObject) => {
        this.hoverPickLastEvent = event;
        if (this.hoverPickRaf) return; // 已排程,合并到本帧
        this.hoverPickRaf = requestAnimationFrame(() => {
          this.hoverPickRaf = 0;
          const ev = this.hoverPickLastEvent;
          this.hoverPickLastEvent = null;
          if (!ev) return;
          this.runHoverPick(ev);
        });
      };
      ssp?.signals?.mouseMove?.add?.(this.hoverPickBound);
    }
    return () => this.clearHoverPickHandler(handler);
  }

  /**
   * 构建「场景图内部 id → 树语义 id」桥(每场景一次,场景加载后调用)。
   * 机制(演示包实测):可见几何是合并网格(自身无 id),所在楼层 Model 组的 sid/userData.id
   * 是 CPS 内部 id(不在平台实例树);树语义 id 由楼层内语义对象(Canvas3D 等)携带。
   * 本方法遍历场景图,发现携带树 id 的对象时,把它祖先链上的内部 id 都映射到该树 id,
   * 拾取合并网格 → 祖先内部 id 过桥 → 树节点(楼层/设备)。
   */
  buildIdBridge(aliasKeys: Set<string>): Map<string, string> {
    const bridge = new Map<string, string>();
    const ssp = this.getSsp();
    const root = ((ssp as AnyObject | undefined)?.viewport as AnyObject | undefined)?.scene
      ?? (ssp as AnyObject | undefined)?.scene;
    if (!root || aliasKeys.size === 0) return bridge;
    const stack: string[] = [];
    const visit = (obj: AnyObject): void => {
      const own: string[] = [];
      const sid = obj.sid;
      if (typeof sid === 'string' && sid) own.push(sid);
      const udId = (obj.userData as AnyObject | undefined)?.id;
      if (typeof udId === 'string' && udId) own.push(udId);
      let matched: string | null = null;
      for (const k of own) {
        if (aliasKeys.has(k)) {
          matched = k;
          break;
        }
      }
      if (matched) {
        // 就近优先:已存在的桥映射不覆盖(首遇的树 id 通常是最具体层级的语义体)
        for (const anc of stack) {
          if (!aliasKeys.has(anc) && !bridge.has(anc)) bridge.set(anc, matched);
        }
      }
      stack.push(...own);
      const children = obj.children as AnyObject[] | undefined;
      if (children) for (const c of children) visit(c);
      stack.length -= own.length;
    };
    try {
      visit(root as AnyObject);
    } catch (error) {
      console.warn('[soonspace-runtime] buildIdBridge threw', error);
    }
    return bridge;
  }

  /** 单帧拾取:raycast 命中(按距离) → 收集前几个含 sid 命中的父链(最近优先) → 分发。 */
  private runHoverPick(event: AnyObject): void {
    // 门控 1:拖拽相机(任一指针键按下)不做拾取 —— 通知消费者清浮标即可,省掉全场景 raycast
    if (typeof event.buttons === 'number' && event.buttons > 0) {
      for (const fn of this.hoverPickHandlers) {
        try {
          fn(null);
        } catch {
          /* 单个消费者异常不阻断 */
        }
      }
      return;
    }
    // 门控 2:微动跳过(<6px):鼠标静止/手抖不触发 raycast
    const cx = typeof event.clientX === 'number' ? event.clientX : Number.NaN;
    const cy = typeof event.clientY === 'number' ? event.clientY : Number.NaN;
    if (Number.isFinite(this.hoverPickLastX) && Number.isFinite(cx)
      && Math.abs(cx - this.hoverPickLastX) + Math.abs(cy - this.hoverPickLastY) < 6) {
      return;
    }
    this.hoverPickLastX = cx;
    this.hoverPickLastY = cy;

    const ssp = this.getSsp();
    const vp = ssp?.viewport as AnyObject | undefined;
    let info: HoverPickInfo = null;
    try {
      // 注意:SDK 默认的 scener.intersectsList 只登记经 addObject 注册的对象
      // (用户模型/POI 等),CPS 场景插件加载的墙/楼层/设备不在其中 —— 只用它会
      // "整栋楼只有两个面可 hover"。这里改对整个渲染场景做 raycast(只读不改引擎状态,
      // 与 intersectsList 同一入口),getIntersects 默认按父链 visible 过滤隐藏对象。
      const fullScene = (ssp as AnyObject | undefined)?.scene ?? vp?.scener?.scene;
      const fallbackList = vp?.scener?.intersectsList?.getAll?.();
      const target: unknown = fullScene ?? fallbackList;
      if (!target) return;
      const hits = vp?.getIntersects?.(event, target, { isFilterHideObject: true });
      const hitCount = Array.isArray(hits) ? hits.length : 0;
      const clientX = typeof event.clientX === 'number' ? event.clientX : 0;
      const clientY = typeof event.clientY === 'number' ? event.clientY : 0;
      const chains: string[][] = [];
      // 遍历命中(按距离),最多取 4 条命中;每条收集祖先链候选 id(sid + userData.id):
      // 演示包实测:合并网格自身无 id,楼层 Model 的 sid 是 CPS 内部 id(CWBZBF…),
      // 树语义 id 在 userData.id(楼层语义 Canvas3D)或部分对象的 sid 上 —— 两者都收。
      for (let i = 0; i < hitCount && chains.length < 4; i++) {
        const collected: string[] = [];
        let obj = (hits[i] as AnyObject)?.object as AnyObject | undefined;
        let depth = 0;
        while (obj && depth < 14) {
          const sid = obj.sid;
          if (typeof sid === 'string' && sid && !collected.includes(sid)) collected.push(sid);
          const udId = (obj.userData as AnyObject | undefined)?.id;
          if (typeof udId === 'string' && udId && !collected.includes(udId)) collected.push(udId);
          obj = obj.parent as AnyObject | undefined;
          depth += 1;
        }
        if (collected.length) chains.push(collected);
      }
      if (chains.length) {
        info = { sids: chains[0], hitChains: chains, clientX, clientY };
      }
    } catch (error) {
      console.error('[soonspace-runtime] hover pick threw', error);
    }
    for (const fn of this.hoverPickHandlers) {
      try {
        fn(info);
      } catch (error) {
        console.error('[soonspace-runtime] hover pick handler threw', error);
      }
    }
  }

  clearHoverPickHandler(handler?: (info: HoverPickInfo) => void): void {
    if (handler) {
      this.hoverPickHandlers.delete(handler);
    } else {
      this.hoverPickHandlers.clear();
    }
    if (this.hoverPickHandlers.size === 0 && this.hoverPickInstalled) {
      this.hoverPickInstalled = false;
      if (this.hoverPickRaf) {
        cancelAnimationFrame(this.hoverPickRaf);
        this.hoverPickRaf = 0;
      }
      this.hoverPickLastEvent = null;
      const ssp = this.getSsp();
      if (ssp?.signals && this.hoverPickBound) {
        ssp.signals.mouseMove?.remove?.(this.hoverPickBound);
        this.hoverPickBound = null;
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

  /** 清除全部高亮(不传 id = 全局取消描边)。 */
  clearAllHighlight(): void {
    (this.sdk as unknown as { cancelHeighLight?: (id?: unknown) => unknown } | null)?.cancelHeighLight?.();
  }

  drawVirtualRoute(detail: AnyObject, options?: AnyObject): Promise<unknown> | undefined {
    return this.sdk?.drawVirtualRoute?.(detail as any, options as any);
  }

  /** 对象沿路径移动动画(SDK pathMove);返回动画句柄(含 play/pause 可选)。 */
  pathMove(id: string, path: Array<{ x: number; y: number; z: number }>): unknown {
    return (this.sdk as unknown as { pathMove?: (id: string, path: unknown) => unknown } | null)?.pathMove?.(id, path);
  }

  /** 复位 pathMove 的对象(回初始位姿)。 */
  pathRestore(id: string): void {
    (this.sdk as unknown as { pathRestore?: (id: string) => unknown } | null)?.pathRestore?.(id);
  }

  /** 清除 SDK 场内导航已画路线(不传参 = 全部)。 */
  deleteNavigationRoutes(): void {
    (this.sdk as unknown as { deleteNavigationRoute?: (params?: unknown) => unknown } | null)?.deleteNavigationRoute?.({});
  }

  /**
   * SDK 场内导航:source/target 传 `{ node_id }`(Space/Story 的 twins_instance_id)或 `{ x, y, z }`,
   * 可带途经点。由 SDK 调 kgraph、绘制导航路线并登记 path_id;失败/不可达返回 `reachable: false`。
   * 与 AGENTS.md 约定一致:导航接口、绘制与路线登记一律走 SDK,不要自请求导航接口。
   */
  navigateWithinScene(params: {
    source: Record<string, unknown> | string;
    target: Record<string, unknown> | string;
    waypointNodeIds?: string[];
  }): Promise<{
    reachable: boolean;
    path_id: string | null;
    message?: string;
    total_distance?: number;
  } | null> {
    const sceneId = this.getSceneId();
    if (!sceneId) return Promise.resolve(null);
    const sdk = this.sdk as unknown as {
      navigateWithinScene?: (p: unknown) => unknown;
    } | null;
    if (!sdk?.navigateWithinScene) return Promise.resolve(null);
    return Promise.resolve(
      sdk.navigateWithinScene({
        scene_id: sceneId,
        source: params.source,
        target: params.target,
        ...(params.waypointNodeIds?.length ? { waypoint_node_ids: params.waypointNodeIds } : {}),
      }) as {
        reachable: boolean;
        path_id: string | null;
        message?: string;
        total_distance?: number;
      },
    );
  }

  /** 删除指定 SDK 导航路线(传 path_id;不传 = 全部)。 */
  deleteNavigationRoute(pathId?: string): void {
    const sdk = this.sdk as unknown as { deleteNavigationRoute?: (params?: unknown) => unknown } | null;
    if (pathId) sdk?.deleteNavigationRoute?.(pathId);
    else sdk?.deleteNavigationRoute?.({});
  }

  /**
   * SDK 场外到场内导航:source 为 **WGS84** 经纬度(经度在前),target 传 `{ node_id }`
   * (Space/Story 的 twins_instance_id)或 `{ x, y, z }` 场景坐标。SDK 绘制红色室外段 +
   * 连接段 + 绿色室内段并登记 path_id;失败/不可达返回 `reachable: false`。
   * 注意:业务库(高德)坐标是 GCJ02,传入前须经 coord-transform.gcj02ToWgs84 转换。
   */
  navigateFromExternal(params: {
    source: { lon: number; lat: number };
    target: Record<string, unknown> | string;
  }): Promise<{
    reachable: boolean;
    path_id: string | null;
    message?: string;
    total_distance?: number;
    walking_distance?: number;
  } | null> {
    const sceneId = this.getSceneId();
    if (!sceneId) return Promise.resolve(null);
    const sdk = this.sdk as unknown as {
      navigateFromExternal?: (p: unknown) => unknown;
    } | null;
    if (!sdk?.navigateFromExternal) return Promise.resolve(null);
    return Promise.resolve(
      sdk.navigateFromExternal({
        scene_id: sceneId,
        source: params.source,
        target: params.target,
      }) as {
        reachable: boolean;
        path_id: string | null;
        message?: string;
        total_distance?: number;
        walking_distance?: number;
      },
    );
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

  /**
   * 对象世界坐标(包围盒中心):几何包围盒中心是**对象局部空间**,obj.position 是
   **父节点空间**(soonspacejs 无 box3/worldPosition 出口,flyToObj 内部自算世界盒),
   * 故统一经 matrixWorld 列主序 4x4 手工变换(纯读不改引擎状态,AGENTS.md 灰色区许可)。
   */
  getObjectWorldPosition(id: string): { x: number; y: number; z: number } | null {
    const obj = this.getSsp()?.getObjectById?.(id) as AnyObject | null | undefined;
    if (!obj) return null;
    try {
      const m = (obj.matrixWorld as AnyObject | undefined)?.elements as number[] | undefined;
      const box = obj.geometry?.boundingBox as { center?: { x: number; y: number; z: number } } | undefined;
      const c = box?.center;
      if (Array.isArray(m) && m.length >= 16 && c && Number.isFinite(c.x)) {
        // 对象局部 → 世界(完整 3x3 + 平移,含缩放/旋转/剪切)
        return {
          x: m[0] * c.x + m[4] * c.y + m[8] * c.z + m[12],
          y: m[1] * c.x + m[5] * c.y + m[9] * c.z + m[13],
          z: m[2] * c.x + m[6] * c.y + m[10] * c.z + m[14],
        };
      }
      // 无几何盒:position 是父空间 → 经父级世界矩阵变换
      const p = obj.position as { x: number; y: number; z: number } | undefined;
      if (p && Number.isFinite(p.x)) {
        const pm = (obj.parent as AnyObject | undefined)?.matrixWorld as { elements?: number[] } | undefined;
        const q = Array.isArray(pm?.elements) ? pm!.elements : null;
        if (!q) return { x: p.x, y: p.y, z: p.z };
        return {
          x: q[0] * p.x + q[4] * p.y + q[8] * p.z + q[12],
          y: q[1] * p.x + q[5] * p.y + q[9] * p.z + q[13],
          z: q[2] * p.x + q[6] * p.y + q[10] * p.z + q[14],
        };
      }
    } catch {
      /* 位置不可得 */
    }
    return null;
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
      panelList: stubPanelList,
      panelSetVisible: stubPanelSetVisible,
      showVideo: stubShowVideo,
    };
  }

  render(): void {
    const ssp = this.getSsp();
    if (typeof ssp?.requestRender === 'function') ssp.requestRender();
    else ssp?.render?.();
  }

  /**
   * 批量隐藏对象(循环 sdk.hide,SDK 无批量 API)。
   * 注意:setViewMode 内部 resetAll 会恢复所有被 hide 的对象,故每次视角操作后需重放(replay)。
   * 参考实现:code-ms6qsavu/lib/scene-plugins UStudioSceneTool.replayCategoryVisibility。
   */
  hideObjects(ids: string[]): void {
    const sdk = this.sdk as unknown as { hide?: (id: string) => void } | null;
    if (!sdk?.hide) return;
    let ok = 0;
    let fail = 0;
    const firstErrors: string[] = [];
    for (const id of ids) {
      try {
        sdk.hide!(id);
        ok += 1;
      } catch (error) {
        fail += 1;
        if (firstErrors.length < 3) firstErrors.push(error instanceof Error ? error.message : String(error));
      }
    }
    if (fail > 0) console.warn(`[scene-recipe] hideObjects 成功 ${ok}/${ids.length}，失败 ${fail}，示例: ${firstErrors.join(' | ')}`);
    this.render();
  }

  /** 批量恢复对象可见(循环 sdk.show)。 */
  showObjects(ids: string[]): void {
    const sdk = this.sdk as unknown as { show?: (id: string) => void } | null;
    if (!sdk?.show) return;
    let ok = 0;
    let fail = 0;
    const firstErrors: string[] = [];
    for (const id of ids) {
      try {
        sdk.show!(id);
        ok += 1;
      } catch (error) {
        fail += 1;
        if (firstErrors.length < 3) firstErrors.push(error instanceof Error ? error.message : String(error));
      }
    }
    if (fail > 0) console.warn(`[scene-recipe] showObjects 成功 ${ok}/${ids.length}，失败 ${fail}，示例: ${firstErrors.join(' | ')}`);
    this.render();
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

  /** 场景截图(渲染 canvas toDataURL);失败返回 null。
   *  不走 sdk.screenShot():它会自行触发一次下载且返回 Blob(与本封装的 href 语义不兼容)。 */
  async screenShot(): Promise<string | null> {
    try {
      const ssp = this.getSsp();
      const canvas = ((ssp as AnyObject | undefined)?.viewport as AnyObject | undefined)?.renderer?.domElement
        ?? (ssp as AnyObject | undefined)?.renderer?.domElement as HTMLCanvasElement | undefined;
      if (canvas) {
        this.render();
        return canvas.toDataURL('image/png');
      }
    } catch {
      /* 引擎无 canvas */
    }
    return null;
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

  // ========== 性能优化方法 ==========

  /**
   * 加载完成后自动应用的渲染优化：
   *  - 统计场景物体/网格/顶点总量
   *  - 像素比上限（默认 1.5，减轻大场景填充率压力）
   *  - 后台计算 BVH（加速大批量网格的拾取/高亮）
   */
  private applyPerfDefaults(): void {
    this.loadMs = this.initStartedAt > 0 ? performance.now() - this.initStartedAt : null;
    this.sceneCounts = this.countScene();
    const dpr = typeof window !== 'undefined' && window.devicePixelRatio ? window.devicePixelRatio : 1;
    // 大模型场景（>2w mesh）初始即压低像素比，避免首帧全分辨率渲染导致长时间卡顿
    const heavyScene = this.sceneCounts.meshes > 20000;
    this.setPixelRatio(Math.min(dpr, heavyScene ? 1 : 1.5));
    // 默认关阴影：大场景阴影贴图渲染开销大，需时在设置里手动开
    this.setShadows(false);
    this.installRenderStats();
    void this.computeBvh();
    console.info('[perf] init 完成: loadMs =', this.loadMs?.toFixed(0), 'ms, ssp =', this.ssp ? 'ok' : 'MISSING',
      'counts =', this.sceneCounts, 'renderer =', !!this.getRenderer());
    // 场景渲染几帧后按真实 draw call 数自适应
    window.setTimeout(() => this.adaptPixelRatioByLoad(), 2000);
    window.setTimeout(() => this.adaptPixelRatioByLoad(), 6000);
  }

  private adaptPixelRatioByLoad(): void {
    const renderer = this.getRenderer();
    const calls = renderer?.info?.render?.calls;
    if (typeof calls !== 'number' || calls <= 0) return;
    // 填充率自适应：draw call 越多逐级降低像素比（大模型场景可降到 0.75，约减 44% 填充面积）
    if (calls > 80000) {
      console.info('[perf] 本帧 draw calls =', calls, '（> 80000），自动将像素比降至 0.75 缓解重绘压力');
      this.setPixelRatio(0.75);
    } else if (calls > 30000) {
      console.info('[perf] 本帧 draw calls =', calls, '（> 30000），自动将像素比降至 1 缓解重绘压力');
      this.setPixelRatio(1);
    }
  }

  /** 设置渲染像素比（0.75/1/1.5/2）。大场景建议 0.75~1，减少填充率与显存压力。 */
  setPixelRatio(value: number): void {
    const renderer = this.getRenderer();
    if (!renderer || typeof renderer.setPixelRatio !== 'function') return;
    const clamped = Math.max(0.75, Math.min(2, value));
    renderer.setPixelRatio(clamped);
    try {
      this.getViewport()?.signals?.windowResize?.dispatch?.();
    } catch {
      // 内部信号不可用时忽略
    }
    this.render();
  }

  /** 开关阴影贴图渲染 */
  setShadows(enabled: boolean): void {
    const renderer = this.getRenderer();
    if (!renderer) return;
    if (renderer.shadowMap && typeof renderer.shadowMap === 'object') renderer.shadowMap.enabled = enabled;
    this.render();
  }

  /**
   * 暂停/恢复 3D 渲染循环（soonspacejs Viewport.setPauseRender）。
   * 3D 模块被隐藏（如切到态势总览 GIS）时暂停，节省 GPU/CPU；恢复时立即渲染一帧。
   */
  setRenderPaused(paused: boolean): void {
    const viewport = this.getViewport();
    if (!viewport || typeof viewport.setPauseRender !== 'function') return;
    try {
      void viewport.setPauseRender(paused);
      if (!paused) this.render();
    } catch (error) {
      console.warn('[perf] setPauseRender 失败', error);
    }
  }

  /** 开关 SMAA 抗锯齿 */
  setSmaa(enabled: boolean): void {
    const ssp = this.getSsp();
    if (!ssp) return;
    try {
      const smaa = this.getViewport()?.effectManager?.effectsMap?.get?.('smaaEffect');
      if (smaa && typeof smaa === 'object') smaa.enabled = enabled;
      const effectManager = this.getViewport()?.effectManager;
      if (effectManager) effectManager.effectsNeedsUpdate = true;
    } catch {
      // 效果管理器结构异常时忽略
    }
    this.render();
  }

  /** 计算/重建 mesh 包围体层级（BVH），加速大批量网格的射线拾取 */
  async computeBvh(): Promise<void> {
    const ssp = this.getSsp();
    if (!ssp || typeof ssp.computeModelsBoundsTree !== 'function' || this.bvhRunning) return;
    this.bvhRunning = true;
    this.bvhReady = false;
    try {
      await ssp.computeModelsBoundsTree({ type: 'slice', frameSliceCount: 500 });
      this.bvhReady = true;
    } catch (error) {
      console.warn('[perf] computeModelsBoundsTree 失败', error);
    } finally {
      this.bvhRunning = false;
    }
  }

  /** 挂钩 soonspacejs postRender,统计真实渲染帧间隔(区别于 rAF 空转的假高帧率) */
  private installRenderStats(): void {
    const vp = this.getViewport();
    if (!vp || typeof vp.postRender?.set !== 'function') return;
    vp.postRender.set('perf-stats', () => {
      // 仅作"是否在渲染"的 idle 信号;fps 交给前端 rAF(postRender 触发频率≠真实渲染帧率,直接算会虚低)
      this.lastRenderAt = performance.now();
    });
  }

  /** 实时性能采样 */
  getPerfStats(): PerfStats {
    const ssp = this.getSsp();
    const renderer = this.getRenderer();
    const info = renderer?.info?.render;
    this.perfPollCount += 1;
    if (this.sceneCounts.objects === 0 || this.perfPollCount % 10 === 0) {
      const counts = this.countScene();
      if (counts.objects > 0) this.sceneCounts = counts;
    }
    let smaaOn = false;
    try {
      const smaa = this.getViewport()?.effectManager?.effectsMap?.get?.('smaaEffect');
      smaaOn = typeof smaa?.enabled === 'boolean' ? smaa.enabled : false;
    } catch {
      // ignore
    }
    const idle = this.lastRenderAt > 0 && performance.now() - this.lastRenderAt > 1000;
    return {
      loadMs: this.loadMs,
      drawCalls: info?.calls ?? 0,
      triangles: info?.triangles ?? 0,
      vertices: this.sceneCounts.vertices,
      objects: this.sceneCounts.objects,
      meshes: this.sceneCounts.meshes,
      pixelRatio: typeof renderer?.getPixelRatio === 'function' ? renderer.getPixelRatio() : 1,
      shadowOn: !!renderer?.shadowMap?.enabled,
      smaaOn,
      bvhReady: this.bvhReady,
      bvhRunning: this.bvhRunning,
      idle,
    };
  }

  /** 遍历场景统计物体节点、网格与顶点总量 */
  private countScene(): SceneCounts {
    let scene: AnyObject | null = null;
    try {
      scene = (this.getSsp()?.scene ?? null) as AnyObject | null;
    } catch {
      // ignore
    }
    if (!scene || typeof scene.traverse !== 'function') {
      if (!this.warnedNoScene) {
        this.warnedNoScene = true;
        console.warn('[perf] countScene: 未获取到 soonspace 场景实例（scene 缺失）');
      }
      return { objects: 0, meshes: 0, vertices: 0 };
    }
    let objects = 0;
    let meshes = 0;
    let vertices = 0;
    try {
      scene.traverse((obj: AnyObject) => {
        objects += 1;
        if (obj?.isMesh || obj?.isInstancedMesh) {
          meshes += 1;
          const count = obj?.geometry?.attributes?.position?.count ?? 0;
          vertices += count * (obj?.isInstancedMesh && typeof obj?.count === 'number' ? obj.count : 1);
        }
      });
    } catch (error) {
      if (!this.warnedNoScene) {
        this.warnedNoScene = true;
        console.warn('[perf] countScene: 场景遍历失败', error);
      }
      return { objects: 0, meshes: 0, vertices: 0 };
    }
    return { objects, meshes, vertices };
  }

  /** 获取场景 ID */
  getSceneId(): string {
    return this.sceneId;
  }

  /** 获取 viewport 实例 */
  getViewport(): AnyObject | null {
    const ssp = this.getSsp();
    return ssp?.viewport ?? ssp?.viewPort ?? null;
  }

  /** 获取 WebGLRenderer */
  getRenderer(): AnyObject | null {
    const viewport = this.getViewport();
    const renderer = viewport?.renderer ?? this.getSsp()?.renderer;
    return renderer && typeof renderer === 'object' ? renderer : null;
  }

  /** 场景加载状态诊断 */
  getSceneStatus(): { sceneChildren: number | null; renderer: boolean; lastCounts: SceneCounts; ssp: boolean } {
    try {
      const ssp = this.getSsp();
      const scene = ssp?.scene as AnyObject | null;
      return {
        sceneChildren: scene && typeof scene.children?.length === 'number' ? scene.children.length : null,
        renderer: !!this.getRenderer(),
        lastCounts: this.sceneCounts,
        ssp: !!ssp,
      };
    } catch {
      return { sceneChildren: null, renderer: false, lastCounts: { objects: 0, meshes: 0, vertices: 0 }, ssp: false };
    }
  }
}
