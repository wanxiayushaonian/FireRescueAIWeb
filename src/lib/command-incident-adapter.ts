// 实战指挥:真实警情(mapper.Incident)→ 面板消费(mock.Incident)适配器。
// 单向:真实→面板格式。mock.Incident 面板不用 level(用 DisasterVars.fireLevel);
// mock 状态机依赖 statusHistory/caller,真实数据补齐这些字段以兼容面板渲染。
import type { Incident as RealIncident } from '@/lib/incident-mapper';
import type { Incident as MockIncident, IncidentStatus } from '@/mock/incidents';
import { nowTime } from '@/mock/incidents';

/** 真实 incidentType(自由文本)→ mock 三分类。 */
function mapType(incidentType: string): MockIncident['type'] {
  const t = incidentType || '';
  if (/危化|化工|泄漏|气体|易燃|爆炸/.test(t)) return '危化品';
  if (/火|燃烧|建筑|冒烟/.test(t)) return '建筑火灾';
  return '抢险救援';
}

/** 真实 status(自由文本,DB:接警/出动/到场/控制/结束)→ mock 枚举(结束→熄灭)。 */
function mapStatus(status: string): IncidentStatus {
  const s = status || '';
  if (/结束|完成|结案|灭|处置完毕/.test(s)) return '熄灭';
  if (/控制/.test(s)) return '控制';
  if (/到场/.test(s)) return '到场';
  if (/出动|派遣|出警/.test(s)) return '出动';
  return '接警'; // 默认接警(含未识别)
}

/** ISO 时间 → HH:MM:SS(mock relativeTime 解析用);失败回退当前时间。 */
function toClock(iso?: string): string {
  if (!iso) return nowTime();
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return nowTime();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** 真实警情 → 面板可消费的 mock 警情(补 type/caller/receivedAt/statusHistory)。 */
export function toMockIncident(r: RealIncident): MockIncident {
  const receivedAt = toClock(r.occurredAt);
  const status = mapStatus(r.status);
  return {
    id: r.id,
    address: r.address,
    type: mapType(r.incidentType),
    caller: '联动接入',
    status,
    receivedAt,
    statusHistory: [{ status, ts: receivedAt }],
    lng: r.lng,
    lat: r.lat,
  };
}

/** 批量适配(供 CommandView fetchIncidents 后转换)。 */
export function toMockIncidents(list: RealIncident[]): MockIncident[] {
  return list.map(toMockIncident);
}
