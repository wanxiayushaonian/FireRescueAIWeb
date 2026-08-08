// 警情数据访问层:web /api/business/incidents(BFF 代理 znya)→ Incident 点位。
import { mapIncident, type ZnyaIncident, type Incident } from '@/lib/incident-mapper';
import { fetchAll } from '@/lib/http';

export async function fetchIncidents(): Promise<Incident[]> {
  const items = await fetchAll<ZnyaIncident>('/api/business/incidents');
  return items.map(mapIncident).filter((x): x is Incident => x !== null);
}
