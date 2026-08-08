// 水源数据访问层:web /api/business/*(BFF 代理 znya)→ 映射为 WaterSource。
// 全量拉取已废弃(1.2w+ 记录):地图走 bbox 视口加载,面板走 stats 聚合 + 服务端分页,
// 周边高亮走 nearby 半径查询。
import type { FetchState, WaterSource } from '@/mock/types';
import { mapWaterSource, type ZnyaWaterSource } from '@/lib/water-mapper';
import { getJson, mutate, fetchAll } from '@/lib/http';

export interface WaterStats {
  total: number;
  by_type: Array<{ water_type: string; count: number }>;
  by_district: Array<{ district_code: string; count: number }>;
}

/** 全局聚合统计(面板卡片/区划树)。 */
export async function fetchWaterStats(): Promise<WaterStats> {
  return getJson<WaterStats>('/api/business/water-sources/stats');
}

export interface WaterBbox {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

/** 视口 bbox 内水源(单页上限 2000,视口内数据有界,超出时翻页拼齐)。 */
export async function fetchWaterSourcesInBbox(bbox: WaterBbox): Promise<WaterSource[]> {
  const q = `min_lng=${bbox.minLng}&min_lat=${bbox.minLat}&max_lng=${bbox.maxLng}&max_lat=${bbox.maxLat}`;
  const items = await fetchAll<ZnyaWaterSource>(`/api/business/water-sources?${q}`, 2000);
  return items.map(mapWaterSource);
}

export interface WaterCluster {
  lng: number;
  lat: number;
  count: number;
}

/** 视口网格聚合(中低 zoom 气泡):cell 为度,按 zoom 用 waterClusterCell 计算;
 * excludeDistricts 为面板"按区隐藏"的区划码,气泡统计随之排除。 */
export async function fetchWaterClusters(bbox: WaterBbox, cell: number, excludeDistricts?: string[]): Promise<WaterCluster[]> {
  let q = `min_lng=${bbox.minLng}&min_lat=${bbox.minLat}&max_lng=${bbox.maxLng}&max_lat=${bbox.maxLat}&cell=${cell}`;
  for (const d of excludeDistricts ?? []) q += `&exclude_district=${encodeURIComponent(d)}`;
  const res = await getJson<{ items: WaterCluster[] }>(`/api/business/water-sources/clusters?${q}`);
  return res.items ?? [];
}

export interface NearbyWaterSource extends WaterSource {
  distanceM: number;
}

/** 半径内水源,按距离升序(周边水源高亮)。lng/lat 为 GCJ02。 */
export async function fetchNearbyWaterSources(opts: {
  lng: number;
  lat: number;
  radius?: number;
  limit?: number;
}): Promise<NearbyWaterSource[]> {
  const { lng, lat, radius = 500, limit = 50 } = opts;
  const res = await getJson<{ items: Array<ZnyaWaterSource & { distance_m: number }> }>(
    `/api/business/water-sources/nearby?lng=${lng}&lat=${lat}&radius=${radius}&limit=${limit}`,
  );
  return (res.items ?? []).map((raw) => ({ ...mapWaterSource(raw), distanceM: raw.distance_m }));
}

export interface WaterQuery {
  districtCode?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

/** 服务端分页 + 区划/关键词过滤(面板清单)。 */
export async function fetchWaterSourcesPage(q: WaterQuery): Promise<{ items: WaterSource[]; total: number }> {
  const params = new URLSearchParams();
  if (q.districtCode) params.set('district_code', q.districtCode);
  if (q.keyword) params.set('keyword', q.keyword);
  params.set('page', String(q.page ?? 1));
  params.set('page_size', String(q.pageSize ?? 20));
  const res = await getJson<{ items: ZnyaWaterSource[]; total: number }>(
    `/api/business/water-sources?${params.toString()}`,
  );
  return { items: (res.items ?? []).map(mapWaterSource), total: res.total };
}

/** @deprecated 数据量已上万,全量拉取仅演示三态用;真实逻辑请用 bbox/stats/page/nearby。 */
export async function fetchWaterSources(state?: FetchState): Promise<WaterSource[]> {
  if (state === 'error') throw new Error('水源加载失败');
  if (state === 'empty') return [];
  const res = await fetchWaterSourcesPage({ page: 1, pageSize: 100 });
  return res.items;
}

// ---- 增删改(地图点位表单) ----

/** 新增水源(body 由 buildWaterPayload 组装,含 ref_type/ref_id)。 */
export async function createWaterSource(body: unknown): Promise<void> {
  await mutate('/api/business/water-sources/', 'POST', body);
}

export async function updateWaterSource(id: string, body: unknown): Promise<void> {
  await mutate(`/api/business/water-sources/${id}`, 'PUT', body);
}

export async function deleteWaterSource(id: string): Promise<void> {
  await mutate(`/api/business/water-sources/${id}`, 'DELETE');
}
