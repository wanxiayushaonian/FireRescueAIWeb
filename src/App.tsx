import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import { Database, Building2, Droplet } from 'lucide-react';
import TopBar from '@/components/TopBar';
import SideNav from '@/components/SideNav';
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
import ForceResourcePanel from '@/components/panels/ForceResourcePanel';
import WaterSourcePanel from '@/components/panels/WaterSourcePanel';
import BuildingProfilePanel from '@/components/panels/BuildingProfilePanel';
import AgentChat from '@/components/AgentChat';
import type { AgentPanelId } from '@/mock/agentScripts';
import TrainingView from '@/views/TrainingView';
import CommandView from '@/views/CommandView';
import DrillView from '@/views/DrillView';
import { presets } from '@/lib/scene-recipe/presets';

export default function App() {
  return (
    <SceneProvider>
      <AppContent />
    </SceneProvider>
  );
}

/** 3D 场景容器：始终存在，跨模块复用 */
function SceneContainer() {
  const { containerRef, view } = useScene();

  return (
    <div className="scene-grid relative h-full w-full overflow-hidden bg-bg-grid">
      <div ref={containerRef} className="absolute inset-0" />
      {view === 'loading' && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-text-2">
          场景加载中…
        </div>
      )}
      {view === 'no-scene' && (
        <div className="absolute inset-0 grid place-items-center text-center">
          <div className="rounded-xl border border-dashed border-line-glow bg-bg-panel/40 px-8 py-6 backdrop-blur-sm">
            <div className="mb-1 text-base font-bold text-text-1">未选择场景</div>
            <div className="text-sm text-text-2">从顶栏场景下拉切换</div>
          </div>
        </div>
      )}
    </div>
  );
}

function AppContent() {
  const [module, setModule] = useState<ModuleKey>('overview');
  const [navCollapsed, setNavCollapsed] = useState(true);
  const [forcePanelOpen, setForcePanelOpen] = useState(true);
  const [waterPanelOpen, setWaterPanelOpen] = useState(true);
  const [buildingPanelOpen, setBuildingPanelOpen] = useState(true);

  const [scenes, setScenes] = useState<{ scene_id: string; scene_name: string }[]>([]);
  const { sceneId, setSceneId, setEnabled, enabled, recipeStore } = useScene();

  // 对象总览当前建筑 ID(由 GIS 信息窗「查看档案」或内部下拉切换)。
  const [objectsBuildingId, setObjectsBuildingId] = useState<string>('');

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
        /* bootstrap 失败留空,TopBar 下拉空 + RealSceneView 显示未选择 */
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
    if (k === 'overview') { setForcePanelOpen(true); setWaterPanelOpen(true); }
    if (k === 'objects') setBuildingPanelOpen(true);
    // 首次进入 3D 模块时启用场景加载（之后保持 enabled=true，不再关闭）
    if ((k === 'objects' || k === 'drill' || k === 'training') && !enabled) {
      setEnabled(true);
    }
  };

  // 模块切换/场景就绪时套 Recipe 预设;态势总览不加载 3D;培训 familiarize 步进在 TrainingView
  useEffect(() => {
    if (!recipeStore) return;
    if (module === 'objects') recipeStore.setStructural(presets.objectsOverview.structural);
    else if (module === 'drill') recipeStore.setStructural(presets.drillConfront.structural);
  }, [recipeStore, module]);

  // 智能体远程调起业务面板
  const handleAgentOpenPanel = (panelId: AgentPanelId) => {
    if (panelId === 'force-resource') {
      setModule('overview');
      setForcePanelOpen(true);
    } else if (panelId === 'building-profile') {
      setModule('objects');
      setBuildingPanelOpen(true);
      if (!enabled) setEnabled(true);
    } else if (panelId === 'drill-scenario') {
      setModule('drill');
      if (!enabled) setEnabled(true);
    } else if (panelId === 'close-panels') {
      // 智能体远程收起当前模块全部业务面板（不切模块）
      setForcePanelOpen(false);
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

  // GIS 信息窗业务跳转（linkage 分支通过 CustomEvent 上报）
  useEffect(() => {
    const onOpenProfile = (e: Event) => {
      const d = (e as CustomEvent<{ buildingId?: string }>).detail;
      if (d?.buildingId) setObjectsBuildingId(d.buildingId);
      setModule('objects');
      setBuildingPanelOpen(true);
    };
    const onIgnite = () => {
      setModule('drill');
    };
    // TopBar 告警点击 → 跳转对象总览定位告警楼层
    const onOpenAlert = () => {
      setModule('objects');
      setBuildingPanelOpen(true);
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
  }, []);

  return (
    <div className="flex h-[100dvh] min-h-[100dvh] flex-col overflow-hidden bg-bg-deep text-text-1">
      <TopBar scenes={scenes} selectedSceneId={sceneId} onSelectScene={handleSelectScene} />
      <div className="flex min-h-0 flex-1">
        <SideNav
          active={module}
          onSelect={handleSelect}
          collapsed={navCollapsed}
          onToggleCollapsed={() => setNavCollapsed((v) => !v)}
        />
        <main className="relative min-w-0 flex-1">
          {/* 3D 场景容器：始终挂载（保持 WebGL canvas），用 CSS 控制显隐 */}
          <div className={module === 'overview' ? 'hidden' : 'absolute inset-0 z-0'}>
            <SceneContainer />
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
                {module === 'training' ? (
                  <TrainingView />
                ) : module === 'command' ? (
                  <CommandView />
                ) : module === 'drill' ? (
                  <DrillView />
                ) : module === 'overview' ? (
                  <RealGisMap
                    onEnterScene={(id) => {
                      handleSelectScene(id);
                      setModule('objects');
                    }}
                  />
                ) : null}
              </motion.div>
            </AnimatePresence>
          </div>

          {module === 'overview' && (
            <>
            <DraggablePanel
              panelId="force-resource"
              title="执勤力量资源库"
              icon={Database}
              width={420}
              dock="left"
              defaultPos={{ x: 16, y: 16 }}
              open={forcePanelOpen}
              onOpenChange={setForcePanelOpen}
            >
              <ForceResourcePanel />
            </DraggablePanel>
            <DraggablePanel
              panelId="water-source"
              title="消防水源"
              icon={Droplet}
              width={380}
              dock="right"
              defaultPos={{ x: 16, y: 16 }}
              open={waterPanelOpen}
              onOpenChange={setWaterPanelOpen}
            >
              <WaterSourcePanel />
            </DraggablePanel>
            </>
          )}
          {module === 'objects' && (
            <DraggablePanel
              panelId="building-profile"
              title="单建筑档案"
              icon={Building2}
              width={440}
              dock="right"
              defaultPos={{ x: 16, y: 16 }}
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
          <SceneCommandBridge />
          <AgentChat module={module} onOpenPanel={handleAgentOpenPanel} />
        </main>
      </div>
    <ToastHost />
  </div>
  );
}
