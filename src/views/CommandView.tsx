// 实战指挥模块主视图（模块五，command.md）
// 布局：左 实时警情接入（380px）/ 右上 灾情变量监测（400×300）/ 右下 辅助决策推荐流。
// 实时数据由 src/mock/liveChannel.ts 的 mock 时钟驱动（connect('mock')，生产环境替换 WebSocket）。
import { useCallback, useEffect, useRef, useState } from 'react';
import type * as L from 'leaflet';
import dynamic from 'next/dynamic';
import { Siren, GaugeCircle, Sparkles, Video, Library } from 'lucide-react';
import DraggablePanel from '@/components/DraggablePanel';
import IncidentListPanel from '@/components/command/IncidentListPanel';
import DisasterVarsPanel from '@/components/command/DisasterVarsPanel';
import RecommendPanel from '@/components/command/RecommendPanel';
import VideoPlaybackPanel from '@/components/command/VideoPlaybackPanel';
import TacticalOverlay from '@/components/command/TacticalOverlay';
import CommandIntelPanel from '@/components/command/CommandIntelPanel';
import IncidentZoneOverlay from '@/components/command/IncidentZoneOverlay';
import IncidentTimeline from '@/components/command/IncidentTimeline';
import PlanLibraryPanel from '@/components/panels/PlanLibraryPanel';
import { addSceneAction } from '@/mock/sceneLog';
import { showToast } from '@/components/Toast';
import { recordCaseEvent } from '@/lib/case-timeline';
import { interpolateOnPolyline, type LatLng } from '@/lib/gis/vehicle-anim';
import {
  connect, disconnect, getSnapshot, injectIncident, secondsUntilArrival, setRecommendationStatus, subscribe,
} from '@/mock/liveChannel';
import type { LiveEvent, LiveSnapshot } from '@/mock/liveChannel';
import type { Recommendation, Incident as MockIncident } from '@/mock/incidents';
import { fetchIncidents } from '@/api/incidents';
import { toMockIncidents } from '@/lib/command-incident-adapter';
import { fetchAiDispatch, fetchBuildingAnalysis, type BuildingAnalysisSummary } from '@/api/dispatch';
import type { RouteRenderItem } from '@/lib/gis/route-render';
import DisposalFlowBar from '@/components/command/DisposalFlowBar';
import { useDisposalFlow } from '@/hooks/useDisposalFlow';

// GIS 底座:与总览模块同一 RealGisMap(Leaflet 浏览器库,须客户端加载,ssr:false)
const RealGisMap = dynamic(() => import('@/components/RealGisMap'), {
  ssr: false,
  loading: () => null,
});

