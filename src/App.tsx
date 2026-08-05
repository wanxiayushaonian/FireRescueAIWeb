import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import { Archive, Database, Building2, Crosshair, FileText } from 'lucide-react';
import TopBar from '@/components/TopBar';
import SideNav from '@/components/SideNav';
import type { ModuleKey } from '@/components/SideNav';
import RealSceneView from '@/components/RealSceneView';
import { SceneCommandBridge } from '@/components/SceneCommandBridge';
// GIS 底座:Leaflet 是浏览器库,须客户端加载(ssr:false),否则构建期 SSR 报 window 未定义
const RealGisMap = dynamic(() => import('@/components/RealGisMap'), {
  ssr: false,
  loading: () => null,
});
import DraggablePanel from '@/components/DraggablePanel';
import ToastHost from '@/components/Toast';
import ForceResourcePanel from '@/components/panels/ForceResourcePanel';
import BuildingProfilePanel from '@/components/panels/BuildingProfilePanel';
import ScenarioPanel from '@/components/panels/ScenarioPanel';
import PlanOutputPanel from '@/components/panels/PlanOutputPanel';
import AgentChat from '@/components/AgentChat';
import type { AgentPanelId } from '@/mock/agentScripts';
import { beginGenerate, finishGenerate, beginConfrontation } from '@/mock/drillStore';
import { buildDrillPlan } from '@/mock/drill';
import TrainingView from '@/views/TrainingView';
import CommandView from '@/views/CommandView';
import PlanLibraryPanel from '@/components/panels/PlanLibraryPanel';
import { BUILDINGS } from '@/mock/drill';

