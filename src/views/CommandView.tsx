// 实战指挥模块主视图（模块五，command.md）
// 布局：左 实时警情接入（380px）/ 右上 灾情变量监测（400×300）/ 右下 辅助决策推荐流。
// 实时数据由 src/mock/liveChannel.ts 的 mock 时钟驱动（connect('mock')，生产环境替换 WebSocket）。
import { useCallback, useEffect, useRef, useState } from 'react';
import { Siren, GaugeCircle, Sparkles, Video } from 'lucide-react';
import GisMapPlaceholder from '@/components/GisMapPlaceholder';
import DraggablePanel from '@/components/DraggablePanel';
import IncidentListPanel from '@/components/command/IncidentListPanel';
import DisasterVarsPanel from '@/components/command/DisasterVarsPanel';
import RecommendPanel from '@/components/command/RecommendPanel';
import VideoPlaybackPanel from '@/components/command/VideoPlaybackPanel';
import TacticalOverlay from '@/components/command/TacticalOverlay';
import { addSceneAction } from '@/mock/sceneLog';
import { showToast } from '@/components/Toast';
import {
  connect, disconnect, getSnapshot, injectIncident, setRecommendationStatus, subscribe,
} from '@/mock/liveChannel';
import type { LiveEvent, LiveSnapshot } from '@/mock/liveChannel';
import type { Recommendation } from '@/mock/incidents';

export default function CommandView() {
  const [snap, setSnap] = useState<LiveSnapshot>(() => getSnapshot());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [incidentPanelOpen, setIncidentPanelOpen] = useState(true);
  const [varsPanelOpen, setVarsPanelOpen] = useState(true);
  const [recPanelOpen, setRecPanelOpen] = useState(true);
  const [videoOpen, setVideoOpen] = useState(false);
  const timersRef = useRef<number[]>([]);
  const selectedIdRef = useRef<string | null>(null);

  // 事件处理：Toast + 场景动作日志（source=面板/预案引擎）
  const handleEvents = useCallback((events: LiveEvent[]) => {
    for (const ev of events) {
      if (ev.kind === 'status') {
        showToast(`${ev.incident.id} 状态更新：${ev.to} · 演示数据`);
        if (ev.to === '到场') {
          addSceneAction({
            action: 'highlight',
            target: `${ev.incident.address}（到场确认）`,
            params: { incidentId: ev.incident.id },
            source: '面板',
          });
        }
        if (ev.to === '熄灭') {
          addSceneAction({
            action: 'resetView',
            target: `警情 ${ev.incident.id} 处置完毕，视角复位`,
            source: '面板',
          });
        }
      } else if (ev.kind === 'rescue') {
        showToast(
          ev.trapped === 0
            ? `${ev.incidentId} 被困人员已全部救出 · 演示数据`
            : `${ev.incidentId} 救援进展：成功救出 1 人，剩余 ${ev.trapped} 人 · 演示数据`,
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

  const selected = snap.incidents.find((i) => i.id === selectedId) ?? null;
  const selectedVars = selected ? snap.vars[selected.id] ?? null : null;
  const selectedRecs = selected
    ? snap.recommendations.filter((r) => r.incidentId === selected.id)
    : [];

  // 选中警情 → 中右两面板加载 + flyTo 日志（同一警情重复选中不重复写日志）
  const handleSelect = useCallback((id: string) => {
    if (id === selectedIdRef.current) return;
    selectedIdRef.current = id;
    setSelectedId(id);
    setVarsPanelOpen(true);
    setRecPanelOpen(true);
    const inc = getSnapshot().incidents.find((i) => i.id === id);
    if (inc) {
      addSceneAction({
        action: 'flyTo',
        target: inc.address,
        params: { lng: inc.lng, lat: inc.lat, incidentId: inc.id },
        source: '面板',
      });
      if (Number.isFinite(inc.lng) && Number.isFinite(inc.lat)) {
        addSceneAction({
          action: 'addMarker',
          target: `警情定位 ${inc.id}：${inc.address}`,
          params: { lng: inc.lng, lat: inc.lat, incidentId: inc.id },
          source: '面板',
        });
      }
    }
  }, []);

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
    showToast('改进措施已写入预案库 · 演示数据');
  }, []);

  const handleExportReport = useCallback(() => {
    showToast('评估报告导出任务已创建（模拟）· 演示数据');
  }, []);

  return (
    <div className="relative h-full w-full">
      {/* 实战指挥落 GIS 底座（与模块一同一底图） */}
      <GisMapPlaceholder />

      {/* 战术推演层：蔓延圈 / 力量部署 / 进攻路线（纯 SVG 叠加，pointer-events-none 不影响底图交互） */}
      <TacticalOverlay
        incident={selected}
        vars={selectedVars}
        recommendations={snap.recommendations}
      />

      {/* 右上角悬浮：现场视频回传（选中警情后可用） */}
      <button
        onClick={() => selected && setVideoOpen(true)}
        disabled={!selected}
        title={selected ? '打开现场视频回传' : '请先选择警情'}
        className={`absolute right-[420px] top-4 z-30 flex items-center gap-2 rounded-md border px-3 py-1.5 text-[13px] font-medium backdrop-blur-[8px] transition ${
          selected
            ? 'border-red/60 bg-bg-panel/90 text-red hover:bg-red/10 hover:shadow-[0_0_10px_rgba(239,68,68,.3)]'
            : 'cursor-not-allowed border-line bg-bg-panel/70 text-text-3 opacity-60'
        }`}
      >
        <Video className="h-4 w-4" />
        现场视频回传
      </button>

      {/* 现场视频回传弹窗（mock 播放器，FLV/HLS 接入区） */}
      <VideoPlaybackPanel
        open={videoOpen}
        onOpenChange={setVideoOpen}
        sourceName={selected?.address}
      />

      {/* 左：实时警情接入 */}
      <DraggablePanel
        panelId="command-incidents"
        title="实时警情接入"
        icon={Siren}
        width={380}
        dock="left"
        defaultPos={{ x: 16, y: 16 }}
        height="calc(100% - 32px)"
        open={incidentPanelOpen}
        onOpenChange={setIncidentPanelOpen}
      >
        <IncidentListPanel
          incidents={snap.incidents}
          selectedId={selectedId}
          onSelect={handleSelect}
          onInject={handleInject}
          channelDown={false}
        />
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
    </div>
  );
}
