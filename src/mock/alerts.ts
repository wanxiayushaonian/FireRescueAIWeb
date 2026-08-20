// 顶栏告警 Mock 数据
// fetch 风格同 design.md §4：Promise + 300-800ms 延迟 + state 演示参数，
// 作为后续真实告警数据替换点。
import type { FetchState } from './types';

export interface AlertItem {
  id: string;
  title: string;            // 告警标题，如「金茂大厦 5F 烟感 YG-0512 告警」
  level: 'critical' | 'warning'; // 级别：critical=红 / warning=琥珀
  levelLabel: string;       // 级别徽标文案
  time: string;             // 告警时间 HH:MM:SS
  facility: string;         // 告警设施（highlight 目标）
  buildingId: string;       // 建筑 id（topbar:open-alert detail 用）
  floor: string;            // 楼层（topbar:open-alert detail 用）
}

export const ALERTS: AlertItem[] = [
  {
    id: 'al-yg-0512',
    title: '金茂大厦 5F 烟感 YG-0512 告警',
    level: 'critical',
    levelLabel: '紧急',
    time: '09:42:18',
    facility: '烟感 YG-0512',
    buildingId: 'jm',
    floor: '5F',
  },
  {
    id: 'al-sba-0507',
    title: '金茂大厦 5F 手动报警装置 SBA-0507 离线',
    level: 'warning',
    levelLabel: '关注',
    time: '09:37:05',
    facility: '手动报警装置 SBA-0507',
    buildingId: 'jm',
    floor: '5F',
  },
];

function delay(): Promise<void> {
  return new Promise((r) => setTimeout(r, 300 + Math.random() * 500));
}

/** 三态演示：state='error' 抛错、'empty' 返回空数组，否则返回 ALERTS */
export async function fetchAlerts(state?: FetchState): Promise<AlertItem[]> {
  await delay();
  if (state === 'error') throw new Error('演示：模拟告警请求失败');
  if (state === 'empty') return [];
  return ALERTS;
}
