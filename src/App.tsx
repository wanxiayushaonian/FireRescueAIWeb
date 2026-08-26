import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import { Database, Building2 } from 'lucide-react';
import TopBar from '@/components/TopBar';
import SideNav from '@/components/SideNav';
import SceneSwitcher from '@/components/SceneSwitcher';
import ErrorBoundary from '@/components/ErrorBoundary';
import { LocationVocabProvider } from '@/components/RichLocationText';
import type { ModuleKey } from '@/components/SideNav';
import { SceneProvider, useScene } from '@/components/SceneProvider';
import { SceneCommandBridge } from '@/components/SceneCommandBridge';
// GIS 底座:Leaflet 是浏览器库,须客户端加载(ssr:false),否则构建期 SSR 报 window 未定义
const RealGisMap = dynamic(() => import('@/components/RealGisMap'), {
  ssr: false,
  loading: () => null,
});
import DraggablePanel from '@/components/DraggablePanel';
import ToastHost from '@/components/Toast';
import ResourceOverviewPanel from '@/components/panels/ResourceOverviewPanel';
import BuildingProfilePanel from '@/components/panels/BuildingProfilePanel';
import AgentSidebar from '@/components/AgentSidebar';
import type { AgentPanelId } from '@/mock/agentScripts';
import TrainingView from '@/views/TrainingView';
import CommandView from '@/views/CommandView';
import DrillView from '@/views/DrillView';
import ScenePerfWidget from '@/components/ScenePerfWidget';
import SceneFloorHoverLabel from '@/components/SceneFloorHoverLabel';
import SceneDeviceHoverTip from '@/components/SceneDeviceHoverTip';
import SceneObjectInfoCard from '@/components/SceneObjectInfoCard';
import SceneToolbar from '@/components/SceneToolbar';
import SceneViewBar from '@/components/SceneViewBar';
import SceneHintBar from '@/components/SceneHintBar';
import { storyIdsForFloorSpec } from '@/lib/floor-focus';
import { showToast } from '@/components/Toast';
import { presets } from '@/lib/scene-recipe/presets';
import { effectiveDisplayPrefs } from '@/lib/scene-display-prefs';
import { loadSceneSkyPref } from '@/lib/scene-sky-prefs';

export default function App() {
  return (
    <LocationVocabProvider>
      <SceneProvider>
        <AppContent />
      </SceneProvider>
    </LocationVocabProvider>
  );
}

/** 3D 场景容器：始终存在，跨模块复用。演练(drill)时 3D 为纯背景——隐藏其余交互浮层,
 *  避免与演练自己的顶部条/参数条/右栏重合(此前帧率/书签条全叠在演练 UI 上);
 *  楼层显隐工具栏(SceneToolbar)按需求保留:下移避让演练工具条 + 紧凑模式(去搜索)避让两侧浮动面板。 */
function SceneContainer({ module }: { module: ModuleKey }) {
  const { containerRef, view, progress } = useScene();
  const isDrill = module === 'drill';

  return (
    <div className="scene-grid relative h-full w-full overflow-hidden bg-bg-grid">
      <div ref={containerRef} className="absolute inset-0" />
      {/* 顶部居中工具栏:层级切换+当前楼层徽章+楼层chip云+设备搜索(与场景深度联动);
          演练模块贴底+紧凑(无搜索):顶部有演练工具条、两侧有浮动面板,底部中央唯一无遮挡 */}
      {isDrill ? <SceneToolbar placement="bottom" compact /> : <SceneToolbar />}
      {/* 整体建筑视角下 hover 楼层浮层标签(仅整体视角开启 hover raycast;双击直达单层) */}
      {!isDrill && <SceneFloorHoverLabel />}
      {/* 单/多层视角下 hover 设备轻提示(名称+类型+楼层;与楼层浮标经多订阅通道并存) */}
      {!isDrill && <SceneDeviceHoverTip />}
      {/* 点击对象信息卡 / 视角书签+截图+清除高亮(底部居中) / 首次提示 */}
      {!isDrill && <SceneObjectInfoCard />}
      {!isDrill && <SceneViewBar />}
      {!isDrill && <SceneHintBar />}
      {/* 帧率监控浮窗(仅 3D 场景就绪时显示,纯展示不拦截交互) */}
      {!isDrill && <ScenePerfWidget />}
      {view === 'loading' && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-bg-deep/50 backdrop-blur-[2px]">
          <div className="w-72 rounded-xl border border-line bg-bg-panel/85 px-6 py-5 text-center shadow-xl">
            <div className="mb-2.5 text-sm text-text-1">{progress?.message ?? '场景加载中…'}</div>
            <div className="h-1.5 overflow-hidden rounded-full bg-bg-panel-2">
              <div
                className={`h-full rounded-full bg-gradient-to-r from-cyan to-blue transition-[width] duration-300 ${progress?.percent == null ? 'w-1/3 animate-pulse' : ''}`}
                style={progress?.percent != null ? { width: `${Math.min(100, Math.max(0, progress.percent))}%` } : undefined}
              />
            </div>
            <div className="mt-1.5 font-mono text-[11px] text-text-3">
              {progress?.percent != null ? `${Math.round(progress.percent)}%` : '准备中…'}
            </div>
          </div>
        </div>
      )}
      {view === 'no-scene' && (
        <div className="absolute inset-0 grid place-items-center text-center">
          <div className="rounded-xl border border-dashed border-line-glow bg-bg-panel/40 px-8 py-6 backdrop-blur-sm">
            <div className="mb-1 text-base font-bold text-text-1">未选择场景</div>
            <div className="text-sm text-text-2">点击左上角切换场景</div>
          </div>
        </div>
      )}
    </div>
  );
}

