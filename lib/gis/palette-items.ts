// Ctrl/Cmd+K 命令面板条目构建(纯函数)。run 闭包由组件层附加,本模块只管数据。
import { Satellite, Map as MapIcon, MapPin, Trash2, PenLine, type LucideIcon } from 'lucide-react';

export interface PaletteActionDef {
  id: string;
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  group: '动作';
}

export function buildActionItems(s: { baseMap: 'vector' | 'satellite'; hasPlanned: boolean; drawMode: boolean }): PaletteActionDef[] {
  const items: PaletteActionDef[] = [
    { id: 'toggle-base', title: s.baseMap === 'vector' ? '切换卫星底图' : '切换矢量底图', icon: s.baseMap === 'vector' ? Satellite : MapIcon, group: '动作' },
    { id: 'batch-geocode', title: '批量补全坐标', subtitle: '给坐标缺失的重点单位地理编码', icon: MapPin, group: '动作' },
  ];
  if (s.hasPlanned) items.push({ id: 'clear-route', title: '清空到场路线', icon: Trash2, group: '动作' });
  items.push({ id: 'toggle-draw', title: s.drawMode ? '取消划定区域' : '划定区域', icon: PenLine, group: '动作' });
  return items;
}

export function filterActionItems(items: PaletteActionDef[], q: string): PaletteActionDef[] {
  return q ? items.filter((a) => a.title.includes(q) || a.id.includes(q)) : items;
}

/** 按名称(及可选 unitType)过滤,供命令面板搜索单位/建筑/水源等具名点位。 */
export function filterUnits<T extends { name: string; unitType?: string }>(units: T[], q: string, limit = 6): T[] {
  if (!q) return [];
  return units.filter((u) => u.name.includes(q) || (u.unitType ?? '').includes(q)).slice(0, limit);
}

export function buildAddressDefs(
  cs: Array<{ lng: number; lat: number; address: string; level: string }>,
  limit = 6,
): Array<{ id: string; title: string; subtitle: string; group: '地址' }> {
  return cs.slice(0, limit).map((c) => ({
    id: `addr-${c.lng}-${c.lat}`,
    title: c.address,
    subtitle: `${c.lng.toFixed(5)}, ${c.lat.toFixed(5)} · ${c.level}`,
    group: '地址' as const,
  }));
}
