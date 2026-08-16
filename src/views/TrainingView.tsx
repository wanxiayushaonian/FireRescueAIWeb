// 熟悉考核模块 · 主视图（一级：六熟悉 AI 引导/自主浏览 + 点位详情；二级：岗位考核）
import { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen, MapPinned } from 'lucide-react';
import DraggablePanel from '@/components/DraggablePanel';
import FamiliarPathPanel from '@/components/training/FamiliarPathPanel';
import PointDetailPanel from '@/components/training/PointDetailPanel';
import ExamView from '@/components/training/ExamView';
import type { FamiliarNode } from '@/mock/training';
import { fetchFamiliarNodes } from '@/mock/training';
import type { FetchState } from '@/mock/types';
import { addSceneAction } from '@/mock/sceneLog';
import { showToast } from '@/components/Toast';
import { useScene } from '@/components/SceneProvider';
import { storyIdsForFloorSpec } from '@/lib/floor-focus';
import SixFamiliarGuide from '@/components/training/SixFamiliarGuide';

export interface TrainingViewProps {
  /** 主代理接线用：向智能体请求引导/提示（暂无则不接） */
  onRequestAgentHint?: (topic: string) => void;
}

export default function TrainingView({ onRequestAgentHint }: TrainingViewProps) {
  const { tree, recipeStore } = useScene();
  // 一级 / 二级切换
  const [mode, setMode] = useState<'familiar' | 'exam'>('familiar');
  // 一级左面板页签:AI 六熟悉顺序引导(ref 核心设计)/ 自主浏览(原三分类路径)
  const [pathTab, setPathTab] = useState<'guide' | 'browse'>('guide');

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
    // 场景联动:带楼层的点位优先 3D 楼层聚焦(与档案楼层卡片同机制:单层显设备/多层段炸开);
    // 无楼层或场景未命中(全楼/室外/屋顶等)→ GIS 坐标定位兜底
    let focused = false;
    if (n.floor && tree && recipeStore) {
      const storyIds = storyIdsForFloorSpec(tree, n.floor);
      if (storyIds.length > 0) {
        const multi = storyIds.length > 1;
        recipeStore.patchStructural({
          visibleStories: storyIds,
          yExtend: multi,
          hideDevices: multi,
        });
        focused = true;
      }
    }
    if (focused) {
      showToast(`已在 3D 场景聚焦 ${n.floor}`);
    } else {
      addSceneAction({
        action: 'flyTo',
        target: `${n.name} (${n.lng}, ${n.lat})`,
        params: { lng: n.lng, lat: n.lat },
        source: '面板',
      });
      showToast('已在地图定位该点位 · 演示数据');
    }
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

  // 引导步联动右面板:仅选中展示,不计熟悉度(熟悉度由章节完成统一回写 +4)
  const showGuideNode = (node: FamiliarNode | null): void => {
    setSelectedId(node?.id ?? null);
    if (node) setStateR('ok');
  };

  // 进入考核：一级两面板收起 → 二级界面
  const enterExam = () => {
    setLeftOpen(false);
    setRightOpen(false);
    setMode('exam');
  };

  return (
    <div className="relative h-full w-full">
      {/* 左面板：熟悉路径(左下停靠,顶部让位左上场景选择) */}
      <DraggablePanel
        panelId="training-path"
        title="熟悉考核 · 熟悉路径"
        icon={BookOpen}
        width={420}
        dock="left"
        defaultPos={{ x: 88, y: 72 }}
        bottomOffset={16}
        height="calc(100dvh - 150px)"
        open={leftOpen}
        onOpenChange={setLeftOpen}
      >
        <div className="flex h-full flex-col">
          {/* 页签:AI 六熟悉顺序引导(默认) / 自主浏览(原三分类路径) */}
          <div className="flex shrink-0 gap-0.5 border-b border-line px-2 py-1.5">
            <button
              onClick={() => setPathTab('guide')}
              className={`rounded-md px-2.5 py-1 text-[12px] transition ${
                pathTab === 'guide' ? 'bg-cyan/15 text-cyan' : 'text-text-3 hover:text-text-1'
              }`}
            >
              AI 引导 · 六熟悉
            </button>
            <button
              onClick={() => setPathTab('browse')}
              className={`rounded-md px-2.5 py-1 text-[12px] transition ${
                pathTab === 'browse' ? 'bg-cyan/15 text-cyan' : 'text-text-3 hover:text-text-1'
              }`}
            >
              自主浏览
            </button>
          </div>
          <div className="min-h-0 flex-1">
            {pathTab === 'guide' ? (
              <SixFamiliarGuide onRelatedNode={showGuideNode} onAgentHint={agentHint} />
            ) : (
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
            )}
          </div>
        </div>
      </DraggablePanel>

      {/* 右面板：点位详情(右下停靠,顶部让位右上帧率面板) */}
      <DraggablePanel
        panelId="training-detail"
        title="点位详情"
        icon={MapPinned}
        width={440}
        dock="right"
        defaultPos={{ x: 16, y: 72 }}
        bottomOffset={16}
        height="calc(100dvh - 250px)"
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
