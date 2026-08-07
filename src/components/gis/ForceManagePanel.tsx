'use client';
// 消防站执勤力量明细浮层(只读):右键环形菜单「力量明细」唤出,锚定在消防站图标上方。
// 只查看,不修改;tab 切换 人员/车辆/装备 重新拉取。
import { useEffect, useState } from 'react';
import { X, Users, Truck, Package, Loader2 } from 'lucide-react';
import type { ResourceItem } from '@/mock/types';
import { fetchStationForce } from '@/api/force';
import StatusBadge, { statusVariantOf } from '@/components/StatusBadge';

export interface ForcePanelStation {
  id: string;
  name: string;
  type: string;
}

/** 锚点(相对地图容器像素坐标),面板定位于消防站图标上方。 */
export interface ForcePanelAnchor {
  x: number;
  y: number;
  maxX: number;
}

const TABS = [
  { key: '人员', icon: Users, color: '#34d399' },
  { key: '车辆', icon: Truck, color: '#22d3ee' },
  { key: '装备', icon: Package, color: '#a78bfa' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

interface Props {
  station: ForcePanelStation;
  anchor: ForcePanelAnchor;
  onClose: () => void;
}

export default function ForceManagePanel({ station, anchor, onClose }: Props) {
  const [tab, setTab] = useState<TabKey>('人员');
  const [items, setItems] = useState<ResourceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(false);
    fetchStationForce(station.id, tab)
      .then((rs) => {
        if (alive) setItems(rs);
      })
      .catch(() => {
        if (alive) {
          setError(true);
          setItems([]);
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [station.id, tab]);

  return (
    <div
      className="absolute z-[600]"
      style={{
        left: Math.min(Math.max(anchor.x, 170), Math.max(anchor.maxX - 170, 170)),
        top: Math.max(anchor.y - 14, 8),
        transform: 'translate(-50%, -100%)',
      }}
    >
      <div className="flex max-h-[70vh] w-[320px] flex-col overflow-hidden rounded-lg border border-line bg-bg-panel/95 shadow-xl backdrop-blur">
        {/* 头部 */}
        <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
          <span className="truncate text-[14px] font-bold text-text-1">{station.name}</span>
          <span className="rounded border border-cyan/40 px-1.5 py-px text-[10px] text-cyan">{station.type}</span>
          <button onClick={onClose} className="ml-auto rounded p-0.5 text-text-3 transition hover:bg-white/10 hover:text-text-1">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        {/* tab */}
        <div className="flex gap-1 border-b border-line px-2 py-1.5">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = t.key === tab;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex flex-1 items-center justify-center gap-1 rounded px-2 py-1 text-[12px] transition ${
                  active ? 'bg-cyan/12 text-cyan' : 'text-text-3 hover:text-text-1'
                }`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: active ? undefined : t.color }} />
                {t.key}
                {!loading && <span className="text-[10px] text-text-3">{items.length}</span>}
              </button>
            );
          })}
        </div>
        {/* 列表(只读) */}
        <div className="max-h-[40vh] min-h-[80px] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center gap-1.5 py-8 text-[12px] text-text-3">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> 加载中…
            </div>
          ) : error ? (
            <div className="py-8 text-center text-[12px] text-red-300">加载失败</div>
          ) : items.length === 0 ? (
            <div className="py-8 text-center text-[12px] text-text-3">该站暂无{tab}明细</div>
          ) : (
            <ul className="divide-y divide-line/50">
              {items.map((r) => (
                <li key={r.id} className="flex items-center gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] text-text-1">{r.name}</div>
                    <div className="truncate text-[11px] text-text-3">{r.subtype}</div>
                  </div>
                  <StatusBadge label={r.status} variant={statusVariantOf(r.status)} pulse={r.status === '告警' || r.status === '离线'} />
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="border-t border-line px-3 py-1.5 text-[10px] text-text-3">只读明细 · 右键菜单唤出</div>
      </div>
    </div>
  );
}
