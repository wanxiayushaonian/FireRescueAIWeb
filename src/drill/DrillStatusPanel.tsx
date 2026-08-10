'use client';

/**
 * DrillStatusPanel — 演练态势数值面板。
 *
 * 显示 DisasterState.getStatus() 的关键数值:
 * 火势等级 / 到场力量(站/车/人)/ 被困 / 已救 / 损伤 / 压制 / 救援 / clock。
 * MVP:数值显示,无 3D 内态势可视化。
 */
import type { ReactNode } from 'react';
import { Flame, Users, Truck, Shield, Wrench, Heart, Wind } from 'lucide-react';
import type { DisasterStatus } from '@/lib/drill/disaster-state';

export interface DrillStatusPanelProps {
  /** 当前态势快照(null=未启动)。 */
  readonly status: DisasterStatus | null;
}

/** 火势等级文本(0=熄灭 ~ 4=猛烈)。 */
function fireLevelText(level: number): string {
  return ['熄灭', '初起', '发展', '猛烈', '失控'][level] ?? `等级${level}`;
}

/** 火势等级颜色。 */
function fireLevelColor(level: number): string {
  if (level <= 0) return 'text-green';
  if (level <= 1) return 'text-amber';
  if (level <= 2) return 'text-orange';
  return 'text-red';
}

export function DrillStatusPanel({ status }: DrillStatusPanelProps) {
  if (!status) {
    return (
      <div className="p-4 text-center text-xs text-text-3">
        点击「启动」开始演练推演
      </div>
    );
  }

  const { availableForces: forces } = status;

  return (
    <div className="p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-text-2">态势面板</span>
        <span className="font-mono text-[11px] text-text-3">T+{status.clock}</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {/* 火势等级 */}
        <Metric
          icon={<Flame className="h-3.5 w-3.5" />}
          label="火势等级"
          value={fireLevelText(status.fireLevel)}
          valueClass={fireLevelColor(status.fireLevel)}
        />

        {/* 建筑损伤 */}
        <Metric
          icon={<Wrench className="h-3.5 w-3.5" />}
          label="建筑损伤"
          value={`${(status.buildingDamage * 100).toFixed(1)}%`}
          valueClass={status.buildingDamage > 0.5 ? 'text-red' : 'text-text-1'}
        />

        {/* 到场:站 */}
        <Metric
          icon={<Shield className="h-3.5 w-3.5" />}
          label="到场站"
          value={`${forces.stations}`}
        />

        {/* 到场:车 */}
        <Metric
          icon={<Truck className="h-3.5 w-3.5" />}
          label="到场车"
          value={`${forces.vehicles}`}
        />

        {/* 到场:人 */}
        <Metric
          icon={<Users className="h-3.5 w-3.5" />}
          label="到场人"
          value={`${forces.personnel}`}
        />

        {/* 被困 */}
        <Metric
          icon={<Users className="h-3.5 w-3.5" />}
          label="被困"
          value={`${status.trappedCount}`}
          valueClass={status.trappedCount > 0 ? 'text-orange' : 'text-green'}
        />
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        {/* 已救 */}
        <Metric
          icon={<Heart className="h-3.5 w-3.5" />}
          label="已救出"
          value={`${status.rescuedCount}`}
          valueClass="text-green"
        />

        {/* 风向 */}
        <Metric
          icon={<Wind className="h-3.5 w-3.5" />}
          label="风向/风速"
          value={`${status.windDirection}° / ${status.windSpeed}m/s`}
        />
      </div>

      {/* 战术状态徽章 */}
      <div className="mt-2 flex gap-1.5">
        <Badge active={status.suppressionActive} label="压制中" activeClass="bg-cyan/15 text-cyan" />
        <Badge active={status.rescueActive} label="救援中" activeClass="bg-green/15 text-green" />
      </div>
    </div>
  );
}

// ---- 内部辅助组件 ----

interface MetricProps {
  readonly icon: ReactNode;
  readonly label: string;
  readonly value: string;
  readonly valueClass?: string;
}

function Metric({ icon, label, value, valueClass = 'text-text-1' }: MetricProps) {
  return (
    <div className="flex items-center gap-2 rounded border border-line bg-bg-deep/60 px-2.5 py-1.5">
      <span className="text-text-3">{icon}</span>
      <div className="min-w-0">
        <div className="text-[10px] leading-tight text-text-3">{label}</div>
        <div className={`truncate text-sm font-bold leading-tight ${valueClass}`}>
          {value}
        </div>
      </div>
    </div>
  );
}

interface BadgeProps {
  readonly active: boolean;
  readonly label: string;
  readonly activeClass: string;
}

function Badge({ active, label, activeClass }: BadgeProps) {
  return (
    <span
      className={`rounded px-2 py-0.5 text-[10px] font-semibold transition-colors ${
        active ? activeClass : 'bg-bg-deep text-text-3'
      }`}
    >
      {label}
    </span>
  );
}

export default DrillStatusPanel;
