// 对抗舱纯辅助函数
import type { ConfrontationState } from './confront-store';

export function fmtT(tSec: number): string {
  const m = Math.floor(tSec / 60);
  const s = tSec % 60;
  return `T+${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function randInt(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}

/** 初步部署摘要（3 行） */
export function deployLines(s: NonNullable<ConfrontationState['seedScenario']>): string[] {
  return [
    `首调力量：城东/城西救援站 5 车 28 人`,
    `主战编队：${s.floor} 内攻一组 + 高喷车外部压制`,
    `进攻路线：首层东门 → 消防电梯 → ${s.floor}`,
  ];
}
