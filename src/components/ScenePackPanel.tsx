'use client';

// 场景包内容面板(数据解析展示):analyzeScenePack 清单的可视化——总览/类型表/
// 楼层矩阵(异常层高亮)/Space 语义分类/Site 级对象(出入口·车辆·屋顶设备)。
// 供 SceneDisplayModal「场景包内容」页签使用;类型行可跳显隐页签。
import { useMemo } from 'react';
import { Boxes, DoorOpen, MapPin, Truck } from 'lucide-react';
import { useScene } from '@/components/SceneProvider';
import { analyzeScenePack, type PackStoryStat } from '@/lib/scene-pack-inventory';
import { HIDABLE_TYPES } from '@/lib/scene-categories';

/** 标准层中位数偏离判定(≥3F 才参与,低层天然偏小):<-40% 或 >+30% 视为异常层 */
function isAnomalyStory(s: PackStoryStat, median: number): boolean {
  if (s.floor === null || s.floor < 3 || median <= 0) return false;
  return s.total < median * 0.6 || s.total > median * 1.3;
}

export default function ScenePackPanel({ onJumpVisibility }: { onJumpVisibility?: () => void }) {
  const { tree } = useScene();
  const inv = useMemo(() => analyzeScenePack(tree), [tree]);

  // 标准层中位数(≥3F 的地上层;异常层检测基准)
  const median = useMemo(() => {
    const totals = inv.stories.filter((s) => s.floor !== null && s.floor >= 3).map((s) => s.total).sort((a, b) => a - b);
    return totals.length ? totals[Math.floor(totals.length / 2)] : 0;
  }, [inv]);

  if (!tree || inv.totalNodes === 0) {
    return <div className="py-6 text-center text-[12px] text-text-3">场景树未加载</div>;
  }

  const siteByType = new Map<string, { label: string; count: number }>();
  for (const item of inv.siteLevel) {
    const cur = siteByType.get(item.type);
    if (cur) cur.count += 1;
    else siteByType.set(item.type, { label: item.label, count: 1 });
  }
  const entrances = inv.siteLevel.filter((s) => s.type === 'SceneInOut');

  return (
    <div className="w-full min-w-0 space-y-3">
      {/* 总览 */}
      <div className="grid grid-cols-4 gap-1.5">
        {[
          { label: '节点总数', value: inv.totalNodes.toLocaleString() },
          { label: '类型', value: `${inv.types.length} 种` },
          { label: '楼层', value: `${inv.stories.length} 层` },
          { label: 'Site 级', value: `${inv.siteLevel.length} 个` },
        ].map((c) => (
          <div key={c.label} className="rounded-md border border-line/60 bg-bg-panel-2/40 px-2 py-1.5 text-center">
            <div className="font-mono text-[13px] font-semibold text-cyan">{c.value}</div>
            <div className="text-[9px] text-text-3">{c.label}</div>
          </div>
        ))}
      </div>

      {/* 类型表(可跳显隐) */}
      <section>
        <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-text-2">
          <Boxes className="h-3.5 w-3.5 text-cyan" />
          类型清单(点击可跳显隐开关)
        </div>
        <div className="max-h-44 min-w-0 overflow-y-auto overflow-x-hidden rounded-md border border-line/60 [scrollbar-width:thin]">
          {inv.types.map((t) => (
            <button
              key={t.type}
              onClick={() => (HIDABLE_TYPES.has(t.type) ? onJumpVisibility?.() : undefined)}
              className={`flex w-full items-baseline gap-2 px-2.5 py-1 text-left text-[11px] transition ${
                HIDABLE_TYPES.has(t.type) ? 'hover:bg-bg-panel-2 hover:text-cyan' : 'cursor-default'
              }`}
            >
              <span className="min-w-0 flex-1 truncate text-text-1">{t.label}</span>
              {t.siteLevel > 0 && (
                <span className="shrink-0 rounded border border-line px-1 text-[9px] text-text-3">Site 级 {t.siteLevel}</span>
              )}
              <span className="shrink-0 font-mono text-text-2">{t.count.toLocaleString()}</span>
            </button>
          ))}
        </div>
      </section>

      {/* 楼层矩阵(异常层高亮) */}
      <section>
        <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-text-2">
          <MapPin className="h-3.5 w-3.5 text-cyan" />
          楼层内容{median > 0 && <span className="text-[9px] text-text-3">标准层中位 {median} 节点,偏离层高亮</span>}
        </div>
        <div className="max-h-40 min-w-0 overflow-y-auto overflow-x-hidden rounded-md border border-line/60 [scrollbar-width:thin]">
          {inv.stories.map((s) => {
            const anomaly = isAnomalyStory(s, median);
            return (
              <div
                key={s.name}
                className={`flex items-baseline gap-2 px-2.5 py-1 text-[11px] ${anomaly ? 'bg-orange/10' : ''}`}
              >
                <span className={`w-16 shrink-0 font-mono ${anomaly ? 'text-orange' : 'text-text-1'}`}>{s.name}</span>
                <span className="min-w-0 flex-1 truncate text-text-3">
                  {s.byType.filter((t) => t.type !== 'Wall').slice(0, 3).map((t) => `${t.type}×${t.count}`).join(' · ')}
                </span>
                <span className="shrink-0 font-mono text-text-2">{s.total}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Space 语义分类 */}
      <section>
        <div className="mb-1 text-[11px] font-medium text-text-2">空间语义分类</div>
        <div className="flex flex-wrap gap-1">
          {inv.spaceTaxonomy.slice(0, 10).map((sp) => (
            <span key={sp.name} className="rounded border border-line bg-bg-panel-2/40 px-1.5 py-0.5 text-[10px] text-text-2">
              {sp.name} <span className="font-mono text-text-3">{sp.count}</span>
            </span>
          ))}
        </div>
      </section>

      {/* Site 级对象 */}
      <section>
        <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-text-2">
          <Truck className="h-3.5 w-3.5 text-cyan" />
          全场对象(不归属楼层)
        </div>
        <div className="space-y-1 rounded-md border border-line/60 bg-bg-panel-2/40 p-2 text-[11px]">
          {entrances.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-text-1">
              <DoorOpen className="h-3.5 w-3.5 shrink-0 text-orange" />
              <span className="truncate">{entrances.map((e) => e.name).join(' / ')}</span>
              <span className="min-w-0 flex-1 truncate text-[9px] text-text-3">出入口 · 带 WGS84 坐标(场外导航起点)</span>
            </div>
          )}
          {[...siteByType.entries()]
            .filter(([t]) => t !== 'SceneInOut' && t !== 'Building')
            .map(([t, v]) => (
              <div key={t} className="flex items-baseline gap-2">
                <span className="flex-1 truncate text-text-2">{v.label}</span>
                <span className="font-mono text-text-3">{v.count}</span>
              </div>
            ))}
        </div>
      </section>

      <p className="text-[9px] leading-relaxed text-text-3/70">
        连通图覆盖 3F-38F(场内导航可达域);1F/2F/B1F 与出入口未入图,导航自动降级示意路线。
        数据源:场景树实时解析(analyzeScenePack)。
      </p>
    </div>
  );
}
