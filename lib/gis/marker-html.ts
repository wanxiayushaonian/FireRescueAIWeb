// marker 图标 HTML 组装(纯函数)。重点单位:警情态(圆环+等级) > 风险角标 > 裸图标,互斥且警情优先。
import { keyUnitIconSvg } from '../map-icons';

/** 高风险单位类型关键词(用于风险角标)。 */
export const HIGH_RISK_PATTERN = /高层|化工|危化|超高层|大空间|地下/;

export function keyUnitMarkerHtml(opts: {
  unitType: string;
  status?: string;
  incidentLevel?: number | null;
  highRisk?: boolean;
}): string {
  const base = keyUnitIconSvg(opts.unitType, opts.status ?? '');
  if (opts.incidentLevel != null) {
    return `<div class="unit-incident-wrap">${base}<span class="unit-incident-ring-base"></span><span class="unit-incident-ring" data-level="${opts.incidentLevel}"></span><span class="unit-incident-level">${opts.incidentLevel}</span></div>`;
  }
  if (opts.highRisk) {
    return `<div class="unit-risk-wrap">${base}<span class="unit-risk-badge" title="高风险">!</span></div>`;
  }
  return base;
}

/** 独立警情 marker(红色脉冲点位 + 等级数字)。 */
export function incidentMarkerHtml(level: number): string {
  return `<div class="incident-marker" data-level="${level}">${level}</div>`;
}