export default function CommandView({ onIncidentSelect }: { onIncidentSelect?: (inc: {
  id: string; address: string; type: string; status: string; lng: number; lat: number; caller?: string;
}) => void }) {
  const [snap, setSnap] = useState<LiveSnapshot>(() => getSnapshot());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [incidentPanelOpen, setIncidentPanelOpen] = useState(true);
  const [intelOpen, setIntelOpen] = useState(true);
  const [varsPanelOpen, setVarsPanelOpen] = useState(true);
  const [recPanelOpen, setRecPanelOpen] = useState(true);
  const [timelineOpen, setTimelineOpen] = useState(true);
  const [videoOpen, setVideoOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const timersRef = useRef<number[]>([]);
  const selectedIdRef = useRef<string | null>(null);
  // 真实模式:fetchIncidents(incidents DB)→ adapter → 面板格式;mock 模式走 liveChannel 状态机
  // (2026-08-20 用户裁定:mock 主线演示,不对接业务库——默认模拟演练)
  const [mode, setMode] = useState<'real' | 'mock'>('mock');
  const [realIncidents, setRealIncidents] = useState<MockIncident[]>([]);
  const [analysisSummary, setAnalysisSummary] = useState<BuildingAnalysisSummary | null>(null);
  const [dispatchRoutes, setDispatchRoutes] = useState<RouteRenderItem[]>([]);
  const dispatchingRef = useRef<string | null>(null);
  // GIS 底图实例(RealGisMap onMapReady 注入,供战术推演层投影)
  const [gisMap, setGisMap] = useState<L.Map | null>(null);
  const demoActiveRef = useRef(false);

  // Events handler with demo-gate on status toast
  const handleEvents = useCallback((events: LiveEvent[]) => {
    for (const ev of events) {
      if (ev.kind === 'status') {
        if (!demoActiveRef.current) showToast(`${ev.incident.id} 状态更新：${ev.to} · 演示数据`);
        recordCaseEvent(ev.incident.id, 'status', `状态推进:${ev.from} → ${ev.to}`, ev.incident.address);
        if (ev.to === '到场') {
          addSceneAction({
            action: 'highlight',
            target: `${ev.incident.address}（到场确认）`,
            params: { incidentId: ev.incident.id },
            source: '面板',
          });
        }
        if (ev.to === '熄灭') {
          // 仅当前选中警情熄灭才复位视角;非选中警情(状态机自行推进)只记时间轴,不打断用户当前视野
          if (ev.incident.id === selectedIdRef.current) {
            addSceneAction({
              action: 'resetView',
              target: `警情 ${ev.incident.id} 处置完毕，视角复位`,
              source: '面板',
            });
          }
        }
      } else if (ev.kind === 'rescue') {
        showToast(
          ev.trapped === 0
            ? `${ev.incidentId} 被困人员已全部救出 · 演示数据`
            : `${ev.incidentId} 救援进展：成功救出 1 人，剩余 ${ev.trapped} 人 · 演示数据`,
        );
        recordCaseEvent(
          ev.incidentId,
          'rescue',
          ev.trapped === 0 ? '被困人员全部救出' : `救出 1 人,剩余 ${ev.trapped} 人`,
        );
      }
    }
  }, []);

  // 建立实时通道（mock），卸载时断开并清理全部定时器
  useEffect(() => {
    connect('mock');
    const unsub = subscribe((s, events) => {
      setSnap(s);
      if (events.length) handleEvents(events);
    });
    return () => {
      unsub();
      disconnect();
      timersRef.current.forEach((t) => window.clearTimeout(t));
      timersRef.current = [];
    };
  }, [handleEvents]);

  // 真实警情:fetchIncidents(incidents DB 经 BFF)→ adapter → 面板格式
  useEffect(() => {
    let alive = true;
    fetchIncidents()
      .then((list) => { if (alive) setRealIncidents(toMockIncidents(list)); })
      .catch(() => { /* BFF/znya 失败留空,可切模拟模式 */ });
    return () => { alive = false; };
  }, []);

  // 警情源:真实模式用 realIncidents(incidents DB),模拟模式用 liveChannel mock
  const incidents = mode === 'real' ? realIncidents : snap.incidents;
  const selected = incidents.find((i) => i.id === selectedId) ?? null;
  const selectedVars = selected ? snap.vars[selected.id] ?? null : null;
  const mockRecs = selected
    ? snap.recommendations.filter((r) => r.incidentId === selected.id)
    : [];
  // 真实模式:把 fetchAiDispatch 的真实多站路线转为派遣推荐卡
  const dispatchRecs: Recommendation[] =
    mode === 'real' && selected
      ? dispatchRoutes.map((r, i) => ({
          id: `dispatch-${selected.id}-${i}`,
          incidentId: selected.id,
          type: 'force' as const,
          content: `${r.stationName ?? '站点'} · ${r.duration ? Math.round(r.duration / 60) + '分钟到场' : '?分钟'}${r.distance ? ' / ' + (r.distance / 1000).toFixed(1) + 'km' : ''}`,
          basis: 'AI 智能派遣(plan_dispatch · 真实多站路线)',
          ts: '',
        }))
      : [];
  const selectedRecs = mode === 'real' ? dispatchRecs : mockRecs;

  // 选中警情 → 中右两面板加载 + flyTo 日志（同一警情重复选中不重复写日志）
  const selectIncident = useCallback((id: string, withDispatch: boolean) => {
    if (id === selectedIdRef.current) return;
    selectedIdRef.current = id;
    setSelectedId(id);
    setVarsPanelOpen(true);
    setRecPanelOpen(true);
    setAnalysisSummary(null);
    setDispatchRoutes([]);
    const list = mode === 'real' ? realIncidents : getSnapshot().incidents;
    const inc = list.find((i) => i.id === id);
    if (!inc) return;
    onIncidentSelect?.({
      id: inc.id,
      address: inc.address,
      type: inc.type,
      status: inc.status,
      lng: inc.lng,
      lat: inc.lat,
      caller: inc.caller,
    });
    addSceneAction({
      action: 'addMarker', target: `警情定位 ${inc.id}：${inc.address}`,
      params: { lng: inc.lng, lat: inc.lat, incidentId: inc.id }, source: '面板',
    });
    if (Number.isFinite(inc.lng) && Number.isFinite(inc.lat)) {
      const ringM = 1500;
      const dLat = ringM / 111320;
      const dLng = ringM / (111320 * Math.cos((inc.lat * Math.PI) / 180));
      gisMap?.fitBounds(
        [
          [inc.lat - dLat, inc.lng - dLng],
          [inc.lat + dLat, inc.lng + dLng],
        ],
        { paddingTopLeft: [480, 60], paddingBottomRight: [440, 60], maxZoom: 15, animate: true },
      );
      window.dispatchEvent(new CustomEvent('gis:set-layer', { detail: { layer: 'water', on: true } }));
      window.dispatchEvent(new CustomEvent('gis:set-layer', { detail: { layer: 'stations', on: true } }));
    }
    recordCaseEvent(inc.id, 'manual', `选定案件 ${inc.id}`, `${inc.address} · ${inc.type} · ${inc.status}`);
    const needsDispatch = inc.status === '接警' || inc.status === '出动';
    if (!needsDispatch || !withDispatch) {
      // 仅手动选中已到场/控制/熄灭案件(needsDispatch=false)才记录"力量已到场";
      // 演示路径(withDispatch=false 且 needsDispatch=true)静默跳过,派遣由剧本自行编排
      if (!needsDispatch) recordCaseEvent(inc.id, 'manual', '案件处置中(力量已到场,不再重复派遣)');
      return;
    }
    // 原有 AI 派遣 + dispatchRoutes 设置块(原 L197-220)原样保留
    if (Number.isFinite(inc.lng) && Number.isFinite(inc.lat)) {
      dispatchingRef.current = id;
      Promise.all([
        fetchAiDispatch({ name: inc.address, lng: inc.lng, lat: inc.lat }).then((r) => r.routes).catch(() => [] as RouteRenderItem[]),
        mode === 'real' ? fetchBuildingAnalysis(inc.lng, inc.lat).catch(() => null) : Promise.resolve(null),
      ]).then(([routes, summary]) => {
        if (dispatchingRef.current !== id) return; // 已切到别的警情,丢弃过期结果
        setDispatchRoutes(routes);
        setAnalysisSummary(summary);
        if (routes.length) {
          addSceneAction({
            action: 'showRoute', target: `派遣路线 → ${inc.address}`,
            // source='智能体'(非'面板')→ use-scene-bridge 消费 showRoute + renderRoutes 画线
            params: { routes, incidentId: inc.id }, source: '智能体',
          });
          recordCaseEvent(
            inc.id, 'dispatch',
            `AI 派遣 ${routes.length} 站联动`,
            routes.map((r) => `${r.stationName ?? '站点'} ${r.duration ? Math.round(r.duration / 60) + 'min' : '?'}`).join(' · '),
          );
        }
      });
    }
  }, [mode, realIncidents, onIncidentSelect, gisMap]);

  const handleSelect = useCallback((id: string) => selectIncident(id, true), [selectIncident]);

  // disposal-flow demo hook (after selectIncident so onDemoIncident can reference it)
  const flow = useDisposalFlow({
    gisMap,
    onDemoIncident: useCallback((inc) => selectIncident(inc.id, false), [selectIncident]),
    onPanelChange: useCallback((id, open) => {
      if (id === 'vars') setVarsPanelOpen(open);
      else setRecPanelOpen(open);
    }, []),
  });
  // Stable ref mirror for handleEvents closure
  useEffect(() => { demoActiveRef.current = flow.demoActive; }, [flow.demoActive]);

  // 车辆行进动画:派遣路线就绪后,每条路线一个车标按真实 ETA 压缩行进(演示节奏
  // 1min真实=6s演示,夹 20-50s),到案点记"到场"时间轴节点。切案/卸载/换路线清理。
  // 到场时刻与状态机对齐:以状态机翻「到场」的剩余秒数为基准按真实 ETA 比例分配时长,
  // 最远站恰在状态翻「到场」时到达——消除"状态:到场"与"车组到场"两条时间线错位。
  const vehiclesRef = useRef<{ markers: Array<{ remove: () => void }>; raf: number | null }>({ markers: [], raf: null });
  useEffect(() => {
    const { markers, raf } = vehiclesRef.current;
    for (const m of markers) m.remove();
    if (raf != null) cancelAnimationFrame(raf);
    vehiclesRef.current = { markers: [], raf: null };
    // During demo, vehicle convoy is managed by useDisposalFlow
    if (flow.demoActive) return;
    if (!gisMap || !selectedId || dispatchRoutes.length === 0) return;
    const leaflet = require('leaflet') as typeof import('leaflet');
    const remainingMs = (secondsUntilArrival(selectedId) ?? 0) * 1000;
    // 状态机已翻到场(取数窗口跨越翻转):2.5s 短收尾,车标快速到位,不再按真实 ETA 慢走
    const maxEtaMs = Math.max(...dispatchRoutes.map((r) => r.duration ?? 0), 1);
    const durations = dispatchRoutes.map((r) => {
      if (remainingMs <= 0) return 2500;
      const etaMs = r.duration ?? maxEtaMs;
      return Math.max(2500, (remainingMs * etaMs) / maxEtaMs);
    });

    const anims = dispatchRoutes.map((r, i) => {
      const station = r.stationName ?? '站点';
      const marker = leaflet
        .marker(r.polyline[0] as [number, number], {
          zIndexOffset: 900,
          icon: leaflet.divIcon({
            className: '',
            html: `<div style="display:flex;align-items:center;gap:3px;padding:2px 6px;border-radius:999px;background:rgba(10,26,38,.85);border:1px solid #22d3ee66;font-size:10px;color:#e2f3f8;white-space:nowrap;transform:translate(-50%,-50%)">🚒 ${station} 途中</div>`,
            iconSize: [0, 0],
          }),
        })
        .addTo(gisMap);
      return {
        marker,
        station,
        polyline: r.polyline as LatLng[],
        durationMs: durations[i],
        done: false,
      };
    });
    vehiclesRef.current.markers = anims.map((a) => a.marker);

    const t0 = performance.now();
    const tick = (now: number): void => {
      let allDone = true;
      for (const a of anims) {
        const p = Math.min(1, (now - t0) / a.durationMs);
        if (p < 1) allDone = false;
        const pos = interpolateOnPolyline(a.polyline, p);
        if (pos) (a.marker as unknown as { setLatLng: (p2: [number, number]) => void }).setLatLng(pos);
        if (p >= 1 && !a.done) {
          a.done = true;
          (a.marker as unknown as { setIcon: (i: unknown) => void }).setIcon(
            leaflet.divIcon({
              className: '',
              html: `<div style="display:flex;align-items:center;gap:3px;padding:2px 6px;border-radius:999px;background:rgba(10,26,38,.85);border:1px solid #34d39988;font-size:10px;color:#d5f5e3;white-space:nowrap;transform:translate(-50%,-50%)">✓ ${a.station} 到场</div>`,
              iconSize: [0, 0],
            }),
          );
          recordCaseEvent(selectedId, 'arrival', `${a.station} 车组到场`);
        }
      }
      if (!allDone) vehiclesRef.current.raf = requestAnimationFrame(tick);
    };
    vehiclesRef.current.raf = requestAnimationFrame(tick);
    return () => {
      const v = vehiclesRef.current;
      if (v.raf != null) cancelAnimationFrame(v.raf);
      for (const m of v.markers) m.remove();
      vehiclesRef.current = { markers: [], raf: null };
    };
  }, [gisMap, selectedId, dispatchRoutes, flow.demoActive]);

  // 模拟新警情接入：1s 内顶部插入（先 toast，再入列）
  const handleInject = useCallback(() => {
    showToast('110 联动接入新警情 · 演示数据');
    const t = window.setTimeout(() => {
      const inc = injectIncident();
      addSceneAction({
        action: 'addMarker',
        target: `新警情 ${inc.id}：${inc.address}`,
        params: { lng: inc.lng, lat: inc.lat, incidentId: inc.id },
        source: '面板',
      });
      handleSelect(inc.id);
    }, 800);
    timersRef.current.push(t);
  }, [handleSelect]);

  const handleAdopt = useCallback((rec: Recommendation) => {
    setRecommendationStatus(rec.id, 'adopted');
    addSceneAction({
      action: 'addMarker',
      target: `采纳推荐：${rec.content.slice(0, 18)}…`,
      params: { recId: rec.id },
      source: '面板',
    });
    showToast('已采纳推荐并同步指挥链 · 演示数据');
  }, []);

  const handleIgnore = useCallback((rec: Recommendation) => {
    setRecommendationStatus(rec.id, 'ignored');
  }, []);

  const handleShowRoute = useCallback((rec: Recommendation) => {
    addSceneAction({
      action: 'showRoute',
      target: `增援路线（cyan）：城东救援站 → 警情现场（${rec.incidentId}）`,
      params: { kind: 'reinforce', color: '#22d3ee', incidentId: rec.incidentId },
      source: '面板',
    });
    showToast('已在场景中展示增援路线 · 演示数据');
  }, []);

  const handleFlushImprovement = useCallback((impId: string, incidentId: string) => {
    addSceneAction({
      action: 'addMarker',
      target: `预案库更新标记（${impId} · 源自 ${incidentId} 复盘）`,
      params: { impId, incidentId },
      source: '预案引擎',
    });
    showToast('改进措施已写入预案库');
  }, []);

  const handleExportReport = useCallback(() => {
    showToast('评估报告导出任务已创建（模拟）');
  }, []);

  return (
    <div className="relative h-full w-full">
      {/* GIS 底座：显式 pointer-events-auto 覆盖 App.tsx 内容层的 pointer-events-none
          （非 overview 模块整层被设为 none 以让 3D 场景接收事件，但指挥模块的 GIS 地图
          同在内容层，须自救恢复交互；TacticalOverlay 仍 pointer-events-none 不拦截底图）。
          与态势总览同一 RealGisMap 全量 chrome；警情是本模块核心业务对象，图层默认开 */}
      <div className="pointer-events-auto absolute inset-0">
        <RealGisMap initialLayers={{ incidents: true }} onMapReady={setGisMap} preserveLayersOnActivity />
      </div>

      {/* 案域圈层:选中警情的三级作战域(500m 警戒/1.5km 作战/3km 支援) */}
      <IncidentZoneOverlay map={gisMap} incident={selected ? { lng: selected.lng, lat: selected.lat } : null} />

      {/* 战术推演层：蔓延圈 / 力量部署 / 进攻路线（真实地图投影，跟随 pan/zoom，pointer-events-none 不影响底图交互） */}
      <TacticalOverlay
        map={gisMap}
        incident={selected}
        vars={selectedVars}
        recommendations={snap.recommendations}
      />

      {/* 顶部居中:真实/模拟模式切换(真实=incidents DB;模拟=liveChannel 状态机演示)。
          top-[60px] 堆叠在 GIS 图层控制条(top-3)之下,避免两条重叠 */}
      <div className="absolute left-1/2 top-[60px] z-30 flex -translate-x-1/2 items-center gap-1 rounded-md border border-line bg-bg-panel/90 p-1 backdrop-blur-[8px]">
        <button
          onClick={() => setMode('real')}
          className={`rounded px-3 py-1 text-[12px] transition ${mode === 'real' ? 'bg-cyan/15 text-cyan' : 'text-text-3 hover:text-text-1'}`}
        >真实警情</button>
        <button
          onClick={() => setMode('mock')}
          className={`rounded px-3 py-1 text-[12px] transition ${mode === 'mock' ? 'bg-cyan/15 text-cyan' : 'text-text-3 hover:text-text-1'}`}
        >模拟演练</button>
      </div>

      {/* 处置流程演示条:一键新警情演示 */}
      <DisposalFlowBar
        demoActive={flow.demoActive}
        stage={flow.stage}
        following={flow.following}
        disabled={!gisMap || mode === 'real'}
        onStart={() => { flow.startDemo(); }}
        onStop={flow.stopDemo}
      />

      {/* 右上悬浮:预案库 + 现场视频回传(选中警情后视频可用)。
          right-[440px]:让开右侧 C 面板(vars,right:16 width:400 → 左边缘 right:416),
          留 24px 间隙避免水平 bleed;top-[110px] 紧贴模式切换条(top-[60px])下方 */}
      <div className="absolute right-[440px] top-[15px] z-30 flex items-center gap-2">
        <button
          onClick={() => {
            // 预案库 480×560 浮层会完全遮挡右侧 vars/recommend 及左侧 intel(宽度 560 溢出到库面板区域),
            // 打开时自动关闭冲突面板,避免用户看到被盖住的面板却不知如何操作;关闭后用户可手动重开。
            if (!libraryOpen) {
              setIntelOpen(false);
              setVarsPanelOpen(false);
              setRecPanelOpen(false);
            }
            setLibraryOpen((v) => !v);
          }}
          title="预案库（战后评估回流 / 正式预案建档）"
          className="flex items-center gap-2 rounded-md border border-violet/60 bg-bg-panel/90 px-3 py-1.5 text-[13px] font-medium text-violet backdrop-blur-[8px] transition hover:bg-violet/10 hover:shadow-[0_0_10px_rgba(167,139,250,.3)]"
        >
          <Library className="h-4 w-4" />
          预案库
        </button>
        <button
          onClick={() => selected && setVideoOpen(true)}
          disabled={!selected}
          title={selected ? '打开现场视频回传' : '请先选择警情'}
          className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-[13px] font-medium backdrop-blur-[8px] transition ${
            selected
              ? 'border-red/60 bg-bg-panel/90 text-red hover:bg-red/10 hover:shadow-[0_0_10px_rgba(239,68,68,.3)]'
              : 'cursor-not-allowed border-line bg-bg-panel/70 text-text-3 opacity-60'
          }`}
        >
          <Video className="h-4 w-4" />
          现场视频回传
        </button>
      </div>

      {/* 现场视频回传弹窗（mock 播放器，FLV/HLS 接入区） */}
      <VideoPlaybackPanel
        open={videoOpen}
        onOpenChange={setVideoOpen}
        sourceName={selected?.address}
      />

      {/* 左：实时警情接入(高度让位左下作战要素卡片区)
          预算:下方 intel 面板 330px + bottomOffset 16px + 30px 间距 = 376px,
          故 height = calc(100% - 376px),确保 A 底边与 B 顶边有 30px 间隙 */}
      <DraggablePanel
        panelId="command-incidents"
        title="实时警情接入"
        icon={Siren}
        width={380}
        dock="left"
        defaultPos={{ x: 16, y: 16 }}
        height="calc(100% - 376px)"
        open={incidentPanelOpen}
        onOpenChange={setIncidentPanelOpen}
      >
        <IncidentListPanel
          incidents={incidents}
          selectedId={selectedId}
          onSelect={handleSelect}
          onInject={mode === 'mock' ? handleInject : undefined}
          channelDown={false}
        />
      </DraggablePanel>

      {/* 左下：作战要素卡片(ref 5.5 周边水源/设施完好/物质理化/被困位置) */}
      <DraggablePanel
        panelId="command-intel"
        title="作战要素"
        icon={Sparkles}
        width={560}
        dock="left"
        defaultPos={{ x: 16, y: 16 }}
        bottomOffset={16}
        height="330px"
        open={intelOpen}
        onOpenChange={setIntelOpen}
      >
        <div className="h-full overflow-y-auto p-2 [scrollbar-width:thin]">
          <CommandIntelPanel incident={selected} vars={selectedVars} />
        </div>
      </DraggablePanel>

      {/* 右上：灾情变量监测 */}
      <DraggablePanel
        panelId="command-vars"
        title={selected ? `灾情变量 · ${selected.id}` : '灾情变量监测'}
        icon={GaugeCircle}
        width={400}
        dock="right"
        defaultPos={{ x: 16, y: 16 }}
        height="300px"
        open={varsPanelOpen}
        onOpenChange={setVarsPanelOpen}
      >
        <DisasterVarsPanel incident={selected} vars={selectedVars} />
        {mode === 'real' && selected && (
          <div className="border-t border-line p-3 text-[12px]">
            <div className="mb-2 text-text-3">AI 响应分析{analysisSummary ? '' : ' · 加载中…'}</div>
            {analysisSummary ? (
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded border border-line bg-bg-panel/60 py-2">
                  <div className="text-[10px] text-text-3">周边主力站</div>
                  <div className="font-num text-cyan">{analysisSummary.stationCount}</div>
                </div>
                <div className="rounded border border-line bg-bg-panel/60 py-2">
                  <div className="text-[10px] text-text-3">最近到场</div>
                  <div className="font-num text-cyan">{analysisSummary.nearestEtaMin ?? '—'}{analysisSummary.nearestEtaMin != null ? '分' : ''}</div>
                </div>
                <div className="rounded border border-line bg-bg-panel/60 py-2">
                  <div className="text-[10px] text-text-3">周边水源</div>
                  <div className="font-num text-cyan">{analysisSummary.waterCount}</div>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </DraggablePanel>

      {/* 右下：辅助决策推荐流 */}
      <DraggablePanel
        panelId="command-recommend"
        title="辅助决策 · 实时推荐"
        icon={Sparkles}
        width={400}
        dock="right"
        defaultPos={{ x: 16, y: 332 }}
        height="calc(100% - 348px)"
        open={recPanelOpen}
        onOpenChange={setRecPanelOpen}
      >
        <RecommendPanel
          incident={selected}
          recommendations={selectedRecs}
          onAdopt={handleAdopt}
          onIgnore={handleIgnore}
          onShowRoute={handleShowRoute}
          onFlushImprovement={handleFlushImprovement}
          onExportReport={handleExportReport}
        />
      </DraggablePanel>

      {/* 处置时间轴:选中案件的动作流水(选定/状态/派遣/到场/救援)——案卷的骨架,
          与态势总览"全市一张图"分工:本模块以时间为轴管单案 */}
      <DraggablePanel
        panelId="command-timeline"
        title={selected ? `处置时间轴 · ${selected.id}` : '处置时间轴'}
        icon={GaugeCircle}
        width={280}
        dock="right"
        defaultPos={{ x: 432, y: 332 }}
        height="calc(100% - 348px)"
        open={timelineOpen}
        onOpenChange={setTimelineOpen}
      >
        <IncidentTimeline incidentId={selectedId} />
      </DraggablePanel>

      {/* 预案库（默认关闭；战后评估改进措施回流 / 正式预案建档可查） */}
      <DraggablePanel
        panelId="command-library"
        title="预案库"
        icon={Library}
        width={480}
        dock="right"
        defaultPos={{ x: 16, y: 16 }}
        height="min(560px, 76dvh)"
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
      >
        <PlanLibraryPanel />
      </DraggablePanel>
    </div>
  );
}
