// lib/gis/popup-html.ts
// 各图层 popup HTML 模板(纯函数,node 可测)。从 RealGisMap.tsx 逐字搬出;
// 站/水入参用结构类型,避免 lib 依赖 src/mock/types(vitest '@' 别名解析不到 src)。
import type { KeyUnit } from '../key-unit-mapper';
import type { KeyBuilding } from '../key-building-mapper';
import type { Incident } from '../incident-mapper';

/** 重点单位 popup:基础信息 + 微型站统计 + 已建模标记。 */
export function popupForKeyUnit(u: KeyUnit): string {
  const micro = u.extra;
  const microLines = [
    micro.has_micro_station ? `微型站 ${micro.has_micro_station}` : '',
    micro.duty_24h ? `24h执勤 ${micro.duty_24h}` : '',
    micro.total_people ? `总人数 ${micro.total_people}` : '',
    micro.has_equipment ? `器材 ${micro.has_equipment}` : '',
    micro.has_control_room ? `控制室 ${micro.has_control_room}` : '',
  ].filter(Boolean);
  const built = u.status === 'completed' ? '<br/><span style="color:#fbbf24">★ 已 3D 建模</span>' : '';
  return (
    `<b>${u.name}</b><br/>${u.unitType} · ${u.district ?? ''}` +
    `<br/>负责人 ${u.contactName ?? '-'}${u.contactPhone ? ` · ${u.contactPhone}` : ''}` +
    (microLines.length ? `<br/>${microLines.join(' · ')}` : '') +
    `${built}<br/>${u.lng.toFixed(5)}, ${u.lat.toFixed(5)}(GCJ02)`
  );
}

/** 重点建筑 popup:类型/用途 + 所属单位 + 已建模标记。 */
export function popupForKeyBuilding(b: KeyBuilding, unitName?: string): string {
  const built = b.status === 'completed' ? '<br/><span style="color:#fbbf24">★ 已 3D 建模</span>' : '';
  return (
    `<b>${b.name}</b><br/>重点建筑${b.buildingType ? ` · ${b.buildingType}` : ''}` +
    `${b.buildingUsage ? `<br/>${b.buildingUsage}` : ''}` +
    `${unitName ? `<br/>所属单位: ${unitName}` : ''}` +
    `${built}<br/>${b.lng.toFixed(5)}, ${b.lat.toFixed(5)}`
  );
}

/** 单位 popup 追加的警情行(有活跃警情时)。 */
export function popupIncidentSuffix(inc: Incident): string {
  return `<br/><span style="color:#ef4444">⚠ 警情:${inc.incidentType} · ${inc.level} 级 · ${inc.status}${inc.description ? `(${inc.description})` : ''}</span>`;
}

export function popupForStation(
  s: { name: string; type: string; address: string; lng: number; lat: number },
  personnel: number,
): string {
  return `<b>${s.name}</b><br/>${s.type} · 在位 ${personnel} 人<br/>${s.address}<br/>${s.lng.toFixed(5)}, ${s.lat.toFixed(5)}(GCJ02)`;
}

export function popupForWater(w: { name: string; type: string; district: string; address: string; lng: number; lat: number }): string {
  return `<b>${w.name}</b><br/>${w.type} · ${w.district}<br/>${w.address}<br/>${w.lng.toFixed(5)}, ${w.lat.toFixed(5)}(GCJ02)`;
}

export function popupForIncident(i: Incident): string {
  return (
    `<b>⚠ ${i.address}</b><br/>${i.incidentType} · ${i.level} 级 · ${i.status}` +
    `${i.description ? `<br/>${i.description}` : ''}<br/>${i.lng.toFixed(5)}, ${i.lat.toFixed(5)}`
  );
}