export default function App() {
  const [module, setModule] = useState<ModuleKey>('overview');
  const [navCollapsed, setNavCollapsed] = useState(true);
  const [forcePanelOpen, setForcePanelOpen] = useState(true);
  const [buildingPanelOpen, setBuildingPanelOpen] = useState(true);
  const [scenarioPanelOpen, setScenarioPanelOpen] = useState(true);
  const [planPanelOpen, setPlanPanelOpen] = useState(true);
  const [libraryPanelOpen, setLibraryPanelOpen] = useState(false);

  const [scenes, setScenes] = useState<{ scene_id: string; scene_name: string }[]>([]);
  const [selectedSceneId, setSelectedSceneId] = useState<string>('');

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
        setSelectedSceneId(initial);
      } catch {
        /* bootstrap 失败留空,TopBar 下拉空 + RealSceneView 显示未选择 */
      }
    })();
  }, []);

  const handleSelectScene = (id: string) => {
    setSelectedSceneId(id);
    try {
      localStorage.setItem('firerescue:recent-scene', id);
    } catch {
      /* ignore storage quota/privacy */
    }
  };

  const handleSelect = (k: ModuleKey) => {
    setModule(k);
    if (k === 'overview') setForcePanelOpen(true);
    if (k === 'objects') setBuildingPanelOpen(true);
    if (k === 'drill') {
      setScenarioPanelOpen(true);
      setPlanPanelOpen(true);
    }
  };

  // 智能体远程调起业务面板
  const handleAgentOpenPanel = (panelId: AgentPanelId) => {
    if (panelId === 'force-resource') {
      setModule('overview');
      setForcePanelOpen(true);
    } else if (panelId === 'building-profile') {
      setModule('objects');
      setBuildingPanelOpen(true);
    } else if (panelId === 'drill-scenario') {
      setModule('drill');
      setScenarioPanelOpen(true);
      setPlanPanelOpen(true);
      // 智能体代填灾情参数并触发生成（情景面板经 drillStore 订阅同步表单，输出面板流式展示）
      const scenario = { buildingId: 'jm', buildingName: '金茂大厦', floor: '5F', material: '电气', trapped: 3 };
      beginGenerate(scenario);
      window.setTimeout(() => finishGenerate(buildDrillPlan(scenario)), 600);
    } else if (panelId === 'close-panels') {
      // 智能体远程收起当前模块全部业务面板（不切模块）
      setForcePanelOpen(false);
      setBuildingPanelOpen(false);
      setScenarioPanelOpen(false);
      setPlanPanelOpen(false);
      setLibraryPanelOpen(false);
    } else if (panelId === 'training') {
      setModule('training');
    } else if (panelId === 'command') {
      setModule('command');
    } else if (panelId === 'confront-mode') {
      setModule('drill');
      setScenarioPanelOpen(true);
      setPlanPanelOpen(true);
      // 智能体直接开启一局对抗模式（预案输出智能体随机灾情 + 对抗智能体自动注入特情）
      window.setTimeout(() => beginConfrontation(), 400);
    }
  };

  // GIS 信息窗业务跳转（linkage 分支通过 CustomEvent 上报）
  useEffect(() => {
    const onOpenProfile = () => {
      setModule('objects');
      setBuildingPanelOpen(true);
    };
    const onIgnite = (e: Event) => {
      const d = (e as CustomEvent<{ buildingId: string; buildingName: string }>).detail;
      setModule('drill');
      setScenarioPanelOpen(true);
      setPlanPanelOpen(true);
      const scenario = { buildingId: d.buildingId, buildingName: d.buildingName, floor: '5F', material: '电气', trapped: 2 };
      beginGenerate(scenario);
      window.setTimeout(() => finishGenerate(buildDrillPlan(scenario)), 600);
    };
    // TopBar 告警点击 → 跳转对象总览定位告警楼层
    const onOpenAlert = () => {
      setModule('objects');
      setBuildingPanelOpen(true);
    };
    // 预案库「重新载入演练」→ 切演练对抗并按库中预案重生成
    const onReloadPlan = (e: Event) => {
      const d = (e as CustomEvent<{ buildingName?: string }>).detail;
      const b = BUILDINGS.find((x) => x.name === d?.buildingName) ?? BUILDINGS[0];
      setModule('drill');
      setScenarioPanelOpen(true);
      setPlanPanelOpen(true);
      const scenario = { buildingId: b.id, buildingName: b.name, floor: '5F', material: '电气', trapped: 2 };
      beginGenerate(scenario);
      window.setTimeout(() => finishGenerate(buildDrillPlan(scenario)), 600);
    };
    // 全局演示剧本：demoScript 派发模块切换（一键串联汇报演示）
    const onDemoSwitch = (e: Event) => {
      const d = (e as CustomEvent<{ module: ModuleKey }>).detail;
      if (d?.module) handleSelect(d.module);
    };
    window.addEventListener('gis:open-building-profile', onOpenProfile);
    window.addEventListener('gis:ignite-building', onIgnite);
    window.addEventListener('topbar:open-alert', onOpenAlert);
    window.addEventListener('library:reload-plan', onReloadPlan);
    window.addEventListener('demo:switch-module', onDemoSwitch);
    return () => {
      window.removeEventListener('gis:open-building-profile', onOpenProfile);
      window.removeEventListener('gis:ignite-building', onIgnite);
      window.removeEventListener('topbar:open-alert', onOpenAlert);
      window.removeEventListener('library:reload-plan', onReloadPlan);
      window.removeEventListener('demo:switch-module', onDemoSwitch);
    };
  }, []);

  return (
    <div className="flex h-[100dvh] min-h-[100dvh] flex-col overflow-hidden bg-bg-deep text-text-1">
      <TopBar scenes={scenes} selectedSceneId={selectedSceneId} onSelectScene={handleSelectScene} />
      <div className="flex min-h-0 flex-1">
        <SideNav
          active={module}
          onSelect={handleSelect}
          collapsed={navCollapsed}
          onToggleCollapsed={() => setNavCollapsed((v) => !v)}
        />
        <main className="relative min-w-0 flex-1">
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
              ) : module === 'overview' ? (
                <RealGisMap />
              ) : (
                <RealSceneView sceneId={selectedSceneId} />
              )}
            </motion.div>
          </AnimatePresence>

          {module === 'overview' && (
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
              <BuildingProfilePanel />
            </DraggablePanel>
          )}
          {module === 'drill' && (
            <>
              <DraggablePanel
                panelId="drill-scenario"
                title="情景参数设置"
                icon={Crosshair}
                width={400}
                dock="left"
                defaultPos={{ x: 16, y: 16 }}
                open={scenarioPanelOpen}
                onOpenChange={setScenarioPanelOpen}
              >
                <ScenarioPanel />
              </DraggablePanel>
              <DraggablePanel
                panelId="drill-plan"
                title="预案输出"
                icon={FileText}
                width={480}
                dock="right"
                defaultPos={{ x: 16, y: 16 }}
                height="calc(100% - 280px)"
                open={planPanelOpen}
                onOpenChange={setPlanPanelOpen}
              >
                <PlanOutputPanel />
              </DraggablePanel>
              {!libraryPanelOpen && (
                <button
                  onClick={() => setLibraryPanelOpen(true)}
                  className="absolute bottom-6 left-4 z-40 flex items-center gap-1.5 rounded-lg border border-line bg-bg-panel/90 px-3 py-2 text-[13px] text-text-2 backdrop-blur transition hover:border-line-glow hover:text-cyan"
                  title="打开预案库（归档预案/对抗评估/改进措施）"
                >
                  <Archive className="h-4 w-4 text-cyan" />
                  预案库
                </button>
              )}
              <DraggablePanel
                panelId="plan-library"
                title="预案库"
                icon={Archive}
                width={420}
                dock="left"
                defaultPos={{ x: 16, y: 430 }}
                open={libraryPanelOpen}
                onOpenChange={setLibraryPanelOpen}
              >
                <PlanLibraryPanel />
              </DraggablePanel>
            </>
          )}
          <SceneCommandBridge />
          <AgentChat module={module} onOpenPanel={handleAgentOpenPanel} />
        </main>
      </div>
    <ToastHost />
  </div>
  );
}
