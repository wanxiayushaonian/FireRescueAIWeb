'use client';

// 实战指挥·处置时间轴:选中案件的处置动作流水(选定/状态演进/派遣/到场/救援),
// 新在上,色点+时刻+标签。数据源 src/lib/case-timeline(会话级演示口径)。
import { useEffect, useState } from 'react';
import { getCaseTimeline, subscribeCaseTimeline, type CaseTimelineEntry } from '@/lib/case-timeline';

const KIND_META: Record<CaseTimelineEntry['kind'], { color: string; badge: string }> = {
  status: { color: '#22d3ee', badge: '状态' },
  dispatch: { color: '#a78bfa', badge: '派遣' },
  arrival: { color: '#34d399', badge: '到场' },
  rescue: { color: '#fbbf24', badge: '救援' },
  manual: { color: '#94a3b8', badge: '指挥' },
};

export default function IncidentTimeline({ incidentId }: { incidentId: string | null }) {
  const [entries, setEntries] = useState<readonly CaseTimelineEntry[]>(() =>
    incidentId ? getCaseTimeline(incidentId) : [],
  );
  useEffect(() => {
    const sync = (): void => setEntries(incidentId ? getCaseTimeline(incidentId) : []);
    sync();
    return subscribeCaseTimeline(sync);
  }, [incidentId]);

  if (!incidentId) {
    return <div className="py-6 text-center text-[12px] text-text-3">选中警情后记录处置动作 · 演示数据</div>;
  }
  if (entries.length === 0) {
    return <div className="py-6 text-center text-[12px] text-text-3">暂无处置记录,等待案件推进 · 演示数据</div>;
  }
  const ordered = [...entries].reverse(); // 新在上
  return (
    <div className="flex flex-col gap-0.5 overflow-y-auto p-2 [scrollbar-width:thin]">
      {ordered.map((e, i) => {
        const meta = KIND_META[e.kind];
        return (
          <div key={`${e.ts}-${i}`} className="flex items-start gap-2 rounded px-1 py-1 hover:bg-bg-panel-2/60">
            <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: meta.color }} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[10px] text-text-3">{e.ts}</span>
                <span
                  className="rounded border px-1 text-[9px] leading-4"
                  style={{ color: meta.color, borderColor: `${meta.color}66` }}
                >
                  {meta.badge}
                </span>
              </div>
              <div className="truncate text-[12px] text-text-2" title={e.label}>{e.label}</div>
              {e.detail && <div className="truncate text-[10px] text-text-3" title={e.detail}>{e.detail}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
