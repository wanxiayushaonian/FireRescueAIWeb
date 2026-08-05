import { motion } from 'framer-motion';
import { Copy, Crosshair, CheckCircle2 } from 'lucide-react';
import type { FamiliarNode } from '@/mock/training';
import type { FetchState } from '@/mock/types';
import { addSceneAction } from '@/mock/sceneLog';
import PanelStateView from '@/components/PanelStateView';
import DemoTag from '@/components/DemoTag';
import { showToast } from '@/components/Toast';
import { StateSelect } from './FamiliarPathPanel';

export interface PointDetailPanelProps {
  node: FamiliarNode | null;
  state: FetchState;
  demoState: FetchState;
  onDemoStateChange: (s: FetchState) => void;
  onRetry: () => void;
  onMarkFamiliar: (id: string) => void;
}

const cardStagger = {
  hidden: { opacity: 0, x: -8 },
  show: (i: number) => ({ opacity: 1, x: 0, transition: { delay: i * 0.08, duration: 0.25 } }),
};

function Card({ index, title, children }: { index: number; title: string; children: React.ReactNode }) {
  return (
    <motion.div
      custom={index}
      variants={cardStagger}
      initial="hidden"
      animate="show"
      className="mb-3 rounded-md border border-line bg-bg-panel-2/30 p-3"
    >
      <div className="mb-1.5 text-[12px] font-bold tracking-wide text-cyan-dim">{title}</div>
      {children}
    </motion.div>
  );
}

/** 一级 · 右面板：点位详情 / 点位查询结果 */
export default function PointDetailPanel({
  node,
  state,
  demoState,
  onDemoStateChange,
  onRetry,
  onMarkFamiliar,
}: PointDetailPanelProps) {
  const copyCoord = (text: string) => {
    void navigator.clipboard?.writeText(text).catch(() => {});
    showToast('已复制坐标 · 演示数据');
  };

  const locate = (n: FamiliarNode) => {
    addSceneAction({
      action: 'flyTo',
      target: `${n.name} (${n.lng}, ${n.lat})`,
      params: { lng: n.lng, lat: n.lat },
      source: '面板',
    });
    if (n.floor) {
      addSceneAction({ action: 'switchFloor', target: `切换至 ${n.floor}`, params: { floor: n.floor }, source: '面板' });
    }
    showToast('已写入场景动作日志 · 演示数据');
  };

  const highlightRelated = (n: FamiliarNode, chip: string) => {
    addSceneAction({
      action: 'batchHighlight',
      target: `${n.name} 关联设施：${chip}`,
      params: { nodeId: n.id, facility: chip },
      source: '面板',
    });
    showToast('已写入场景动作日志 · 演示数据');
  };

  return (
    <div className="flex h-full flex-col">
      {/* 顶部：状态演示 */}
      <div className="flex items-center justify-between border-b border-line px-3 pb-2 pt-2.5">
        <div className="flex items-center gap-2 text-[12px] text-text-3">
          {node ? (
            <>
              当前点位
              <span className="rounded border border-line bg-bg-panel-2 px-1.5 py-px text-text-2">{node.name}</span>
            </>
          ) : (
            '点位查询结果'
          )}
          <DemoTag />
        </div>
        <StateSelect value={demoState} onChange={onDemoStateChange} />
      </div>

      {state !== 'ok' ? (
        <div className="min-h-0 flex-1">
          <PanelStateView
            state={state}
            onRetry={state === 'error' ? onRetry : undefined}
            skeletonRows={7}
          />
        </div>
      ) : !node ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6">
          <img src="/empty-box.svg" alt="" className="h-[90px] w-[120px] opacity-80" />
          <div className="max-w-[260px] text-center text-[13px] leading-5 text-text-2">
            请选择左侧熟悉路径中的点位，或直接向智能体提问
          </div>
          <DemoTag />
        </div>
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2 [scrollbar-width:thin]">
            {/* 基本信息 */}
            <Card index={0} title="基本信息">
              <div className="space-y-1 text-[13px]">
                <Row label="名称" value={node.name} />
                <Row label="所在楼层" value={node.floor ?? '—'} />
                <Row label="数量" value={node.count != null ? `${node.count}` : '—'} />
                <Row label="责任队站" value="金茂大厦微型站 / 城东救援站" />
                {node.lastExamAt && <Row label="最近考核" value={`${node.lastExamAt} · 演示数据`} />}
                <div className="flex gap-2 py-0.5">
                  <span className="w-16 shrink-0 text-text-3">坐标</span>
                  <button
                    onClick={() => copyCoord(`${node.lng}, ${node.lat}`)}
                    className="inline-flex cursor-pointer items-center gap-1 font-mono text-cyan transition hover:brightness-110"
                    title="点击复制"
                  >
                    {node.lng}, {node.lat}
                    <Copy className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </Card>

            {/* 熟悉要点 */}
            <Card index={1} title={`熟悉要点（${node.points.length} 条）`}>
              <ol className="space-y-1.5">
                {node.points.map((p, i) => (
                  <li key={i} className="flex gap-2 text-[13px] leading-5 text-text-1">
                    <span className="shrink-0 font-num text-cyan">{String(i + 1).padStart(2, '0')}</span>
                    <span>{p}</span>
                  </li>
                ))}
              </ol>
            </Card>

            {/* 关联设施 */}
            <Card index={2} title="关联设施">
              <div className="flex flex-wrap gap-1.5">
                {node.relatedFacilities.map((f) => (
                  <button
                    key={f}
                    onClick={() => highlightRelated(node, f)}
                    className="cursor-pointer rounded-md border border-line bg-bg-panel px-2 py-1 text-[12px] text-text-2 transition hover:border-cyan hover:text-cyan"
                    title="点击批量高亮该关联设施"
                  >
                    {f}
                  </button>
                ))}
              </div>
            </Card>

            {/* 常见考核点 */}
            <Card index={3} title="常见考核点">
              <ul className="space-y-1">
                {node.examHints.map((h, i) => (
                  <li key={i} className="text-[12px] leading-5 text-text-2">· {h}</li>
                ))}
              </ul>
              <div className="mt-1.5 text-[11px] text-text-3">题库依据 · 演示数据</div>
            </Card>
          </div>

          {/* 底部工具条 */}
          <div className="flex shrink-0 gap-2 border-t border-line px-3 py-2.5">
            <button
              onClick={() => locate(node)}
              className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md border border-cyan/60 text-[13px] text-cyan transition hover:bg-cyan/10 hover:shadow-[0_0_10px_rgba(34,211,238,.3)]"
            >
              <Crosshair className="h-4 w-4" />
              场景定位
            </button>
            <button
              onClick={() => {
                onMarkFamiliar(node.id);
                showToast(`已标记「${node.name}」为已熟悉 · 演示数据`);
              }}
              className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md border border-green/60 text-[13px] text-green transition hover:bg-green/10"
            >
              <CheckCircle2 className="h-4 w-4" />
              标记为已熟悉
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 py-0.5">
      <span className="w-16 shrink-0 text-text-3">{label}</span>
      <span className="min-w-0 flex-1 text-text-1">{value}</span>
    </div>
  );
}