const MODULE_LABELS: Record<ModuleKey, string> = {
  overview: '态势总览',
  objects: '对象总览',
  training: '熟悉考核',
  drill: '演练对抗',
  command: '实战指挥',
};

function AppContent() {
  const [module, setModule] = useState<ModuleKey>('overview');
  const [navCollapsed, setNavCollapsed] = useState(true);
  const [resourcePanelOpen, setResourcePanelOpen] = useState(true);
  const [buildingPanelOpen, setBuildingPanelOpen] = useState(true);

  const [scenes, setScenes] = useState<{ scene_id: string; scene_name: string }[]>([]);
  const { sceneId, setSceneId, setEnabled, enabled, recipeStore, runtime, view, tree } = useScene();

  // 对象总览当前建筑 ID(由 GIS 信息窗「查看档案」或内部下拉切换)。
  const [objectsBuildingId, setObjectsBuildingId] = useState<string>('');

  // 实战指挥当前选中警情(注入 agent 上下文,让 agent 知道用户在看哪起警情)。
  const [commandSelectedIncident, setCommandSelectedIncident] = useState<{
    id: string; address: string; type: string; status: string; lng: number; lat: number; caller?: string;
  } | null>(null);

  // 六熟悉/考核「问智能体」预填消息(ts 变化触发 AgentSidebar 展开并发送)
  const [hintPrefill, setHintPrefill] = useState<{ text: string; ts: number } | null>(null);

  // 场景列表 + 最近使用(替代写死 .env SCENE_ID,场景选择交前端 TopBar 下拉)
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/ustudio/bootstrap', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as { scenes?: { scene_id: string; scene_name: string }[] };
        const list = data.scenes ?? [];
        setScenes(list);
        const recent = typeof window !== 'undefined' ? localStorage.getItem('firerescue:recent-scene') : null;
        const initial = recent && list.some((s) => s.scene_id === recent) ? recent : (list[0]?.scene_id ?? '');
        setSceneId(initial);
      } catch {
        /* bootstrap 失败留空,SceneSwitcher 空 + RealSceneView 显示未选择 */
      }
    })();
  }, [setSceneId]);

  const handleSelectScene = (id: string) => {
    setSceneId(id);
    try {
      localStorage.setItem('firerescue:recent-scene', id);
    } catch {
      /* ignore storage quota/privacy */
    }
  };

  const handleSelect = (k: ModuleKey) => {
    setModule(k);
    if (k === 'overview') { setResourcePanelOpen(true); }
    if (k === 'objects') setBuildingPanelOpen(true);
    // 首次进入 3D 模块时启用场景加载（之后保持 enabled=true，不再关闭）
    if ((k === 'objects' || k === 'drill' || k === 'training') && !enabled) {
      setEnabled(true);
    }
  };

  // 服务进程注册(方案④):缓存跨域静态资产(场景包/地图瓦片),二次进入秒开。
  // SW 只处理跨域 GET,不碰应用自身资源,dev HMR 不受影响;注册失败不影响主流程。
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* ignore */
    });
  }, []);

  // 3D 模块隐藏（态势总览/GIS）或页面失焦（切标签页/最小化）时暂停渲染循环；
  // 切回即恢复。场景未就绪前不暂停，避免影响加载。
  useEffect(() => {
    if (!runtime || view !== 'ready') return;
    const apply = (): void => runtime.setRenderPaused(module === 'overview' || document.hidden);
    apply();
    document.addEventListener('visibilitychange', apply);
    return () => document.removeEventListener('visibilitychange', apply);
  }, [runtime, view, module]);

  // 场景 id 写 window.__sceneId:AgentChatThread forwardedProps 与 lib/agent-context 读它
  // 注入 agent 上下文(此前只有读没有写,scene_id 从未生效过——2026-08-17 修复)。
  useEffect(() => {
    if (typeof window !== 'undefined' && sceneId) window.__sceneId = sceneId;
  }, [sceneId]);

  // 模块切换/场景就绪时套 Recipe 预设;态势总览不加载 3D;培训 familiarize 步进在 TrainingView。
  // 显隐细节统一由模态框控制:预设只定基线(楼层全集/mode/GIS),categoryVisibility 按场景 id
  // 回放存档的模态开关配置(替代旧"加载完无条件 hideDevices 全藏"与模态配置互相覆盖的冲突)。
  // 回放一律经 effectiveDisplayPrefs:存档缺失的层/type 补层级默认表,不会出现空表
  // (2026-08-17 用户定稿:single 消防设施+门/multi 消防设施/whole 仅室外三件)。
  useEffect(() => {
    if (!recipeStore) return;
    const display = effectiveDisplayPrefs(sceneId);
    if (module === 'objects') {
      recipeStore.setStructural({ ...presets.objectsOverview.structural, categoryVisibility: display });
    } else if (module === 'drill') {
      recipeStore.setStructural({ ...presets.drillConfront.structural, categoryVisibility: display });
    }
  }, [recipeStore, module, sceneId]);

  // 天空背景回放:长期开关按场景记忆;场景就绪后应用(runtime 重 init 会清掉背景)
  useEffect(() => {
    if (view !== 'ready' || !runtime || !sceneId) return;
    if (loadSceneSkyPref(sceneId)) runtime.setSceneSky(true);
  }, [view, sceneId, runtime]);

  // 智能体远程调起业务面板
  const handleAgentOpenPanel = (panelId: AgentPanelId) => {
    if (panelId === 'force-resource') {
      setModule('overview');
      setResourcePanelOpen(true);
    } else if (panelId === 'building-profile') {
      setModule('objects');
      setBuildingPanelOpen(true);
      if (!enabled) setEnabled(true);
    } else if (panelId === 'drill-scenario') {
      setModule('drill');
      if (!enabled) setEnabled(true);
    } else if (panelId === 'close-panels') {
      // 智能体远程收起当前模块全部业务面板（不切模块）
      setResourcePanelOpen(false);
      setBuildingPanelOpen(false);
    } else if (panelId === 'training') {
      setModule('training');
      if (!enabled) setEnabled(true);
    } else if (panelId === 'command') {
      setModule('command');
    } else if (panelId === 'confront-mode') {
      setModule('drill');
      if (!enabled) setEnabled(true);
    }
  };

  // GIS 信息窗业务跳转（linkage 分支通过 CustomEvent 上报）。
  // enabled 走无条件 setEnabled(true)(幂等);告警联动需 tree/recipeStore/runtime,
  // 故依赖三者(变化时重注册监听,取新鲜引用)。
  useEffect(() => {
    const onOpenProfile = (e: Event) => {
      const d = (e as CustomEvent<{ buildingId?: string }>).detail;
      if (d?.buildingId) setObjectsBuildingId(d.buildingId);
      setModule('objects');
      setBuildingPanelOpen(true);
      setEnabled(true);
    };
    const onIgnite = () => {
      setModule('drill');
      setEnabled(true);
    };
    // TopBar 告警点击 → 跳转对象总览 + 3D 联动:聚焦告警楼层 + 飞向 + toast
    const onOpenAlert = (e: Event) => {
      const d = (e as CustomEvent<{ buildingId?: string; floor?: string }>).detail;
      setModule('objects');
      setBuildingPanelOpen(true);
      setEnabled(true);
      if (d?.floor && tree && recipeStore) {
        const storyIds = storyIdsForFloorSpec(tree, d.floor);
        if (storyIds.length === 1) {
          recipeStore.patchStructural({
            visibleStories: storyIds,
            yExtend: false,
            hideDevices: false,
          });
          void runtime?.flyToObject(storyIds[0]).catch(() => {});
          showToast(`告警联动:已聚焦 ${d.floor}`);
        }
      }
    };
    // 全局演示剧本：demoScript 派发模块切换（一键串联汇报演示）
    const onDemoSwitch = (e: Event) => {
      const d = (e as CustomEvent<{ module: ModuleKey }>).detail;
      if (d?.module) handleSelect(d.module);
    };
    window.addEventListener('gis:open-building-profile', onOpenProfile);
    window.addEventListener('gis:ignite-building', onIgnite);
    window.addEventListener('topbar:open-alert', onOpenAlert);
    window.addEventListener('demo:switch-module', onDemoSwitch);
    return () => {
      window.removeEventListener('gis:open-building-profile', onOpenProfile);
      window.removeEventListener('gis:ignite-building', onIgnite);
      window.removeEventListener('topbar:open-alert', onOpenAlert);
      window.removeEventListener('demo:switch-module', onDemoSwitch);
    };
  }, [tree, recipeStore, runtime]);

  return (
    <div className="flex h-[100dvh] min-h-[100dvh] flex-col overflow-hidden bg-bg-deep text-text-1">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <SideNav
          active={module}
          onSelect={handleSelect}
          collapsed={navCollapsed}
          onToggleCollapsed={() => setNavCollapsed((v) => !v)}
          onWarmup={(k) => {
            // 预热:首次 hover 3D 模块按钮才启用场景加载(零启动代价,点击仍走 handleSelect 兜底)
            if (!enabled && (k === 'objects' || k === 'drill' || k === 'training')) setEnabled(true);
          }}
        />
        <main className="relative min-w-0 flex-1">
          {/* 3D 场景容器：始终挂载（保持 WebGL canvas），用 CSS 控制显隐 */}
          <div className={module === 'overview' ? 'hidden' : 'absolute inset-0 z-0'}>
            <SceneContainer module={module} />
          </div>

          {/* 模块内容层 */}
          <div className={`relative z-10 h-full w-full ${module !== 'overview' ? 'pointer-events-none' : ''}`}>
            <AnimatePresence mode="wait">
              <motion.div
                key={module}
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.25 }}
                className="h-full w-full"
              >
                <ErrorBoundary key={module} moduleName={MODULE_LABELS[module]}>
                  {module === 'training' ? (
                    <TrainingView
                      onRequestAgentHint={(topic) =>
                        setHintPrefill({
                          text: `[六熟悉引导] 我正在学习「${topic}」这一步,请结合当前场景讲解重点,并带我到现场熟悉。`,
                          ts: Date.now(),
                        })
                      }
                    />
                  ) : module === 'command' ? (
                    <CommandView
                      onIncidentSelect={(inc) => setCommandSelectedIncident(inc)}
                      onOpenDrillSession={() => {
                        setModule('drill');
                        if (!enabled) setEnabled(true);
                      }}
                    />
                  ) : module === 'drill' ? (
                    <DrillView
                      onOpenCommandSession={() => setModule('command')}
                    />
                  ) : module === 'overview' ? (
                    <RealGisMap
                      onEnterScene={(id, buildingId) => {
                        handleSelectScene(id);
                        // 携带建筑 id 进入:自动选中右侧单建筑档案面板(与「查看档案」路径一致)
                        if (buildingId) setObjectsBuildingId(buildingId);
                        setModule('objects');
                        // 与 handleSelect 一致:绕过侧边栏进入 3D 模块时也要解除懒加载守卫,
                        // 否则 SceneProvider 因 enabled=false 永不加载场景
                        if (!enabled) setEnabled(true);
                      }}
                    />
                  ) : null}
                </ErrorBoundary>
              </motion.div>
            </AnimatePresence>
          </div>

          {module === 'overview' && (
            <DraggablePanel
              panelId="resource-overview"
              title="资源总览"
              icon={Database}
              width={500}
              dock="left"
              defaultPos={{ x: 16, y: 16 }}
              open={resourcePanelOpen}
              onOpenChange={setResourcePanelOpen}
            >
              <ResourceOverviewPanel />
            </DraggablePanel>
          )}
          {module === 'objects' && (
            <DraggablePanel
              panelId="building-profile"
              title="单建筑档案"
              icon={Building2}
              width={440}
              dock="left"
              defaultPos={{ x: 16, y: 64 }}
              height="calc(100% - 280px)"
              open={buildingPanelOpen}
              onOpenChange={setBuildingPanelOpen}
            >
              <BuildingProfilePanel
                buildingId={objectsBuildingId || undefined}
                onBuildingChange={setObjectsBuildingId}
              />
            </DraggablePanel>
          )}
          {/* 3D 场景左上角场景切换(对象/培训模块显示;overview 用 GIS 无场景包,drill 场景固定,command 用 GIS 无场景包) */}
          {module !== 'overview' && module !== 'drill' && module !== 'command' && scenes.length > 0 && (
            <SceneSwitcher scenes={scenes} selectedSceneId={sceneId} onSelectScene={handleSelectScene} />
          )}
          <SceneCommandBridge />
        </main>
        <AgentSidebar
          module={module}
          onOpenPanel={handleAgentOpenPanel}
          contextDeps={{
            objectsBuildingId: objectsBuildingId || undefined,
            commandIncident: commandSelectedIncident,
          }}
          prefillText={hintPrefill}
        />
      </div>
    <ToastHost />
  </div>
  );
}
