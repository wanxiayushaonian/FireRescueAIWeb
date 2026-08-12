// 熟悉考核模块 · 主视图（一级：三条熟悉路径 + 点位详情；二级：岗位考核）
import { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen, MapPinned } from 'lucide-react';
import DraggablePanel from '@/components/DraggablePanel';
import { SceneInfoCard, SceneLogPanel } from '@/components/SceneOverlays';
import FamiliarPathPanel from '@/components/training/FamiliarPathPanel';
import PointDetailPanel from '@/components/training/PointDetailPanel';
import ExamView from '@/components/training/ExamView';
import type { FamiliarNode } from '@/mock/training';
import { fetchFamiliarNodes } from '@/mock/training';
import type { FetchState } from '@/mock/types';
import { addSceneAction } from '@/mock/sceneLog';
import { showToast } from '@/components/Toast';

export interface TrainingViewProps {
  /** 主代理接线用：向智能体请求引导/提示（暂无则不接） */
  onRequestAgentHint?: (topic: string) => void;
}

export default function TrainingView({ onRequestAgentHint }: TrainingViewProps) {
  // 一级 / 二级切换
  const [mode, setMode] = useState<'familiar' | 'exam'>('familiar');

  // 左面板：路径数据
  const [demoStateL, setDemoStateL] = useState<FetchState>('ok');
  const [stateL, setStateL] = useState<FetchState>('loading');
  const [nodes, setNodes] = useState<FamiliarNode[]>([]);

  // 右面板：选中点位 + 加载态
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [demoStateR, setDemoStateR] = useState<FetchState>('ok');
  const [stateR, setStateR] = useState<FetchState>('ok');
  const detailTimer = useRef<number | null>(null);

  // 面板开关
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);

  const loadPaths = useCallback(async (s: FetchState) => {
    setStateL('loading');
    try {
      const data = await fetchFamiliarNodes({ state: s });
      setNodes(data);
      setStateL(data.length ? 'ok' : 'empty');
    } catch {
      setNodes([]);
      setStateL('error');
    }
  }, []);

  useEffect(() => {
    loadPaths(demoStateL);
  }, [demoStateL, loadPaths]);

  const selected = nodes.find((n) => n.id === selectedId) ?? null;

  // 选中点位：右面板模拟加载 + 场景联动 + 熟悉度 +8
  const selectNode = (n: FamiliarNode) => {
    setSelectedId(n.id);
    if (detailTimer.current) window.clearTimeout(detailTimer.current);
    if (demoStateR === 'ok') {
      setStateR('loading');
      detailTimer.current = window.setTimeout(() => setStateR('ok'), 350);
    } else {
      setStateR(demoStateR);
    }
    // mock 即时反馈：熟悉度 +8%（封顶 100%）
    setNodes((prev) =>
      prev.map((x) => (x.id === n.id ? { ...x, familiarity: Math.min(100, x.familiarity + 8) } : x)),
    );
    addSceneAction({
      action: 'flyTo',
      target: `${n.name} (${n.lng}, ${n.lat})`,
      params: { lng: n.lng, lat: n.lat },
      source: '面板',
    });
    addSceneAction({
      action: 'highlight',
      target: `${n.id} ${n.name}`,
      params: { id: n.id, floor: n.floor },
      source: '面板',
    });
    showToast('已写入场景动作日志 · 演示数据');
  };

  const markFamiliar = (id: string) => {
    setNodes((prev) => prev.map((x) => (x.id === id ? { ...x, familiarity: 100 } : x)));
  };

  // 右面板状态演示切换
  useEffect(() => {
    setStateR(demoStateR);
  }, [demoStateR]);

  const agentHint = (topic: string) => {
    if (onRequestAgentHint) onRequestAgentHint(topic);
    else showToast('请通过右下角智能体悬浮窗提问 · 演示数据');
  };

  // 进入考核：一级两面板收起 → 二级界面
  const enterExam = () => {
    setLeftOpen(false);
    setRightOpen(false);
    setMode('exam');
  };

  return (
    <div className="relative h-full w-full">
      {/* 3D 场景覆盖层（场景信息卡 + 场景动作日志） */}
      <SceneInfoCard />
      <SceneLogPanel />

      {/* 左面板：熟悉路径 */}
      <DraggablePanel
        panelId="training-path"
        title="熟悉考核 · 熟悉路径"
        icon={BookOpen}
        width={400}
        dock="left"
        defaultPos={{ x: 88, y: 72 }}
        height="calc(100dvh - 96px)"
        open={leftOpen}
        onOpenChange={setLeftOpen}
      >
        <FamiliarPathPanel
          state={stateL}
          demoState={demoStateL}
          onDemoStateChange={setDemoStateL}
          onRetry={() => loadPaths('ok')}
          nodes={nodes}
          selectedId={selectedId}
          onSelect={selectNode}
          onEnterExam={enterExam}
          onAgentHint={agentHint}
        />
      </DraggablePanel>

      {/* 右面板：点位详情 */}
      <DraggablePanel
        panelId="training-detail"
        title="点位详情"
        icon={MapPinned}
        width={440}
        dock="right"
        defaultPos={{ x: 16, y: 72 }}
        height="calc(100dvh - 96px)"
        open={rightOpen}
        onOpenChange={setRightOpen}
      >
        <PointDetailPanel
          node={selected}
          state={stateR}
          demoState={demoStateR}
          onDemoStateChange={setDemoStateR}
          onRetry={() => setStateR('ok')}
          onMarkFamiliar={markFamiliar}
        />
      </DraggablePanel>

      {/* 二级界面：岗位考核（全屏覆盖中央区） */}
      {mode === 'exam' && (
        <ExamView
          onBack={() => {
            setMode('familiar');
            setLeftOpen(true);
            setRightOpen(true);
          }}
          onRequestAgentHint={onRequestAgentHint}
        />
      )}
    </div>
  );
}
