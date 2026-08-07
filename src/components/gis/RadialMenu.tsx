'use client';
// 放射状圆环菜单:点击重点单位/建筑 marker → 围绕锚点环形排列动作按钮(路线/修正/详情)。
// 给 marker 点击增加一层"摩擦",避免误触直接生成到场路线。
import type { LucideIcon } from 'lucide-react';

export interface RadialAction {
  key: string;
  icon: LucideIcon;
  label: string;
  color: string;
  onClick: () => void;
}

interface Props {
  x: number; // 容器像素坐标(marker 锚点底部)
  y: number;
  actions: RadialAction[];
  onClose: () => void;
}

const RADIUS = 56; // 圆环半径(px)

export default function RadialMenu({ x, y, actions, onClose }: Props) {
  const n = actions.length || 1;
  return (
    <>
      {/* 透明遮罩:点击外部关闭 */}
      <div className="absolute inset-0 z-[600]" onClick={onClose} />
      <div
        className="pointer-events-none absolute z-[610]"
        style={{ left: x, top: y, transform: 'translate(-50%, -100%)' }}
      >
        <div className="relative h-0 w-0">
          {actions.map((a, i) => {
            // 从正上方起顺时针均匀分布
            const angle = -Math.PI / 2 + (i / n) * 2 * Math.PI;
            const dx = Math.cos(angle) * RADIUS;
            const dy = Math.sin(angle) * RADIUS;
            const Icon = a.icon;
            return (
              <button
                key={a.key}
                onClick={(e) => {
                  e.stopPropagation();
                  a.onClick();
                }}
                className="pointer-events-auto absolute flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-0.5 rounded-full border bg-bg-panel/95 backdrop-blur transition hover:scale-110"
                style={{
                  left: dx,
                  top: dy,
                  borderColor: a.color,
                  color: a.color,
                  boxShadow: `0 0 12px ${a.color}55`,
                }}
                title={a.label}
              >
                <Icon className="h-4 w-4" />
                <span className="text-[9px] leading-none">{a.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
